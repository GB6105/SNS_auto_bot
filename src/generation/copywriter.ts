// US-3 / US-4: 카피 생성 + 결정적 후처리 검증·보정 (Devil#1).
import type { CardCopy, Pillar, ThreadCopy, ThreadTone } from "../domain/types.js";
import type { LLM } from "./llm.js";
import { GUARDRAIL_SYSTEM, igCardPrompt, threadPrompt } from "./prompts.js";

const MIN_CARDS = 5;
const MAX_CARDS = 7;
const THREAD_MAX = 280;

/** 코드펜스/잡텍스트가 섞여도 첫 JSON 객체만 안전 파싱 */
function parseJsonObject(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`JSON 객체를 찾지 못함: ${raw.slice(0, 120)}`);
  }
  return JSON.parse(raw.slice(start, end + 1));
}

/** 유니코드 코드포인트 기준 길이(한글 1자=1) */
export function charLen(s: string): number {
  return [...s].length;
}

/**
 * 카드 수를 [5,7]로 클램프. 첫 장=headline, 마지막 장=cta 유지.
 * - 7장 초과: 중간 메시지를 잘라 7장으로.
 * - 5장 미만: headline/cta 사이를 안전한 일반 메시지로 채움(보수적).
 */
export function clampCards(cards: string[]): string[] {
  const clean = cards.map((c) => String(c).trim()).filter((c) => c.length > 0);
  if (clean.length < 2) {
    // headline/cta조차 없으면 최소 골격 구성
    const head = clean[0] ?? "지금 할 첫 한 가지부터";
    return [head, "한 장에 한 메시지로 시작한다", "5분이면 되는 행동부터 손에 잡는다", "끊겨도 복귀 기준이 다시 시작하게 한다", "오늘의 첫 행동을 댓글에 적어보기 →"];
  }
  const headline = clean[0];
  const cta = clean[clean.length - 1];
  let middle = clean.slice(1, -1);

  // 초과 → 앞쪽 메시지 우선 유지하며 자름
  const maxMiddle = MAX_CARDS - 2;
  if (middle.length > maxMiddle) middle = middle.slice(0, maxMiddle);

  // 부족 → 보수적 일반 메시지로 패딩(최소 3장 중간 → 총 5장)
  const minMiddle = MIN_CARDS - 2;
  const fillers = [
    "한 장에 한 가지만 담는다",
    "5분이면 끝나는 행동부터 시작한다",
    "끊겨도 복귀 기준 한 줄이 다시 시작하게 한다",
  ];
  let fi = 0;
  while (middle.length < minMiddle) {
    middle.push(fillers[fi % fillers.length]);
    fi++;
  }
  return [headline, ...middle, cta];
}

/** US-3: IG 카드뉴스 카피 생성 + 후처리 */
export async function generateCardCopy(llm: LLM, pillar: Pillar, topic: string): Promise<CardCopy> {
  const raw = await llm.complete({
    system: GUARDRAIL_SYSTEM,
    user: igCardPrompt(pillar, topic),
    purpose: "ig_card",
    context: { pillar, topic },
    maxTokens: 1500,
  });
  const obj = parseJsonObject(raw) as Partial<CardCopy>;
  const cards = clampCards(Array.isArray(obj.cards) ? obj.cards : []);
  const hashtags = Array.isArray(obj.hashtags) && obj.hashtags.length
    ? obj.hashtags
    : ["#ADHD", "#성인ADHD", "#실행기능", "#ADHD플래너"];
  const caption = typeof obj.caption === "string" && obj.caption.trim()
    ? obj.caption.trim()
    : `${cards[0]}\n\n${hashtags.join(" ")}`;
  const out: CardCopy = { cards, caption, hashtags };
  if (typeof obj.disclaimer === "string" && obj.disclaimer.trim()) out.disclaimer = obj.disclaimer.trim();
  return out;
}

/**
 * US-4: 스레드 텍스트 생성 + 후처리.
 * - 280자 초과 시 트림(단어/문장 경계 우선).
 * - 질문형(question)인데 물음표로 끝나지 않으면 보장.
 */
export async function generateThreadCopy(llm: LLM, tone: ThreadTone): Promise<ThreadCopy> {
  const raw = await llm.complete({
    system: GUARDRAIL_SYSTEM,
    user: threadPrompt(tone),
    purpose: "thread",
    context: { tone },
    maxTokens: 600,
  });
  const obj = parseJsonObject(raw) as Partial<ThreadCopy>;
  let text = typeof obj.text === "string" ? obj.text.trim() : "";
  if (!text) text = "지금 할 첫 한 가지만 정해보자.";

  text = trimToLimit(text, THREAD_MAX);

  if (tone === "question" && !text.trimEnd().endsWith("?")) {
    text = ensureQuestion(text, THREAD_MAX);
  }
  return { text, tone };
}

/** 코드포인트 기준 limit로 트림. 가능하면 문장부호 경계에서 자른다. */
export function trimToLimit(text: string, limit: number): string {
  const cp = [...text];
  if (cp.length <= limit) return text;
  let cut = cp.slice(0, limit).join("");
  const boundary = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("?"), cut.lastIndexOf("!"), cut.lastIndexOf("\n"));
  if (boundary >= limit * 0.6) cut = cut.slice(0, boundary + 1);
  return cut.trimEnd();
}

/** 질문형 종료 보장. 길이 한도를 지키며 물음표로 끝나게. */
function ensureQuestion(text: string, limit: number): string {
  const suffix = " 여러분은 어떠세요?";
  const base = trimToLimit(text, limit - charLen(suffix));
  return `${base}${suffix}`;
}
