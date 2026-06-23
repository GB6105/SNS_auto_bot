// US-9: 텔레그램 승인 봇 어댑터(Notifier). 외부 토큰 필요 → stub 우선.
import type { GeneratedCopy } from "../domain/types.js";
import { PILLAR_LABEL, THREAD_TONE_LABEL } from "../domain/types.js";
import type { ChecklistReport } from "../guardrail/checklist.js";

export interface ApprovalPreview {
  date: string;
  copy: GeneratedCopy;
  checklist: ChecklistReport;
  designRef?: string;
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

/** 미리보기 → 사람이 5초에 읽는 텍스트 (PRD §UI/UX: ⚠️+라벨, 본문 요약) */
export function formatPreview(p: ApprovalPreview): string {
  const lines: string[] = [];
  if (p.copy.kind === "ig_card") {
    lines.push(`📸 인스타 카드뉴스 · ${p.date}`);
    lines.push(`기둥: ${p.copy.copy.cards.length}장`);
    lines.push(`헤드라인: ${p.copy.copy.cards[0]}`);
    lines.push(`캡션 첫 줄: ${p.copy.copy.caption.split("\n")[0]}`);
  } else {
    lines.push(`🧵 스레드 · ${p.date} · ${THREAD_TONE_LABEL[p.copy.copy.tone]}`);
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
  constructor(private readonly token: string, private readonly chatId: string) {}

  async notify(preview: ApprovalPreview): Promise<NotifyResult> {
    const res = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: this.chatId,
        text: formatPreview(preview),
        reply_markup: { inline_keyboard: [buildApprovalKeyboard(preview.id ?? preview.date)] },
      }),
    });
    if (!res.ok) throw new Error(`Telegram ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { result?: { message_id?: number } };
    return { delivered: true, channel: "telegram", messageId: String(data.result?.message_id ?? "") };
  }
}

/** 환경에 맞는 Notifier 선택 */
export function makeNotifier(): Notifier {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  return token && chatId ? new TelegramNotifier(token, chatId) : new ConsoleNotifier();
}

// PILLAR_LABEL 재노출(미리보기 확장 시 사용)
export { PILLAR_LABEL };
