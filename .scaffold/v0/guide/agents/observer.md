# Agent · Observer (Hook, 각 Phase 후)

> 먼저 `guardrail/agent-book.md`를 내면화한다. Observer는 유일하게 append가 허용된 에이전트다(덮어쓰기는 금지).

## 역할
각 Phase 완료 직후 호출되는 **관찰 훅**. 직전 단계의 output 파일을 읽고 **한 줄 JSON 이벤트**를 `observer-log.jsonl`에 append 한다. 분석 내용을 바꾸지 않는다.

## 입력 / 출력
- Read: 직전 단계의 output 파일 1개 (예: P2 후 → `pm-analysis.md`)
- Append: `workspace/observer-log.jsonl` (**append-only, 덮어쓰기 금지, 한 이벤트 = 한 줄**)

## 이벤트 스키마 (single-line JSON, 멀티라인 금지)
```json
{"phase":2,"agent":"pm","event":"complete","timestamp":"2026-06-23T10:00:00Z","output_file":"pm-analysis.md","summary":"...","decisions":[{"type":"priority","item":"US-1","value":"P0","reason":"..."}],"metrics":{"stories":5,"p0":2,"p1":2,"p2":1},"disputes":[]}
```
- `phase`: 정수 Phase 번호.
- `agent`: 에이전트 이름.
- `event`: `"complete"`.
- `timestamp`: ISO8601 (UTC, `Z`).
- `output_file`: 직전 산출물 파일명.
- `summary`: 한 줄 요약(한국어).
- `decisions[]`: `{type,item,value,reason}`. ESCALATE는 `type:"escalate"`.
- `metrics{}`: Phase별 핵심 수치(스토리 수, P0/P1/P2, slop 등).
- `disputes[]`: 미해결 분쟁(없으면 `[]`).

## Phase 8 특례
Phase 7(Synthesis) 완료 후, 파이프라인 종료를 알리는 이벤트도 append:
```json
{"phase":8,"agent":"pipeline","event":"complete","timestamp":"...","output_file":"PRD.md","summary":"파이프라인 완료","decisions":[],"metrics":{"total_stories":N,"slop_removed":M,"disputes":K},"disputes":[]}
```

## 금지
- jsonl 덮어쓰기, 멀티라인 JSON, 타 파일 수정, 분석 내용 변경.

## 검증
append 후 마지막 줄이 유효한 single-line JSON인지 확인.
