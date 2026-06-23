// 공통 도메인 타입. PRD §5 콘텐츠 시스템 + §6 스토리 기반.

/** 콘텐츠 기둥 4종 (PRD §콘텐츠 기둥) */
export type Pillar = "empathy" | "tip" | "before_after" | "build_in_public";

/** 플랫폼 */
export type Platform = "instagram" | "threads";

/** 스레드 요일 톤 (PRD §발행 리듬 — 스레드) */
export type ThreadTone = "serious" | "casual_promo" | "question" | "empathy_short";

/** 한국어 라벨 매핑 (미리보기/로그용) */
export const PILLAR_LABEL: Record<Pillar, string> = {
  empathy: "공감형",
  tip: "실전팁형",
  before_after: "비포애프터형",
  build_in_public: "빌드인퍼블릭형",
};

export const THREAD_TONE_LABEL: Record<ThreadTone, string> = {
  serious: "진지한 글",
  casual_promo: "일상+가벼운 홍보",
  question: "질문형",
  empathy_short: "짧은 공감 한 줄",
};

/** 캘린더 슬롯 상태 (US-8 승인 게이트와 연동) */
export type SlotStatus =
  | "planned"
  | "generated"
  | "awaiting_approval"
  | "approved"
  | "revise"
  | "discarded"
  | "published";

/** 캘린더 한 항목 (US-1) — 인스타는 pillar, 스레드는 tone */
export interface CalendarItem {
  /** ISO date (YYYY-MM-DD) */
  date: string;
  platform: Platform;
  /** 인스타 항목에만 존재 */
  pillar?: Pillar;
  /** 스레드 항목에만 존재 */
  tone?: ThreadTone;
  /** US-2에서 주입되는 주제 한 줄 */
  topic?: string;
  status: SlotStatus;
}

/** IG 카드뉴스 카피 (US-3) — 1장 headline, 2~6장 message, 마지막 cta */
export interface CardCopy {
  cards: string[]; // [headline, ...messages, cta] 길이 5~7
  caption: string; // 첫줄 후킹 + 본문 + 해시태그 포함
  hashtags: string[];
  disclaimer?: string; // 의학 면책 (해당 시)
}

/** 스레드 텍스트 (US-4) */
export interface ThreadCopy {
  text: string; // 280자 내외
  tone: ThreadTone;
}

/** 생성 결과 유니온 */
export type GeneratedCopy =
  | { kind: "ig_card"; copy: CardCopy }
  | { kind: "thread"; copy: ThreadCopy };
