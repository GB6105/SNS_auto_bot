# Flow · PRD Generation (추상 Plan → 완성 PRD)

7-에이전트 A2A 순차 핸드오프. 각 에이전트는 **이전 단계까지의 `*.md`만 읽고 자기 출력만 쓴다.** 사용자에게 질문하지 않는다. 각 Phase 종료 후 **Observer Hook**으로 `observer-log.jsonl`에 이벤트 1줄을 append 한다.

## Setup (Phase 0)
1. `workspace/input-plan.txt`가 없으면 **중단**하고 작성을 안내한다.
2. `workspace/` 생성 보장.
3. `guardrail/agent-book.md` 내면화.
4. `observer-log.jsonl` 초기화(멱등 — 이미 있으면 비우고 새로 시작).

## Phase 1 — Socratic → `enriched-plan.md`
`guide/agents/socratic.md` 채택. 3-pass 추론(6W 질문 → 증거스캔 High/Med/Low/None → None에 도메인 기본값). `## Enriched Plan` + `Open Assumptions` + 마지막 `### 추론 시퀀스 다이어그램`(Mermaid sequenceDiagram: Raw Plan→Q&A→Evidence Scanner→Default Table). → 검증 → Observer Hook.

## Phase 2 — PM → `pm-analysis.md`
`guide/agents/pm.md`. 에픽 그룹화 → `- [ ]` 스토리(As a/I want/So that + 수용기준) → P0/P1/P2 + T-shirt(XS~XL) + 의존성. **P0 ≥1**. → 검증 → Observer Hook.

## Phase 3 — Engineer → `engineer-analysis.md`
`guide/agents/engineer.md`. 스토리별 타당성·위험(LOW/MED/HIGH)·블로커·스택추천 + 빌드명령(test/typecheck/lint). → 검증 → Observer Hook.

## Phase 4 — User → `user-analysis.md`
`guide/agents/user.md`. 사용자 저니(첫/일상) + UX 수용기준 + 마찰지점 + 접근성. → 검증 → Observer Hook.

## Phase 5 — Devil → `devil-critique.md`
`guide/agents/devil.md`. 5유형(가정/범위/모순/타당성/가치) **정확히 3~10개** 챌린지(유형+대상+근거+제안). → 검증 → Observer Hook.

## Phase 6 — SlopChecker → `slop-report.md`
`guide/agents/slop-checker.md`. Anti-Pattern 5기준 slop 점수(0~5) 표 → 판정(0통과/1 P2강등/≥2제거/P0 ESCALATE) + 정당화 + `최종 범위 요약` + slop_removed 후보. → 검증 → Observer Hook.

## Phase 7 — Synthesis → `PRD.md` + `prd.json`
오케스트레이터(CLAUDE.md)로 복귀. `templates/PRD.template.md`·`templates/prd.template.json` 기반으로 합성:
- 통과한 P0/P1만 포함(P2는 선택).
- 모든 `user_stories[].passes = false` (Ralph가 구현하며 true로 전환).
- 미해결 분쟁 스토리 `disputed: true`, `disputes[]` 기록.
- 제거된 기능 `slop_removed[]` 기록.
- `metadata.agents_run` 채움.
→ 검증 → Observer Hook(Phase7) → **Phase8 pipeline complete 이벤트** append.

## Phase 8 — Observer HTML
`bash .scaffold/v0/observer/generate-html.sh "$(pwd)/workspace"` → `observer-log.html`.

## 종료
산출물(6개 분석 md + PRD.md + prd.json + observer-log.jsonl/html) 안내 후, Ralph 개발 루프 실행 여부를 사용자에게 질의:
`RALPH_WORKSPACE_DIR="$(pwd)/workspace" bash .scaffold/v0/ralph/ralph.sh`

## codex 활용 지점
> 'codex' 표기 지점은 codex 플러그인을 활용할 수 있는 확장점이다. **v0는 claude CLI 기반 Ralph 루프로 구현**한다. (Phase별 멀티 에이전트 호출을 codex 플러그인으로 병렬화/대체하는 것은 v1+ 과제.)
