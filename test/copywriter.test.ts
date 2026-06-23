import { test } from "node:test";
import assert from "node:assert/strict";
import { StubLLM } from "../src/generation/llm.js";
import { generateCardCopy, generateThreadCopy, clampCards, trimToLimit, charLen } from "../src/generation/copywriter.js";

const llm = new StubLLM();

test("US-3: IG 카드 카피 — 5~7장, headline+cta 구조, 캡션/해시태그", async () => {
  const card = await generateCardCopy(llm, "empathy", "테스트 주제");
  assert.ok(card.cards.length >= 5 && card.cards.length <= 7, "카드 5~7장");
  assert.ok(card.cards[0].length > 0, "헤드라인 존재");
  assert.ok(card.caption.includes("#"), "캡션에 해시태그");
  assert.ok(card.hashtags.length >= 1);
});

test("US-3: clampCards — 초과를 7로, 첫/마지막 유지", () => {
  const many = ["H", "1", "2", "3", "4", "5", "6", "7", "CTA"];
  const c = clampCards(many);
  assert.ok(c.length <= 7);
  assert.equal(c[0], "H");
  assert.equal(c[c.length - 1], "CTA");
});

test("US-3: clampCards — 부족을 5로 패딩", () => {
  const few = ["H", "CTA"];
  const c = clampCards(few);
  assert.ok(c.length >= 5);
  assert.equal(c[0], "H");
  assert.equal(c[c.length - 1], "CTA");
});

test("US-4: 스레드 280자 이하 + 톤 반영", async () => {
  for (const tone of ["serious", "casual_promo", "question", "empathy_short"] as const) {
    const t = await generateThreadCopy(llm, tone);
    assert.ok(charLen(t.text) <= 280, `${tone}: 280자 이하`);
    assert.equal(t.tone, tone);
    assert.ok(t.text.length > 0);
  }
});

test("US-4: 질문형은 물음표로 종료", async () => {
  const t = await generateThreadCopy(llm, "question");
  assert.ok(t.text.trimEnd().endsWith("?"), "질문형은 ?로 끝나야");
});

test("trimToLimit — 코드포인트 한도 준수", () => {
  const long = "가".repeat(400);
  assert.ok(charLen(trimToLimit(long, 280)) <= 280);
});

test("결정적 — 같은 입력 같은 출력(stub)", async () => {
  const a = await generateCardCopy(llm, "tip", "주제X");
  const b = await generateCardCopy(llm, "tip", "주제X");
  assert.deepEqual(a, b);
});
