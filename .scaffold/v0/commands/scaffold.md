---
description: 추상 계획 → PRD → 코드 파이프라인(prd-scaffold-v0) 실행
argument-hint: [계획 텍스트 | init <name> | ralph | html | status]
allowed-tools: Read, Write, Edit, Bash(bash:*), Bash(jq:*), Bash(git:*), Bash(mkdir:*), Bash(cat:*), Bash(ls:*), Bash(node:*), Bash(npm:*), Bash(npx:*), Bash(python3:*), Bash(tsc:*)
---

너는 이 프로젝트의 `prd-scaffold-v0` 오케스트레이터다. 먼저 다음을 읽고 내면화하라:
`.scaffold/v0/CLAUDE.md`, `.scaffold/v0/guardrail/agent-book.md`, `.scaffold/v0/guide/flows/prd-generation.md`.

사용자 인자: `$ARGUMENTS`

## ⛔ 호스트 가드 (먼저 확인)
현재 디렉토리에 `.scaffold/v0/.template-host` 파일이 **존재하면**, 이곳은 템플릿 호스트(찍어내는 틀)다.
이 경우 **`init <name>` 만 허용**한다. 그 외 동작(빈 인자/계획 텍스트로 파이프라인 실행, `ralph`, `html`, `status`)은
**실행하지 말고**, 아래를 안내한 뒤 중단하라:
> "여기는 템플릿 호스트입니다. 실제 작업은 서브프로젝트에서 하세요 — `/scaffold init <name>` 으로 만들고 `cd <name>` 후 그 폴더에서 `/scaffold` 를 실행하세요."

마커가 없으면(=실제 프로젝트 폴더) 정상적으로 아래 분기를 수행한다.

위 인자에 따라 분기하라(인자 앞부분 토큰으로 판단):

- **`init <name>`** → `bash .scaffold/v0/init.sh <name>` 실행하고 결과 경로를 안내한다.
- **`ralph`** → `RALPH_WORKSPACE_DIR="$(pwd)/.scaffold/v0/workspace" bash .scaffold/v0/ralph/ralph.sh` 를 실행해 P0→P1→P2 개발 루프를 돌린다.
- **`html`** → `bash .scaffold/v0/observer/generate-html.sh "$(pwd)/.scaffold/v0/workspace"` 로 observer-log.html을 재생성한다.
- **`status`** → `.scaffold/v0/workspace/`의 산출물 존재 여부와 `prd.json`의 스토리별 `passes`/`disputed` 현황을 요약 보고한다(파이프라인은 실행하지 않는다).
- **그 외 비어있지 않은 텍스트** → 그 텍스트를 추상 계획으로 간주하여 `.scaffold/v0/workspace/input-plan.txt`에 **덮어쓴 뒤** 아래 PRD 파이프라인을 실행한다.
- **빈 인자** → 기존 `.scaffold/v0/workspace/input-plan.txt`를 입력으로 아래 PRD 파이프라인을 실행한다.

## PRD 파이프라인 실행 절차
1. **Phase 0 — Setup**: `input-plan.txt`가 없거나 주석뿐이면 **중단**하고 작성을 안내한다. `.scaffold/v0/workspace/` 생성 보장. `.scaffold/v0/workspace/observer-log.jsonl`를 **초기화**(빈 파일로 truncate)한다. agent-book을 내면화한다.
2. **Phase 1~6** — 각 단계마다 해당 `.scaffold/v0/guide/agents/*.md` 역할을 채택하고, 이전 단계까지의 `*.md`만 읽어 자기 출력 1개만 쓴다. 사용자에게 질문하지 말고 도메인 기본값으로 진행한다. 각 단계 직후: agent-book §③ 검증 → `observer.md` 역할로 한 줄 JSON 이벤트를 `observer-log.jsonl`에 append(Observer Hook).
   - P1 socratic → `enriched-plan.md` / P2 pm → `pm-analysis.md` / P3 engineer → `engineer-analysis.md` / P4 user → `user-analysis.md` / P5 devil → `devil-critique.md` / P6 slop-checker → `slop-report.md`
3. **Phase 7 — Synthesis**: `.scaffold/v0/guide/templates/`의 PRD/prd.json 템플릿 기반으로 `workspace/PRD.md` + `workspace/prd.json` 합성(통과 P0/P1만, 모든 `passes:false`, 미해결분쟁 `disputed:true`, 제거기능 `slop_removed[]`). 검증 → Observer Hook(Phase7) → Phase8 pipeline complete 이벤트 append.
4. **Phase 8 — Render**: `bash .scaffold/v0/observer/generate-html.sh "$(pwd)/.scaffold/v0/workspace"`.
5. **종료 안내**: 산출물(6개 분석md + PRD.md + prd.json + observer-log.jsonl/html)을 요약하고, 이어서 개발 루프를 돌릴지 묻는다 — `/scaffold ralph`.

모든 작업은 `.scaffold/v0/workspace/` 안에서만 한다. 스캐폴드 소스(guide/guardrail/ralph/observer)는 수정하지 않는다.
