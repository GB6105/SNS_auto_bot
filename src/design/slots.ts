// US-7: pencil.dev 카피 슬롯 계약 + DesignAdapter. 결정: 범용 슬롯 JSON.
// Devil#6 반영: role 기반(slotId는 매핑 테이블로 분리) → 매주 디자인 교체 흡수.
import type { CardCopy } from "../domain/types.js";

export type SlotRole = "headline" | "body" | "cta" | "disclaimer";

/** pencil.dev에 전달되는 범용 슬롯 한 칸 */
export interface CopySlot {
  slotId: string; // 디자인 템플릿의 실제 슬롯 키 (매핑으로 결정)
  role: SlotRole;
  text: string;
  maxChars: number;
  overflow: boolean; // text가 maxChars 초과 여부 (경고)
}

/** role별 권장 글자수 상한 (디자인 가독성 — text 면적 20% 규칙 보조) */
export const ROLE_MAX_CHARS: Record<SlotRole, number> = {
  headline: 24,
  body: 40,
  cta: 20,
  disclaimer: 60,
};

/**
 * slotId 매핑 테이블. 디자인이 매주 바뀌면 이 매핑만 갱신한다(Devil#6).
 * 기본 매핑: card-{index}, caption은 별도.
 */
export interface SlotMapping {
  headline: string;
  body: (index: number) => string; // 0-based body 카드 인덱스
  cta: string;
  disclaimer: string;
}

export const DEFAULT_MAPPING: SlotMapping = {
  headline: "card-1-headline",
  body: (i) => `card-${i + 2}-body`,
  cta: "card-last-cta",
  disclaimer: "card-disclaimer",
};

function slot(slotId: string, role: SlotRole, text: string): CopySlot {
  const maxChars = ROLE_MAX_CHARS[role];
  return { slotId, role, text, maxChars, overflow: [...text].length > maxChars };
}

/**
 * CardCopy → 범용 슬롯 배열.
 * cards[0]=headline, cards[1..n-2]=body, cards[n-1]=cta, disclaimer 별도.
 */
export function toSlots(copy: CardCopy, mapping: SlotMapping = DEFAULT_MAPPING): CopySlot[] {
  const slots: CopySlot[] = [];
  const { cards } = copy;
  slots.push(slot(mapping.headline, "headline", cards[0] ?? ""));
  for (let i = 1; i < cards.length - 1; i++) {
    slots.push(slot(mapping.body(i - 1), "body", cards[i]));
  }
  if (cards.length >= 2) slots.push(slot(mapping.cta, "cta", cards[cards.length - 1]));
  if (copy.disclaimer) slots.push(slot(mapping.disclaimer, "disclaimer", copy.disclaimer));
  return slots;
}

/** maxChars를 넘는 슬롯만 추림(경고용) */
export function overflowSlots(slots: CopySlot[]): CopySlot[] {
  return slots.filter((s) => s.overflow);
}

/** 디자인 어댑터 인터페이스 — pencil.dev 연결 방식이 정해지면 구현 교체 */
export interface DesignAdapter {
  readonly name: string;
  /** 슬롯을 디자인에 적용하고 이미지 산출물 참조(경로/URL)를 반환 */
  render(slots: CopySlot[], meta: { date: string; topic?: string }): Promise<{ ref: string; slots: CopySlot[] }>;
}

/**
 * 기본 어댑터: 미연결 상태. 슬롯 JSON을 파일로 출력해 수동/외부 연결을 돕는다.
 * RALPH-BLOCKER: pencil.dev 실제 연결(API/export/수동) 미확정 → 이 어댑터로 대체.
 */
export class FileDesignAdapter implements DesignAdapter {
  readonly name = "file";
  constructor(private readonly writeFile: (path: string, data: string) => Promise<void>, private readonly outDir: string) {}

  async render(slots: CopySlot[], meta: { date: string; topic?: string }): Promise<{ ref: string; slots: CopySlot[] }> {
    const path = `${this.outDir}/slots-${meta.date}.json`;
    await this.writeFile(path, JSON.stringify({ meta, slots }, null, 2));
    return { ref: path, slots };
  }
}
