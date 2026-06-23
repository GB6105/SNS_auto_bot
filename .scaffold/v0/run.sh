#!/usr/bin/env bash
# run.sh — prd-scaffold-v0 단일 엔트리 포인트
#
# 추상 Plan(workspace/input-plan.txt) → PRD 파이프라인을 띄운다.
#
# 사용:
#   bash .scaffold/v0/run.sh            # Phase 0 준비 + 대화형 실행 안내(권장)
#   bash .scaffold/v0/run.sh --headless # claude --print로 파이프라인 비대화 실행
#   bash .scaffold/v0/run.sh --ralph    # PRD 생성 후 Ralph 개발 루프까지 연속 실행(headless)
#
# env:
#   RALPH_WORKSPACE_DIR  workspace 경로 오버라이드(기본: <script_dir>/workspace)
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # .scaffold/v0
WORKSPACE_DIR="${RALPH_WORKSPACE_DIR:-${SCRIPT_DIR}/workspace}"
PLAN="${WORKSPACE_DIR}/input-plan.txt"
JSONL="${WORKSPACE_DIR}/observer-log.jsonl"

MODE="interactive"
case "${1:-}" in
  --headless) MODE="headless" ;;
  --ralph)    MODE="ralph" ;;
  "" )        MODE="interactive" ;;
  *) echo "알 수 없는 옵션: $1 (사용: [--headless|--ralph])" >&2; exit 1 ;;
esac

mkdir -p "$WORKSPACE_DIR"

# ── Phase 0: 입력 계획 확인 ───────────────────────────────────────────
if [ ! -f "$PLAN" ]; then
  cat > "$PLAN" <<'PLAN'
# 추상 계획(input-plan.txt)
# 만들고 싶은 제품의 아이디어를 자유 형식으로 적으세요. 완전한 명세가 아니어도 됩니다.
# 작성 후 다시 run.sh를 실행하세요.
#
# 예) 동네 러닝 크루를 위한 모바일 앱. 코스 공유와 출석 체크가 핵심.
PLAN
  echo "[run] 입력 계획이 없어 템플릿을 생성했습니다:"
  echo "      $PLAN"
  echo "      → 계획을 작성한 뒤 다시 실행하세요."
  exit 2
fi

# 주석/빈 줄을 제외한 실내용이 있는지 확인
if ! grep -qvE '^\s*(#.*)?$' "$PLAN"; then
  echo "[run] $PLAN 에 주석 외 실내용이 없습니다. 계획을 작성한 뒤 다시 실행하세요." >&2
  exit 2
fi

# ── Phase 0: observer-log.jsonl 초기화(멱등) ─────────────────────────
: > "$JSONL"
echo "[run] workspace: $WORKSPACE_DIR"
echo "[run] observer-log.jsonl 초기화 완료"

# 오케스트레이터에게 줄 부트스트랩 프롬프트
read -r -d '' BOOT <<BOOT || true
이 프로젝트의 .scaffold/v0/CLAUDE.md(오케스트레이터)와 그것이 import하는
.scaffold/v0/guardrail/agent-book.md, .scaffold/v0/guide/flows/prd-generation.md를 읽고 내면화하라.
그런 다음 .scaffold/v0/workspace/input-plan.txt 를 입력으로 PRD 생성 파이프라인(Phase 1~8)을 끝까지 실행하라.
산출물은 .scaffold/v0/workspace 아래에 쓴다. 사용자에게 질문하지 말고 도메인 기본값으로 진행하라.
run scaffold
BOOT

case "$MODE" in
  interactive)
    echo
    echo "════════════════════════════════════════════════════════════════"
    echo " 대화형 실행 (권장)"
    echo "════════════════════════════════════════════════════════════════"
    echo " 이 디렉토리에서 Claude Code를 열고 아래 문구를 입력하세요:"
    echo
    echo "     PRD 생성"
    echo
    echo " (트리거: 'PRD 생성' / 'generate PRD' / 'prd' / 'run scaffold')"
    echo " 루트 CLAUDE.md가 .scaffold/v0/CLAUDE.md를 import하면 자동 인식됩니다."
    echo "════════════════════════════════════════════════════════════════"
    ;;
  headless|ralph)
    command -v claude >/dev/null 2>&1 || { echo "[run] claude CLI 필요(headless)" >&2; exit 1; }
    echo "[run] headless 파이프라인 실행(claude --print)…"
    ( cd "$(dirname "$SCRIPT_DIR")/.." && claude --print "$BOOT" </dev/null )
    # Phase 8 렌더(오케스트레이터가 이미 돌렸다면 멱등 재생성)
    if command -v jq >/dev/null 2>&1 && [ -s "$JSONL" ]; then
      bash "$SCRIPT_DIR/observer/generate-html.sh" "$WORKSPACE_DIR" || true
    fi
    echo "[run] PRD 산출물: $WORKSPACE_DIR/PRD.md, prd.json"
    if [ "$MODE" = "ralph" ]; then
      echo "[run] Ralph 개발 루프 시작…"
      RALPH_WORKSPACE_DIR="$WORKSPACE_DIR" bash "$SCRIPT_DIR/ralph/ralph.sh"
    else
      echo "[run] 개발 루프를 돌리려면:"
      echo "      RALPH_WORKSPACE_DIR=\"$WORKSPACE_DIR\" bash $SCRIPT_DIR/ralph/ralph.sh"
    fi
    ;;
esac
