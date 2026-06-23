@guardrail/agent-book.md

# Scaffold v0 — Orchestrator (추상 Plan → PRD → 코드)

이 파일은 PRD 생성 파이프라인의 **오케스트레이터**다. 아래 트리거를 만나면 `guide/flows/prd-generation.md`에 따라 7-에이전트 A2A 파이프라인을 순차 실행한다.

## 트리거
사용자 입력이 다음 중 하나면 파이프라인을 시작한다:
- `PRD 생성` · `generate PRD` · `prd` · `run scaffold`

## Setup (Phase 0)
1. `workspace/input-plan.txt`가 **없으면 중단**하고 "추상 계획을 `workspace/input-plan.txt`에 작성하라"고 안내한다.
2. `workspace/` 디렉토리 생성 보장.
3. `guardrail/agent-book.md`를 **내면화**한다(헌법).
4. `workspace/observer-log.jsonl`를 **초기화**한다(멱등 — 존재하면 비우고 새로 시작).

## 파이프라인 (각 Phase: 역할 채택 → 작업 → 검증 → Observer Hook)
각 Phase는 해당 `guide/agents/*.md` 역할을 채택하고, 이전 단계까지의 `*.md`만 읽어 자기 출력 1개만 쓴다. 사용자에게 질문하지 않는다.

| Phase | 역할 카드 | 출력 |
|---|---|---|
| 1 | `guide/agents/socratic.md` | `workspace/enriched-plan.md` |
| 2 | `guide/agents/pm.md` | `workspace/pm-analysis.md` |
| 3 | `guide/agents/engineer.md` | `workspace/engineer-analysis.md` |
| 4 | `guide/agents/user.md` | `workspace/user-analysis.md` |
| 5 | `guide/agents/devil.md` | `workspace/devil-critique.md` |
| 6 | `guide/agents/slop-checker.md` | `workspace/slop-report.md` |
| 7 | (오케스트레이터 복귀, Synthesis) | `workspace/PRD.md` + `workspace/prd.json` |

각 Phase 작업 직후:
1. **검증** — agent-book §③ Output Validity를 만족하는지 확인(불만족 시 재작성).
2. **Observer Hook** — `guide/agents/observer.md` 역할을 채택해 직전 output을 읽고 한 줄 JSON 이벤트를 `workspace/observer-log.jsonl`에 **append**.

## Phase 7 — Synthesis
`guide/templates/PRD.template.md`·`guide/templates/prd.template.json` 기반으로 합성:
- 통과한 **P0/P1만** 포함(P2는 선택).
- 모든 `user_stories[].passes = false`.
- 미해결 분쟁 스토리 `disputed: true` + `disputes[]` 기록.
- 제거 기능 `slop_removed[]` 기록.
- `metadata.agents_run`·`generated_at` 채움.
→ 검증 → Observer Hook(Phase7) → **Phase8 pipeline complete** 이벤트도 append.

## Phase 8 — Observer HTML
```
bash .scaffold/v0/observer/generate-html.sh "$(pwd)/workspace"
```
→ `workspace/observer-log.html` 생성.

## 종료 안내
산출물(6개 분석 md + `PRD.md` + `prd.json` + `observer-log.jsonl/html`)을 안내한 뒤, **Ralph 개발 루프 실행 여부**를 사용자에게 질의:
```
RALPH_WORKSPACE_DIR="$(pwd)/workspace" bash .scaffold/v0/ralph/ralph.sh
```

@guide/flows/prd-generation.md
