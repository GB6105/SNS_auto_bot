import { test } from "node:test";
import assert from "node:assert/strict";
import { runChecklist } from "../src/guardrail/checklist.js";
import type { GeneratedCopy } from "../src/domain/types.js";

function thread(text: string): GeneratedCopy {
  return { kind: "thread", copy: { text, tone: "serious" } };
}

test("US-6: 깨끗한 텍스트 — 의학 면책 없으면 medical_claim warn", () => {
  const r = runChecklist(thread("지금 할 첫 한 가지만 정해보자."));
  const med = r.results.find((x) => x.check === "medical_claim")!;
  assert.equal(med.status, "warn", "면책 누락 → 의학 체크 warn");
});

test("US-6: 확인 안 된 통계 탐지(출처 없음)", () => {
  const r = runChecklist(thread("성인의 80%가 이걸 겪는다고 합니다."));
  const stats = r.results.find((x) => x.check === "unverified_stats")!;
  assert.equal(stats.status, "warn");
  assert.ok(stats.evidence.some((e) => e.includes("%")));
  const src = r.results.find((x) => x.check === "source_needed")!;
  assert.equal(src.status, "warn");
});

test("US-6: 통계 + 출처 있으면 통계 경고 완화", () => {
  const r = runChecklist(thread("성인의 80%가 겪는다 (출처: 가상연구 2020)."));
  const stats = r.results.find((x) => x.check === "unverified_stats")!;
  assert.equal(stats.status, "pass", "출처 있으면 pass");
});

test("US-6: 남의 사연·캡처 탐지", () => {
  const r = runChecklist(thread("어떤 분이 DM으로 보내주신 사연을 소개합니다."));
  const others = r.results.find((x) => x.check === "others_story")!;
  assert.equal(others.status, "warn");
  assert.ok(others.evidence.length > 0);
});

test("US-6: 의학적 단정 탐지", () => {
  const r = runChecklist(thread("이 방법으로 ADHD가 완치된다. 의학적 조언이 아닙니다."));
  const med = r.results.find((x) => x.check === "medical_claim")!;
  assert.equal(med.status, "warn");
  assert.ok(med.evidence.some((e) => e.includes("완치")));
});

test("US-6: 면책 포함 + 단정 없으면 medical pass", () => {
  const card: GeneratedCopy = {
    kind: "ig_card",
    copy: {
      cards: ["H", "a", "b", "c", "CTA"],
      caption: "본문 #ADHD",
      hashtags: ["#ADHD"],
      disclaimer: "의학적 조언이 아닙니다. 진단·치료는 전문가와 상담하세요.",
    },
  };
  const r = runChecklist(card);
  const med = r.results.find((x) => x.check === "medical_claim")!;
  assert.equal(med.status, "pass");
});

test("US-6: warn은 차단이 아님 — 리포트 구조만 반환", () => {
  const r = runChecklist(thread("80% (출처 없음)"));
  assert.equal(typeof r.warnCount, "number");
  assert.equal(typeof r.hasWarning, "boolean");
  assert.equal(r.results.length, 4, "4종 체크");
});
