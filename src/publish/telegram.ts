// US-9: 텔레그램 승인 봇 어댑터(Notifier). 외부 토큰 필요 → stub 우선.
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { GeneratedCopy } from "../domain/types.js";
import { PILLAR_LABEL, THREAD_TONE_LABEL } from "../domain/types.js";
import type { ChecklistReport } from "../guardrail/checklist.js";
import { TelegramApi } from "./telegram-api.js";

export interface ApprovalPreview {
  date: string;
  copy: GeneratedCopy;
  checklist: ChecklistReport;
  designRef?: string;
  /** 렌더된 카드 이미지 — 텔레그램 앨범 첨부용(PNG/JPEG만 인라인 렌더, SVG는 자동 제외) */
  images?: Array<{ path: string; mime: string }>;
  /** 레코드 id — inline 버튼 callback_data에 인코딩(웹훅이 어떤 항목인지 식별) */
  id?: string;
}

export interface NotifyResult {
  delivered: boolean;
  channel: string;
  messageId?: string;
}

/** 승인 알림 채널 인터페이스 */
export interface Notifier {
  readonly name: string;
  notify(preview: ApprovalPreview): Promise<NotifyResult>;
}

/** 미리보기 → 게시될 콘텐츠 전문을 텔레그램에서 그대로 읽도록 (PRD §UI/UX: ⚠️+라벨) */
export function formatPreview(p: ApprovalPreview): string {
  const lines: string[] = [];
  if (p.copy.kind === "ig_card") {
    const c = p.copy.copy;
    lines.push(`📸 인스타 카드뉴스 · ${p.date} · ${c.cards.length}장`);
    lines.push("");
    // 카드 슬라이드 전문 — 1번 헤드라인, 마지막 CTA, 가운데 본문
    c.cards.forEach((text, i) => {
      const tag = i === 0 ? "표지" : i === c.cards.length - 1 ? "CTA" : `${i + 1}컷`;
      lines.push(`【${tag}】 ${text}`);
    });
    lines.push("");
    lines.push("— 캡션 —");
    lines.push(c.caption);
    // 캡션에 해시태그가 이미 없을 때만 별도 줄로 덧붙임(중복 방지)
    const tags = c.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`));
    if (tags.length && !tags.some((t) => c.caption.includes(t))) lines.push(tags.join(" "));
    if (c.disclaimer) lines.push(`\n${c.disclaimer}`);
  } else {
    lines.push(`🧵 스레드 · ${p.date} · ${THREAD_TONE_LABEL[p.copy.copy.tone]}`);
    lines.push("");
    lines.push(p.copy.copy.text);
  }

  // 체크리스트 경고를 상단에 눈에 띄게 (색만으로 구분 금지 → ⚠️ + 라벨)
  if (p.checklist.hasWarning) {
    lines.push("");
    for (const r of p.checklist.results) {
      if (r.status === "warn") lines.push(`⚠️ ${r.label}: ${r.evidence.join(", ")}`);
    }
  } else {
    lines.push("\n✅ 검수 통과 (경고 없음)");
  }
  if (p.designRef) lines.push(`\n🎨 슬롯: ${p.designRef}`);
  lines.push("\n[게시] · [수정] · [폐기]");
  return lines.join("\n");
}

/** inline 버튼 정의 — callback_data에 `<action>:<id>` 인코딩 */
export function buildApprovalKeyboard(id: string): Array<{ text: string; callback_data: string }> {
  return [
    { text: "✅ 게시", callback_data: `approve:${id}` },
    { text: "✏️ 수정", callback_data: `revise:${id}` },
    { text: "🗑 폐기", callback_data: `discard:${id}` },
  ];
}

/** 콘솔 stub — 토큰 없을 때 사용(개발/테스트가 외부 설정 없이 동작) */
export class ConsoleNotifier implements Notifier {
  readonly name = "console";
  constructor(private readonly sink: (msg: string) => void = (m) => console.log(m)) {}
  async notify(preview: ApprovalPreview): Promise<NotifyResult> {
    this.sink(formatPreview(preview));
    return { delivered: true, channel: "console" };
  }
}

/** 실제 텔레그램 봇 — TELEGRAM_BOT_TOKEN + chat_id 필요 */
export class TelegramNotifier implements Notifier {
  readonly name = "telegram";
  // RALPH-BLOCKER: 실발송은 TELEGRAM_BOT_TOKEN + chat_id 필요(외부 설정). 없으면 ConsoleNotifier 사용.
  private readonly api: TelegramApi;
  constructor(token: string, private readonly chatId: string, fetchFn: typeof fetch = fetch) {
    this.api = new TelegramApi(token, fetchFn);
  }

  async notify(preview: ApprovalPreview): Promise<NotifyResult> {
    // 1) 렌더된 카드 이미지(PNG/JPEG)가 있으면 앨범으로 먼저 — 텔레그램은 SVG 인라인 불가라 제외
    const renderable = (preview.images ?? []).filter((i) => i.mime === "image/png" || i.mime === "image/jpeg");
    if (renderable.length > 0) {
      try {
        const photos = await Promise.all(
          renderable.slice(0, 10).map(async (i) => ({ bytes: await readFile(i.path), filename: basename(i.path), mime: i.mime })),
        );
        await this.api.sendMediaGroup(this.chatId, photos);
      } catch {
        /* 이미지 전송 실패는 무시 — 텍스트 미리보기는 계속 보낸다 */
      }
    }
    // 2) 전문 텍스트 + 승인 버튼
    const messageId = await this.api.sendMessage(
      this.chatId,
      formatPreview(preview),
      buildApprovalKeyboard(preview.id ?? preview.date),
    );
    return { delivered: true, channel: "telegram", messageId: String(messageId) };
  }
}

/** env에서 Telegram API 클라이언트 생성(토큰 없으면 null) */
export function makeTelegramApi(): TelegramApi | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  return token ? new TelegramApi(token) : null;
}

/** 환경에 맞는 Notifier 선택 */
export function makeNotifier(): Notifier {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  return token && chatId ? new TelegramNotifier(token, chatId) : new ConsoleNotifier();
}

// PILLAR_LABEL 재노출(미리보기 확장 시 사용)
export { PILLAR_LABEL };
