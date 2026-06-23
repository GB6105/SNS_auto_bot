// US-8: 승인 게이트 상태머신. PRD §10 "멈춤"이 5분 승인제 구현 지점.
// Devil#3 반영: 무응답 → 리마인드 1회 후 폐기(자동 게시 금지). 주입식 Clock으로 테스트.
import type { SlotStatus } from "../domain/types.js";

export type ApprovalEvent = "generate" | "request_approval" | "approve" | "revise" | "discard" | "publish" | "expire";

/** 허용 전이표. 여기 없는 (state,event)는 불법 전이. */
const TRANSITIONS: Partial<Record<SlotStatus, Partial<Record<ApprovalEvent, SlotStatus>>>> = {
  planned: { generate: "generated" },
  generated: { request_approval: "awaiting_approval" },
  awaiting_approval: {
    approve: "approved",
    revise: "revise",
    discard: "discarded",
    expire: "discarded", // 무응답 만료 → 폐기 (자동 게시 아님)
  },
  approved: { publish: "published" },
  revise: { generate: "generated" }, // 재생성 루프
};

export class IllegalTransitionError extends Error {
  constructor(state: SlotStatus, event: ApprovalEvent) {
    super(`불법 상태 전이: ${state} --${event}--> (허용되지 않음)`);
    this.name = "IllegalTransitionError";
  }
}

/** 상태 전이. 불법이면 throw. publish는 approved에서만 가능(승인 없이는 게시 불가). */
export function transition(state: SlotStatus, event: ApprovalEvent): SlotStatus {
  const next = TRANSITIONS[state]?.[event];
  if (!next) throw new IllegalTransitionError(state, event);
  return next;
}

export interface Clock {
  now(): number; // epoch ms
}

export const systemClock: Clock = { now: () => Date.now() };

/** 고정 시각 클록(테스트/결정적 실행) */
export function fixedClock(epochMs: number): Clock {
  return { now: () => epochMs };
}

export interface ApprovalPolicy {
  reminderAfterMs: number; // 기본 +12h
  expireAfterMs: number; // 기본 24h
}

export const DEFAULT_POLICY: ApprovalPolicy = {
  reminderAfterMs: 12 * 3600 * 1000,
  expireAfterMs: 24 * 3600 * 1000,
};

export type PendingAction = "none" | "remind" | "expire";

/**
 * awaiting_approval 항목에 대해 경과 시간으로 다음 액션 판단.
 * - 만료 경과: expire(→ 폐기)
 * - 리마인드 경과 & 아직 리마인드 안 함: remind
 * - 그 외: none
 * 자동 게시는 절대 반환하지 않는다(진정성 제약).
 */
export function pendingAction(
  awaitingSinceMs: number,
  clock: Clock,
  reminded: boolean,
  policy: ApprovalPolicy = DEFAULT_POLICY,
): PendingAction {
  const elapsed = clock.now() - awaitingSinceMs;
  if (elapsed >= policy.expireAfterMs) return "expire";
  if (elapsed >= policy.reminderAfterMs && !reminded) return "remind";
  return "none";
}

/** 게시 가능 여부 — approved 상태에서만 true */
export function canPublish(state: SlotStatus): boolean {
  return state === "approved";
}
