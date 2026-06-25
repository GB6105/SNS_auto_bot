// US-12: 로컬 파이프라인 오케스트레이터. 캘린더→카피→이미지→슬롯→체크리스트→저장→승인대기.
// 생성은 완전 자동, 승인 게이트(awaiting_approval)에서 멈춤(PRD §10).
import type { CalendarItem, GeneratedCopy, Pillar, Platform, ThreadTone } from "../domain/types.js";
import { assignTopics, buildCalendar, itemsForDate } from "../domain/calendar.js";
import { pickTopic } from "../domain/pillars.js";
import type { LLM } from "../generation/llm.js";
import { generateCardCopy, generateThreadCopy } from "../generation/copywriter.js";
import { runChecklist, type ChecklistReport } from "../guardrail/checklist.js";
import { toSlots, type CopySlot, type DesignAdapter } from "../design/slots.js";
import type { ImageRenderer, RenderedImage } from "../design/renderer.js";
import { transition, systemClock, type Clock } from "../publish/approval.js";
import type { Notifier, ApprovalPreview } from "../publish/telegram.js";
import { recordId, type ContentRecord, type Store } from "../store/store.js";

export interface PreparedItem {
  item: CalendarItem;
  copy: GeneratedCopy;
  checklist: ChecklistReport;
  slots?: CopySlot[];
  images?: RenderedImage[];
  designRef?: string;
  status: "awaiting_approval";
}

export interface Deps {
  llm: LLM;
  notifier: Notifier;
  design?: DesignAdapter; // 슬롯 JSON 출력(범용)
  renderer?: ImageRenderer; // 실제 카드 이미지 렌더(SVG/PNG)
  store?: Store; // 상태 영속화
  clock?: Clock; // awaitingSince 기록(기본 systemClock)
}

/**
 * 하루치 항목을 생성·렌더·검사·저장하고 승인 알림까지 보낸 뒤 멈춘다.
 * 결정적(stub LLM 기준). 승인 게이트를 넘지 않는다(게시는 사람 승인 후 webhook).
 */
export async function prepareForDate(
  startIso: string,
  targetIso: string,
  deps: Deps,
  days = 14,
): Promise<PreparedItem[]> {
  const clock = deps.clock ?? systemClock;
  const calendar = assignTopics(buildCalendar(startIso, days));
  const todays = itemsForDate(calendar, targetIso);
  const out: PreparedItem[] = [];
  for (const item of todays) {
    const prepared = await prepareOne(item, deps, clock);
    if (prepared) out.push(prepared);
  }
  return out;
}

/** 온디맨드 옵션 — 텔레그램 `/ig`·`/threads` 명령에서 사용. */
export interface AdhocOpts {
  date: string;
  pillar?: Pillar; // 인스타 기둥(미지정 시 empathy)
  tone?: ThreadTone; // 스레드 톤(미지정 시 serious)
  topic?: string;
}

/**
 * 스케줄과 무관하게 플랫폼 1건을 즉시 생성·렌더·검수·저장·알림한다(승인 게이트에서 멈춤).
 * 텔레그램에서 언제든 호출할 수 있는 단발 생성 경로.
 */
export async function prepareAdhoc(platform: Platform, opts: AdhocOpts, deps: Deps): Promise<PreparedItem | null> {
  const clock = deps.clock ?? systemClock;
  let item: CalendarItem;
  if (platform === "instagram") {
    const pillar = opts.pillar ?? "empathy";
    item = { date: opts.date, platform, pillar, topic: opts.topic ?? pickTopic(pillar, opts.date), status: "planned" };
  } else {
    item = { date: opts.date, platform, tone: opts.tone ?? "serious", status: "planned" };
  }
  return prepareOne(item, deps, clock);
}

/** 캘린더 항목 1건을 생성→렌더→검수→알림→저장. 처리 불가(불완전 항목)면 null. */
async function prepareOne(item: CalendarItem, deps: Deps, clock: Clock): Promise<PreparedItem | null> {
  let status = transition(item.status, "generate"); // generated

  let copy: GeneratedCopy;
  let slots: CopySlot[] | undefined;
  let images: RenderedImage[] | undefined;
  let designRef: string | undefined;

  if (item.platform === "instagram" && item.pillar) {
    const card = await generateCardCopy(deps.llm, item.pillar, item.topic ?? "흐릿한 목표를 첫 행동으로");
    copy = { kind: "ig_card", copy: card };
    slots = toSlots(card);
    if (deps.design) {
      const r = await deps.design.render(slots, { date: item.date, topic: item.topic });
      designRef = r.ref;
      slots = r.slots;
    }
    if (deps.renderer) {
      images = await deps.renderer.render(card, { date: item.date });
    }
  } else if (item.platform === "threads" && item.tone) {
    const thread = await generateThreadCopy(deps.llm, item.tone);
    copy = { kind: "thread", copy: thread };
  } else {
    return null;
  }

  const checklist = runChecklist(copy);
  status = transition(status, "request_approval"); // awaiting_approval

  const id = recordId(item.date, item.platform, item.pillar ?? item.tone ?? "x");
  const preview: ApprovalPreview = { date: item.date, copy, checklist, id };
  if (designRef !== undefined) preview.designRef = designRef;
  else if (images && images.length > 0) preview.designRef = images.map((i) => i.path).join(", ");
  if (images && images.length > 0) preview.images = images.map((i) => ({ path: i.path, mime: i.mime }));
  await deps.notifier.notify(preview);

  // 영속화
  if (deps.store) {
    const rec: ContentRecord = {
      id,
      date: item.date,
      platform: item.platform,
      copy,
      checklist,
      status: "awaiting_approval",
      awaitingSinceMs: clock.now(),
      reminded: false,
    };
    if (item.pillar) rec.pillar = item.pillar;
    if (item.tone) rec.tone = item.tone;
    if (item.topic) rec.topic = item.topic;
    if (slots) rec.slots = slots;
    if (images) rec.images = images;
    await deps.store.upsert(rec);
  }

  const prepared: PreparedItem = { item, copy, checklist, status: "awaiting_approval" };
  if (slots !== undefined) prepared.slots = slots;
  if (images !== undefined) prepared.images = images;
  if (designRef !== undefined) prepared.designRef = designRef;
  return prepared;
}
