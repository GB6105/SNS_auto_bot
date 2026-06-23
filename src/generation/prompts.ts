// 생성 프롬프트 — 톤·가드레일을 시스템 프롬프트에 고정 (PRD §생성 규칙/§가드레일).
import type { Pillar, ThreadTone } from "../domain/types.js";
import { PILLAR_INTENT } from "../domain/pillars.js";
import { PILLAR_LABEL, THREAD_TONE_LABEL } from "../domain/types.js";

/** 모든 생성에 공통으로 박히는 톤·가드레일 헌법. */
export const GUARDRAIL_SYSTEM = `너는 ADHD 플래너 브랜드의 SNS 카피라이터다. 항상 다음 규칙을 지킨다.

[톤 — 플래너 철학 계승]
- 추상적 표현("열심히", "노력") 금지. 항상 구체적인 장면과 결과 기준으로 쓴다.
- 자책을 유발하지 않는다. 실패를 말할 때는 복귀·재시작을 함께 제시한다.
- ADHD 당사자의 시선에서, 한 메시지에 한 가지만 담는다.

[가드레일 — 자동 생성이므로 엄격히]
- 확인되지 않은 구체 통계/수치를 만들지 않는다(환각 금지). 꼭 필요하면 검증된 출처와 함께만.
- 남의 사연·DM·캡처를 그대로 옮기지 않는다. 여러 사례를 익명의 일반 상황으로 재구성한다.
- 의학적 단정(완치/치료된다 등) 금지. ADHD는 의료 주제이므로 "의학적 조언 아님, 진단·치료는 전문가 상담" 취지의 면책을 포함한다.
- 개인 식별 정보(실명/위치/계정)를 노출하지 않는다.

[출력 형식]
- 반드시 지정된 JSON 스키마만 출력한다. 코드펜스/설명/서론 없이 JSON 객체 하나만.`;

/** US-3: IG 카드뉴스 생성 user 프롬프트 */
export function igCardPrompt(pillar: Pillar, topic: string): string {
  const intent = PILLAR_INTENT[pillar];
  return `다음 인스타그램 카드뉴스 카피를 생성하라.

기둥: ${PILLAR_LABEL[pillar]} (목적: ${intent.purpose} / 효과: ${intent.effect})
주제: ${topic}

요구사항:
- 카드 5~7장. cards[0]=후킹 헤드라인, 마지막=CTA, 그 사이는 한 장당 한 메시지.
- caption=첫 줄 후킹 + 본문 + 해시태그(#ADHD 등). 의학 면책 한 줄 포함.
- hashtags=해시태그 배열. disclaimer=의학 면책 문구.

JSON 스키마(이 형태만 출력):
{"cards":["...","..."],"caption":"...","hashtags":["#..."],"disclaimer":"..."}`;
}

/** US-4: 스레드 생성 user 프롬프트 */
export function threadPrompt(tone: ThreadTone): string {
  const guide: Record<ThreadTone, string> = {
    serious: "실행기능 이야기나 제품 철학을 진지하게. 구체 장면으로.",
    casual_promo: "'만들면서 겪은 것' 형태의 일상 + 가벼운 홍보.",
    question: "답하기 쉬운 질문으로 끝내 댓글을 유도(질문형은 반드시 물음표로 종료).",
    empathy_short: "부담 없는 짧은 공감 한 줄.",
  };
  return `다음 스레드(Threads) 텍스트를 생성하라.

요일 톤: ${THREAD_TONE_LABEL[tone]} — ${guide[tone]}

요구사항:
- 280자 내외(초과 금지). 첫 문장에서 멈추게.
- 추상어 금지, 구체 장면. 홍보는 "겪은 것" 형태.

JSON 스키마(이 형태만 출력):
{"text":"...","tone":"${tone}"}`;
}
