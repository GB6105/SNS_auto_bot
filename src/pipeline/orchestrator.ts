// US-12: 로컬 파이프라인 오케스트레이터. 캘린더→카피→슬롯→체크리스트→승인대기.
// 생성은 완전 자동, 승인 게이트(awaiting_approval)에서 멈춤(PRD §10).
import type { CalendarItem, GeneratedCopy } from "../domain/types.js";
import { assignTopics, buildCalendar, itemsForDate } from "../domain/calendar.js";
import type { LLM } from "../generation/llm.js";
import { generateCardCopy, generateThreadCopy } from "../generation/copywriter.js";
import { runChecklist, type ChecklistReport } from "../guardrail/checklist.js";
import { toSlots, type CopySlot, type DesignAdapter } from "../design/slots.js";
import { transition } from "../publish/approval.js";
import type { Notifier, ApprovalPreview } from "../publish/telegram.js";

export interface PreparedItem {
  item: CalendarItem;
  copy: GeneratedCopy;
  checklist: ChecklistReport;
  slots?: CopySlot[];
  designRef?: string;
  /** 상태: planned→generated→awaiting_approval 까지 진행(게시는 사람 승인 후) */
  status: "awaiting_approval";
}

export interface Deps {
  llm: LLM;
  notifier: Notifier;
  design?: DesignAdapter;
}

/**
 * 하루치 항목을 생성·검사·슬롯화하고 승인 알림까지 보낸 뒤 멈춘다.
 * 결정적(stub LLM 기준). 승인 게이트를 넘지 않는다.
 */
export async function prepareForDate(
  startIso: string,
  targetIso: string,
  deps: Deps,
  days = 14,
): Promise<PreparedItem[]> {
  const calendar = assignTopics(buildCalendar(startIso, days));
  const todays = itemsForDate(calendar, targetIso);
  const out: PreparedItem[] = [];

  for (const item of todays) {
    // planned → generated
    let status = transition(item.status, "generate"); // "generated"

    let copy: GeneratedCopy;
    let slots: CopySlot[] | undefined;
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
    } else if (item.platform === "threads" && item.tone) {
      const thread = await generateThreadCopy(deps.llm, item.tone);
      copy = { kind: "thread", copy: thread };
    } else {
      continue; // 불완전 항목 스킵
    }

    const checklist = runChecklist(copy);

    // generated → awaiting_approval
    status = transition(status, "request_approval"); // "awaiting_approval"

    const preview: ApprovalPreview = { date: item.date, copy, checklist };
    if (designRef !== undefined) preview.designRef = designRef;
    await deps.notifier.notify(preview);

    const prepared: PreparedItem = { item, copy, checklist, status: "awaiting_approval" };
    if (slots !== undefined) prepared.slots = slots;
    if (designRef !== undefined) prepared.designRef = designRef;
    out.push(prepared);
  }

  return out;
}
