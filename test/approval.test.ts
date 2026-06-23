import { test } from "node:test";
import assert from "node:assert/strict";
import {
  transition,
  canPublish,
  pendingAction,
  fixedClock,
  DEFAULT_POLICY,
  IllegalTransitionError,
} from "../src/publish/approval.js";

test("US-8: 정상 전이 경로 planned→...→published", () => {
  let s = transition("planned", "generate");
  assert.equal(s, "generated");
  s = transition(s, "request_approval");
  assert.equal(s, "awaiting_approval");
  s = transition(s, "approve");
  assert.equal(s, "approved");
  s = transition(s, "publish");
  assert.equal(s, "published");
});

test("US-8: 승인 없이는 게시 불가", () => {
  assert.equal(canPublish("awaiting_approval"), false);
  assert.equal(canPublish("generated"), false);
  assert.equal(canPublish("approved"), true);
  // awaiting에서 publish 시도는 불법 전이
  assert.throws(() => transition("awaiting_approval", "publish"), IllegalTransitionError);
});

test("US-8: 불법 전이 거부", () => {
  assert.throws(() => transition("planned", "approve"), IllegalTransitionError);
  assert.throws(() => transition("published", "approve"), IllegalTransitionError);
});

test("US-8: revise → 재생성 루프", () => {
  const s = transition("awaiting_approval", "revise");
  assert.equal(s, "revise");
  assert.equal(transition(s, "generate"), "generated");
});

test("US-8: 무응답 만료 → 폐기(자동 게시 아님)", () => {
  assert.equal(transition("awaiting_approval", "expire"), "discarded");
});

test("US-8: pendingAction — 리마인드 후 폐기(Devil#3)", () => {
  const since = 0;
  // 6시간 경과 → none
  assert.equal(pendingAction(since, fixedClock(6 * 3600 * 1000), false), "none");
  // 13시간 경과 & 미리마인드 → remind
  assert.equal(pendingAction(since, fixedClock(13 * 3600 * 1000), false), "remind");
  // 13시간 경과 & 이미 리마인드 → none
  assert.equal(pendingAction(since, fixedClock(13 * 3600 * 1000), true), "none");
  // 25시간 경과 → expire
  assert.equal(pendingAction(since, fixedClock(25 * 3600 * 1000), true), "expire");
});

test("US-8: pendingAction은 절대 자동 게시를 반환하지 않음", () => {
  const acts = [0, 12, 13, 24, 48].map((h) => pendingAction(0, fixedClock(h * 3600 * 1000), false));
  for (const a of acts) assert.ok(a === "none" || a === "remind" || a === "expire");
});

test("정책 기본값", () => {
  assert.equal(DEFAULT_POLICY.reminderAfterMs, 12 * 3600 * 1000);
  assert.equal(DEFAULT_POLICY.expireAfterMs, 24 * 3600 * 1000);
});
