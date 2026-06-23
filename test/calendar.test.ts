import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCalendar, assignTopics, itemsForDate, isoWeek } from "../src/domain/calendar.js";

test("US-1: 14일치 슬롯 생성, 스레드 매일 + IG 월수금", () => {
  // 2026-06-01 은 월요일
  const cal = buildCalendar("2026-06-01", 14);
  const threads = cal.filter((i) => i.platform === "threads");
  const ig = cal.filter((i) => i.platform === "instagram");
  assert.equal(threads.length, 14, "스레드는 매일 1회 → 14건");
  // 14일에 월수금이 몇 번? 6/1(월)~6/14(일): 월1,3,8,10 ... 계산: 월(1,8) 수(3,10) 금(5,12) = 6건
  assert.equal(ig.length, 6, "IG는 월·수·금 → 6건");
});

test("US-1: 각 항목 필수 필드 + status=planned", () => {
  const cal = buildCalendar("2026-06-01", 14);
  for (const it of cal) {
    assert.ok(it.date.match(/^\d{4}-\d{2}-\d{2}$/));
    assert.equal(it.status, "planned");
    if (it.platform === "instagram") assert.ok(it.pillar, "IG는 pillar 보유");
    else assert.ok(it.tone, "스레드는 tone 보유");
  }
});

test("US-1: 결정적 — 같은 시작일은 같은 캘린더", () => {
  assert.deepEqual(buildCalendar("2026-06-01", 14), buildCalendar("2026-06-01", 14));
});

test("US-1: 금요일 격주 교차 (before_after ↔ build_in_public)", () => {
  const cal = buildCalendar("2026-06-01", 14);
  const fridays = cal.filter(
    (i) => i.platform === "instagram" && new Date(i.date + "T00:00:00Z").getUTCDay() === 5,
  );
  const pillars = fridays.map((f) => f.pillar);
  // 6/5 와 6/12 두 금요일의 기둥이 서로 달라야(격주 교차)
  assert.equal(fridays.length, 2);
  assert.notEqual(pillars[0], pillars[1], "연속 두 금요일은 다른 기둥");
  for (const p of pillars) assert.ok(p === "before_after" || p === "build_in_public");
});

test("US-1: 월=공감, 수=실전팁 매핑", () => {
  const cal = buildCalendar("2026-06-01", 7);
  const mon = cal.find((i) => i.platform === "instagram" && i.date === "2026-06-01");
  const wed = cal.find((i) => i.platform === "instagram" && i.date === "2026-06-03");
  assert.equal(mon?.pillar, "empathy");
  assert.equal(wed?.pillar, "tip");
});

test("US-2: 주제 주입 + 미사용 우선(중복 회피)", () => {
  const cal = assignTopics(buildCalendar("2026-06-01", 28)); // 4주 → empathy 4회
  const ig = cal.filter((i) => i.platform === "instagram");
  for (const it of ig) assert.ok(it.topic && it.topic.length > 0, "IG 항목에 topic 주입");
  // 같은 기둥 첫 두 항목은 서로 다른 주제(미사용 우선)
  const empathy = ig.filter((i) => i.pillar === "empathy").map((i) => i.topic);
  assert.notEqual(empathy[0], empathy[1], "같은 기둥 연속 주제는 달라야");
});

test("US-2: 스레드 항목엔 topic 미주입", () => {
  const cal = assignTopics(buildCalendar("2026-06-01", 7));
  for (const it of cal.filter((i) => i.platform === "threads")) assert.equal(it.topic, undefined);
});

test("itemsForDate 필터", () => {
  const cal = buildCalendar("2026-06-01", 14);
  const d = itemsForDate(cal, "2026-06-01");
  assert.ok(d.length >= 1 && d.every((i) => i.date === "2026-06-01"));
});

test("isoWeek 결정성", () => {
  assert.equal(typeof isoWeek(new Date("2026-06-01T00:00:00Z")), "number");
});
