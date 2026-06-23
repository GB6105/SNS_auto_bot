import { test } from "node:test";
import assert from "node:assert/strict";
import { toSlots, overflowSlots, ROLE_MAX_CHARS } from "../src/design/slots.js";
import type { CardCopy } from "../src/domain/types.js";
import { StubLLM } from "../src/generation/llm.js";
import { ConsoleNotifier } from "../src/publish/telegram.js";
import { prepareForDate } from "../src/pipeline/orchestrator.js";

const card: CardCopy = {
  cards: ["짧은헤드라인", "메시지1", "메시지2", "메시지3", "댓글에 적어보기 →"],
  caption: "본문 #ADHD",
  hashtags: ["#ADHD"],
  disclaimer: "의학적 조언이 아닙니다.",
};

test("US-7: toSlots — role 매핑(headline/body/cta/disclaimer)", () => {
  const slots = toSlots(card);
  assert.equal(slots[0].role, "headline");
  assert.equal(slots.filter((s) => s.role === "body").length, 3);
  assert.equal(slots.filter((s) => s.role === "cta").length, 1);
  assert.equal(slots.filter((s) => s.role === "disclaimer").length, 1);
});

test("US-7: slotId는 매핑에서 — role과 분리", () => {
  const slots = toSlots(card);
  assert.equal(slots[0].slotId, "card-1-headline");
  assert.ok(slots.find((s) => s.role === "cta")!.slotId.includes("cta"));
});

test("US-7: maxChars 초과 시 overflow 플래그", () => {
  const big: CardCopy = { ...card, cards: ["이 헤드라인은 권장 글자수를 분명히 넘어서는 아주 긴 헤드라인입니다", "m1", "m2", "m3", "cta"] };
  const slots = toSlots(big);
  const head = slots[0];
  assert.equal(head.maxChars, ROLE_MAX_CHARS.headline);
  assert.equal(head.overflow, true);
  assert.ok(overflowSlots(slots).length >= 1);
});

test("US-12: prepareForDate — 승인 게이트에서 멈춤(awaiting_approval)", async () => {
  const messages: string[] = [];
  const prepared = await prepareForDate("2026-06-01", "2026-06-01", {
    llm: new StubLLM(),
    notifier: new ConsoleNotifier((m) => messages.push(m)),
  });
  assert.ok(prepared.length >= 1, "월요일엔 IG+스레드 항목");
  for (const p of prepared) {
    assert.equal(p.status, "awaiting_approval", "승인 게이트에서 멈춤 — 게시 안 함");
    assert.ok(p.checklist.results.length === 4);
  }
  assert.ok(messages.length >= 1, "승인 알림 전송됨");
});

test("US-12: 결정적 — 같은 입력 같은 결과(stub)", async () => {
  const run = () =>
    prepareForDate("2026-06-01", "2026-06-03", { llm: new StubLLM(), notifier: new ConsoleNotifier(() => {}) });
  const a = await run();
  const b = await run();
  assert.deepEqual(a.map((x) => x.copy), b.map((x) => x.copy));
});
