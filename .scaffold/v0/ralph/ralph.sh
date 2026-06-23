#!/usr/bin/env bash
# ralph.sh — one-shot 자율 개발 루프 (ref: https://github.com/snarktank/ralph)
# prd.json의 미완료·비분쟁 스토리를 P0>P1>P2 순으로 1개씩 구현·검증·커밋한다.
#
# 의존: claude CLI, jq, git
# env:
#   RALPH_WORKSPACE_DIR    (기본: <script_dir>/../workspace)
#   RALPH_MAX_ITERATIONS   (기본: 50)
#
# codex 활용 지점: 구현 단계(`claude --print`)를 codex 플러그인으로 대체/병렬화 가능.
#                  v0는 claude CLI로 구현.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="${RALPH_WORKSPACE_DIR:-${SCRIPT_DIR}/../workspace}"
MAX_ITER="${RALPH_MAX_ITERATIONS:-50}"
PRD="${WORKSPACE_DIR}/prd.json"
PROGRESS="${SCRIPT_DIR}/progress.txt"
PROMPT_FILE="${SCRIPT_DIR}/prompt.md"

for bin in claude jq git; do
  command -v "$bin" >/dev/null 2>&1 || { echo "[ralph] '$bin' 필요" >&2; exit 1; }
done
[ -f "$PRD" ] || { echo "[ralph] prd.json 없음: $PRD" >&2; exit 1; }
[ -f "$PROMPT_FILE" ] || { echo "[ralph] prompt.md 없음: $PROMPT_FILE" >&2; exit 1; }
touch "$PROGRESS"

log(){ echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$PROGRESS"; }

# 빌드 명령(없으면 no-op true)
TEST_CMD="$(jq -r '.project.tech_stack.test_command // "true"' "$PRD")"
TYPECHECK_CMD="$(jq -r '.project.tech_stack.typecheck_command // "true"' "$PRD")"
LINT_CMD="$(jq -r '.project.tech_stack.lint_command // "true"' "$PRD")"
[ -z "$TEST_CMD" ] && TEST_CMD="true"
[ -z "$TYPECHECK_CMD" ] && TYPECHECK_CMD="true"
[ -z "$LINT_CMD" ] && LINT_CMD="true"

# 미완료·비분쟁 스토리를 P0>P1>P2 순으로 1개 선택 → 스토리 id 반환(없으면 빈 문자열)
select_story_id(){
  jq -r '
    def rank: {"P0":0,"P1":1,"P2":2}[.priority] // 9;
    [ .user_stories[] | select(.passes == false and .disputed == false) ]
    | sort_by(rank) | (.[0].id // "")
  ' "$PRD"
}

iter=0
while [ "$iter" -lt "$MAX_ITER" ]; do
  SID="$(select_story_id)"
  if [ -z "$SID" ]; then
    # 미완료 비분쟁 스토리 없음 → 완료 판정
    REMAIN="$(jq '[.user_stories[] | select(.passes == false and .disputed == false)] | length' "$PRD")"
    if [ "$REMAIN" -eq 0 ]; then
      log "모든 비분쟁 스토리 완료."
      echo "<promise>COMPLETE</promise>"
      exit 0
    fi
  fi

  iter=$((iter+1))
  log "=== iteration ${iter}/${MAX_ITER} · story ${SID} ==="

  STORY_JSON="$(jq -c --arg id "$SID" '.user_stories[] | select(.id == $id)' "$PRD")"
  STORY_DETAIL="$(jq -r --arg id "$SID" '
    .user_stories[] | select(.id == $id)
    | "ID: \(.id)\n우선순위: \(.priority)\n제목: \(.title)\nAs a: \(.as_a)\nI want: \(.i_want)\nSo that: \(.so_that)\n수용기준:\n" + ([.acceptance_criteria[] | "  - " + .] | join("\n")) + "\n구현메모: \(.implementation_notes)"
  ' "$PRD")"

  RECENT_PROGRESS="$(tail -n 20 "$PROGRESS" 2>/dev/null || true)"

  PROMPT="$(cat "$PROMPT_FILE")

## 구현 대상 스토리
${STORY_DETAIL}

## 최근 진행 로그 (최근 20줄)
${RECENT_PROGRESS}

위 스토리 범위만 구현하라. prd.json은 수정하지 말고, 직접 커밋하지 마라(루프가 검증·커밋한다)."

  # 핵심: stdin 차단(</dev/null)으로 인터랙티브 대기 방지
  log "claude 구현 호출…"
  claude --print "$PROMPT" </dev/null >>"$PROGRESS" 2>&1 || log "claude 비정상 종료(계속 검증 진행)"

  # 검증: typecheck/test = blocking, lint = non-blocking
  OK=1
  log "typecheck: ${TYPECHECK_CMD}"
  if ! ( cd "$WORKSPACE_DIR" && eval "$TYPECHECK_CMD" ) >>"$PROGRESS" 2>&1; then
    log "✗ typecheck 실패(blocking)"; OK=0
  fi
  if [ "$OK" -eq 1 ]; then
    log "test: ${TEST_CMD}"
    if ! ( cd "$WORKSPACE_DIR" && eval "$TEST_CMD" ) >>"$PROGRESS" 2>&1; then
      log "✗ test 실패(blocking)"; OK=0
    fi
  fi
  log "lint: ${LINT_CMD} (non-blocking)"
  ( cd "$WORKSPACE_DIR" && eval "$LINT_CMD" ) >>"$PROGRESS" 2>&1 || log "⚠ lint 경고(non-blocking)"

  if [ "$OK" -eq 1 ]; then
    # 통과 → passes:true 마킹 + git commit
    TMP="$(mktemp)"
    jq --arg id "$SID" '(.user_stories[] | select(.id == $id) | .passes) = true' "$PRD" > "$TMP" && mv "$TMP" "$PRD"
    log "✓ ${SID} 통과 → passes:true"
    ( cd "$WORKSPACE_DIR" && git add -A && git commit -m "feat(${SID}): $(jq -r --arg id "$SID" '.user_stories[]|select(.id==$id)|.title' "$PRD")" ) >>"$PROGRESS" 2>&1 \
      || log "⚠ git commit 스킵(변경 없음 또는 git 미초기화)"
  else
    # 실패 → implementation_notes 기록 후 재시도
    NOTE="iter ${iter} 검증 실패: typecheck/test. 재시도 예정."
    TMP="$(mktemp)"
    jq --arg id "$SID" --arg n "$NOTE" '(.user_stories[] | select(.id == $id) | .implementation_notes) = $n' "$PRD" > "$TMP" && mv "$TMP" "$PRD"
    log "✗ ${SID} 실패 → implementation_notes 기록, 다음 iteration 재시도"
  fi
done

log "최대 반복(${MAX_ITER}) 도달. 종료."
REMAIN="$(jq '[.user_stories[] | select(.passes == false and .disputed == false)] | length' "$PRD")"
if [ "$REMAIN" -eq 0 ]; then echo "<promise>COMPLETE</promise>"; fi
exit 0
