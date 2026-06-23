// US-6: 게시 전 자동 체크리스트 (규칙 스캐너). PRD §8 가드레일.
// Devil#2 반영: 차단이 아닌 경고(warn)만. 사람 승인과 2중 방어. 근거 텍스트 동반.
import type { CardCopy, GeneratedCopy } from "../domain/types.js";

export type CheckId = "unverified_stats" | "others_story" | "medical_claim" | "source_needed";
export type CheckStatus = "pass" | "warn";

export interface CheckResult {
  check: CheckId;
  label: string;
  status: CheckStatus;
  evidence: string[]; // 매칭된 원문 조각(운영자 판단 근거)
}

export interface ChecklistReport {
  results: CheckResult[];
  warnCount: number;
  hasWarning: boolean;
}

const LABEL: Record<CheckId, string> = {
  unverified_stats: "확인 안 된 통계",
  others_story: "남의 사연·캡처",
  medical_claim: "의학적 단정",
  source_needed: "출처 표기 필요",
};

// 통계/수치 신호: 숫자 + 단위(%, 퍼센트, 명, 배, 위, 명중)
// 끝에 \b를 두지 않는다 — 한글이 바로 뒤따르면(예: "80%가") ASCII 기준 \b가 매칭되지 않기 때문.
const STATS_RE = /\d+(?:[.,]\d+)?\s*(?:%|퍼센트|프로|명|배|위|건|회|시간|일)/g;
// 출처 표기 신호 (있으면 통계 경고 완화)
const SOURCE_RE = /(출처|근거|논문|연구|자료|reference|참고)\s*[:：]?/i;
// 남의 사연·캡처 신호
const OTHERS_RE =
  /(어떤\s*분|누군가|한\s*분이|DM(?:을|으로|에서)?|사연|제보|보내주신|캡처|스크린샷|댓글에서\s*본|이런\s*글을\s*봤)/g;
// 의학적 단정 신호
const MEDICAL_RE =
  /(완치|완전히\s*낫|싹\s*낫|치료(?:된다|됩니다|돼요|할\s*수\s*있)|고칠\s*수\s*있|진단(?:해\s*드립|받으면\s*낫)|약\s*없이\s*낫)/g;

function matchAll(text: string, re: RegExp): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(re)) out.push(m[0].trim());
  return [...new Set(out)];
}

/** GeneratedCopy를 평탄한 검사 텍스트로 */
function flatten(copy: GeneratedCopy): string {
  if (copy.kind === "thread") return copy.copy.text;
  const c: CardCopy = copy.copy;
  return [...c.cards, c.caption].join("\n");
}

/** US-6: 4종 체크 실행. 차단하지 않고 warn/pass 리포트만 반환. */
export function runChecklist(copy: GeneratedCopy): ChecklistReport {
  const text = flatten(copy);
  const hasDisclaimer = copy.kind === "ig_card"
    ? Boolean(copy.copy.disclaimer) || /의학적\s*조언이?\s*아닙/.test(text)
    : /의학적\s*조언이?\s*아닙/.test(text);

  const stats = matchAll(text, STATS_RE);
  const hasSource = SOURCE_RE.test(text);
  const others = matchAll(text, OTHERS_RE);
  const medical = matchAll(text, MEDICAL_RE);

  const results: CheckResult[] = [];

  // ① 확인 안 된 통계: 통계 표현이 있는데 출처가 없으면 warn
  results.push(mk("unverified_stats", stats.length > 0 && !hasSource ? stats : []));

  // ② 남의 사연·캡처
  results.push(mk("others_story", others));

  // ③ 의학적 단정: 단정 표현 또는 (의료 주제인데 면책 누락)
  const medEvidence = [...medical];
  if (!hasDisclaimer) medEvidence.push("의학 면책 문구 누락");
  results.push(mk("medical_claim", medical.length > 0 || !hasDisclaimer ? medEvidence : []));

  // ④ 출처 표기 필요: 통계/인용이 있는데 출처 없음
  results.push(mk("source_needed", stats.length > 0 && !hasSource ? ["통계/수치 인용에 출처 표기 권장"] : []));

  const warnCount = results.filter((r) => r.status === "warn").length;
  return { results, warnCount, hasWarning: warnCount > 0 };
}

function mk(check: CheckId, evidence: string[]): CheckResult {
  return {
    check,
    label: LABEL[check],
    status: evidence.length > 0 ? "warn" : "pass",
    evidence,
  };
}
