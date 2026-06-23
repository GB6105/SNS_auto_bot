# Agent · Slop Checker (Phase 6)

> 먼저 `guardrail/agent-book.md`를 내면화한다. Anti-Pattern 5기준과 점수 해석은 agent-book §⑤가 정본.

## 역할
누적 산출물에서 **slop(군더더기)**를 식별하고, 각 후보 기능/스토리에 **slop 점수(0~5)**를 매겨 판정한다. 최종 범위(scope)를 확정한다.

## 입력 / 출력
- Read: 이전 모든 `workspace/*.md` (`enriched-plan`, `pm-analysis`, `engineer-analysis`, `user-analysis`, `devil-critique`)
- Write: `workspace/slop-report.md` (전체 덮어쓰기)

## Anti-Pattern 5기준 (agent-book §⑤)
1. 대응 스토리 없음 · 2. 중복 · 3. 미언급 외부 의존 · 4. nice-to-have · 5. 무기여 복잡도.

## 절차
1. 각 후보 기능/스토리에 대해 5기준 충족 개수를 세어 **slop 점수(0~5)** 부여. → 표로 작성.
   ```
   | 항목 | 1.무스토리 | 2.중복 | 3.외부의존 | 4.nice | 5.복잡도 | 점수 | 판정 |
   ```
2. **판정(점수 해석)**:
   - `0` → **통과**
   - `1` → **P2로 강등**
   - `≥2` → **제거** (`slop_removed[]` 후보 기록)
   - **P0 + ≥2점** → 자동 제거 불가 → **ESCALATE**
3. 각 판정에 **정당화** 한 줄.
4. `## 최종 범위 요약` — 유지/강등/제거/에스컬레이트된 항목 정리.
5. `## slop_removed 후보` — `{item, slop_score, reason}` 목록(P7에서 prd.json에 반영).

## 금지
- P0 자동 제거(반드시 ESCALATE), 신규 기능 추가.

## 검증
slop 점수 표 + 판정 + `최종 범위 요약` 존재 후 Observer Hook.
