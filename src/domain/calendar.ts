// US-1 2주치 캘린더 생성 + US-2 주제 선정. 순수·결정적.
import type { CalendarItem, Pillar } from "./types.js";
import { IG_WEEKDAY_PILLAR, THREAD_WEEKDAY_TONE, TOPIC_POOL } from "./pillars.js";

/** YYYY-MM-DD 문자열을 UTC 자정 Date로 (타임존 흔들림 방지) */
function parseDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`날짜 형식은 YYYY-MM-DD 여야 합니다: ${iso}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** ISO week number (격주 교차 패리티용). 결정적. */
export function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // 목요일로 이동
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
}

/** 금요일 격주 교차: 짝수 주 = before_after, 홀수 주 = build_in_public */
function fridayPillar(d: Date): Pillar {
  return isoWeek(d) % 2 === 0 ? "before_after" : "build_in_public";
}

/**
 * US-1: 시작일부터 days일치(기본 14) 캘린더 생성.
 * - 인스타: 월·수·금에 기둥 매핑
 * - 스레드: 매일 요일 톤 매핑
 * 결정적: 같은 startIso → 같은 캘린더.
 */
export function buildCalendar(startIso: string, days = 14): CalendarItem[] {
  const start = parseDate(startIso);
  const items: CalendarItem[] = [];

  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 24 * 3600 * 1000);
    const iso = toISO(d);
    const weekday = d.getUTCDay(); // 0=Sun

    // 스레드: 매일
    items.push({
      date: iso,
      platform: "threads",
      tone: THREAD_WEEKDAY_TONE[weekday],
      status: "planned",
    });

    // 인스타: 월·수·금
    const igRule = IG_WEEKDAY_PILLAR[weekday];
    if (igRule) {
      const pillar: Pillar = igRule === "biweekly" ? fridayPillar(d) : igRule;
      items.push({ date: iso, platform: "instagram", pillar, status: "planned" });
    }
  }
  return items;
}

/**
 * US-2: 인스타 항목에 기둥별 주제 한 줄을 결정적으로 주입.
 * 같은 기둥이 여러 번 나오면 미사용(다음 인덱스) 우선 선택해 중복을 피한다.
 * 캘린더 순서에 따라 결정적 — 외부 상태 불필요.
 */
export function assignTopics(items: CalendarItem[]): CalendarItem[] {
  const usedCount: Partial<Record<Pillar, number>> = {};
  return items.map((it) => {
    if (it.platform !== "instagram" || !it.pillar) return it;
    const pool = TOPIC_POOL[it.pillar];
    const idx = (usedCount[it.pillar] ?? 0) % pool.length;
    usedCount[it.pillar] = (usedCount[it.pillar] ?? 0) + 1;
    return { ...it, topic: pool[idx] };
  });
}

/** 특정 날짜의 항목만 추출 (CLI/파이프라인용) */
export function itemsForDate(items: CalendarItem[], iso: string): CalendarItem[] {
  return items.filter((it) => it.date === iso);
}
