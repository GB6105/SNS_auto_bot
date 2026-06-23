# Guide — 추상 Plan → 완성 PRD

이 디렉토리는 **추상 아이디어를 완성된 PRD로 끌어올리는 가이드(guide)** 다.
제어/금지 규칙은 `../guardrail/agent-book.md`(guardrail)가 담당한다.

## 구조
```
guide/
  README.md                 # 이 문서
  agents/                   # 7개 에이전트 역할 카드
    socratic.md  pm.md  engineer.md  user.md  devil.md  slop-checker.md  observer.md
  flows/prd-generation.md   # 파이프라인 단계 정의(Phase 0~8)
  templates/
    PRD.template.md         # 최종 PRD(한국어, 11섹션)
    prd.template.json       # Ralph가 소비하는 머신 스펙(prd.schema.v0)
```

## 사용
프로젝트 루트에서 다음 트리거 중 하나를 입력하면 `../CLAUDE.md`가 파이프라인을 시작한다:
- `PRD 생성` · `generate PRD` · `prd` · `run scaffold`

전제: `workspace/input-plan.txt`에 추상 계획이 작성되어 있어야 한다(없으면 중단·안내).

## 산출물 (`workspace/`)
`enriched-plan.md` → `pm-analysis.md` → `engineer-analysis.md` → `user-analysis.md` → `devil-critique.md` → `slop-report.md` → `PRD.md` + `prd.json` + `observer-log.jsonl` + `observer-log.html`.

## 이후
`prd.json`을 입력으로 `../ralph/ralph.sh`가 P0→P1→P2 순으로 자동 구현·검증·커밋한다.

## 설계 원칙
- **guide vs guardrail 분리**: guide는 "무엇을 만드는가", guardrail은 "어떻게 행동하는가(금지/경계)".
- **A2A 핸드오프**: 각 에이전트는 이전 `*.md`만 읽고 자기 출력만 쓴다.
- **무질문(no-question)**: Socratic 자문자답 + 도메인 기본값으로 사용자 차단을 제거.
- **PM 우선순위 주권** + **Devil/SlopChecker 품질 게이트** + **Observer 관찰성**.
