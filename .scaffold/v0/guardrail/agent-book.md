# Agent Book — Guardrail (Scaffold v0)

> 모든 에이전트는 작업 시작 전 이 문서를 **내면화(internalize)**한다.
> 이 문서는 파이프라인의 헌법이다. 역할 카드(`guide/agents/*.md`)와 충돌하면 본 문서가 우선한다.

---

## ① Universal Rules (전 에이전트 공통)

1. **Workspace I/O 한정** — 읽기/쓰기는 오직 `workspace/` 디렉토리 내부로 제한한다. 코드베이스 소스, 스캐폴드 파일(`guide/`, `guardrail/`, `ralph/`, `observer/`)은 절대 수정하지 않는다.
2. **타 에이전트 출력 금지** — 자신에게 할당된 출력 파일 **하나만** 쓴다. 다른 에이전트의 산출물(`*.md`, `*.json`)은 **읽기 전용**이다. (예외: Observer는 `observer-log.jsonl`에 append 가능 — §②)
3. **언어 규약** — `PRD.md` / `prd.json`의 **콘텐츠(값)는 한국어**, **JSON 키는 영어**로 작성한다. 분석 중간 산출물(`*-analysis.md` 등)도 한국어 서술을 기본으로 한다.
4. **사용자 질문 금지** — 파이프라인 실행 중 사용자에게 질문하지 않는다. 정보가 부족하면 **도메인 기본값 / 보수적 가정**으로 메운다(Socratic의 자문자답 원칙). 가정은 명시적으로 기록한다.
5. **멱등성(Idempotency)** — 각 에이전트의 출력은 **전체 덮어쓰기(overwrite)**다. 기존 파일에 append 하지 않는다. (예외: Observer의 jsonl append — §②) 같은 입력 → 같은 출력을 지향한다.
6. **역할 경계 준수** — 자신의 역할 카드에 정의된 권한 밖의 결정을 내리지 않는다. (예: Engineer는 우선순위를 바꾸지 않는다, Socratic은 기능을 추가하지 않는다.)
7. **최소 Scope(Minimal Scope)** — 요청받은 산출물만 생성한다. 추측성 확장, 미암시 기능, 불필요한 복잡도를 도입하지 않는다.
8. **핸드오프 입력** — 각 에이전트는 **이전 단계까지의 `*.md` 산출물만** 읽는다. 자기 출력만 쓴다. 순차 A2A 핸드오프를 깨지 않는다.

---

## ② Per-Agent Allowed / Forbidden

| Agent | Reads | Writes | Allowed | Forbidden |
|---|---|---|---|---|
| **Socratic** (P1) | `input-plan.txt` | `enriched-plan.md` | 3-pass 추론, 도메인 기본값으로 None 채움, Open Assumptions 명시, Mermaid 시퀀스 다이어그램 | 원문 삭제, 원문에 미암시된 기능 추가, 우선순위 부여 |
| **PM** (P2) | `enriched-plan.md` | `pm-analysis.md` | 에픽 그룹화, 스토리화(As a/I want/So that), P0/P1/P2 부여, T-shirt 추정, 의존성 정의, 우선순위 **주권** | 신규 요구사항 발명, 기술 스택 결정, 코드 작성 |
| **Engineer** (P3) | `enriched-plan.md`, `pm-analysis.md` | `engineer-analysis.md` | 타당성/위험 평가(LOW/MED/HIGH), 블로커 식별, 스택 추천, 빌드 명령 제안 | 우선순위 변경, 기능 제거, 실제 코드 작성 |
| **User** (P4) | `enriched-plan.md`, `pm-analysis.md` | `user-analysis.md` | 사용자 저니, UX 수용기준, 마찰지점, 접근성 평가 | 기술 타당성 평가, 우선순위 변경 |
| **Devil** (P5) | 이전 모든 `*.md` | `devil-critique.md` | 5유형 챌린지 **정확히 3~10개**(유형+대상+근거+제안) | 전면 거부, 모호한 비판, 신규 스토리 작성 |
| **SlopChecker** (P6) | 이전 모든 `*.md` | `slop-report.md` | Anti-Pattern 5기준 slop 점수(0~5), 판정, 정당화, 최종 범위 요약, slop_removed 후보 기록 | P0 자동 제거(→ ESCALATE), 신규 기능 추가 |
| **Observer** (Hook) | 직전 단계 output 1개 | `observer-log.jsonl` (**append-only**) | jsonl에 **한 줄 = 한 이벤트** append, 한 줄 유효 JSON | jsonl 덮어쓰기, 멀티라인 JSON, 타 파일 수정, 분석 내용 변경 |

> **Observer 특례**: 유일하게 append가 허용된 에이전트. 그래도 **덮어쓰기는 금지**다. 한 이벤트는 정확히 한 줄(개행 없는 single-line JSON)이다.

---

## ③ Output Validity (검증 게이트)

각 단계 종료 시 아래 조건을 만족해야 다음 단계로 핸드오프한다. 불만족이면 해당 에이전트가 출력을 재작성한다.

| Output | Validity 조건 |
|---|---|
| `enriched-plan.md` | `## Enriched Plan` 헤딩 존재, `Open Assumptions` 섹션 존재, 마지막에 `### 추론 시퀀스 다이어그램`(Mermaid `sequenceDiagram`) 존재 |
| `pm-analysis.md` | `- [ ]` 형식 스토리 **≥1개**, **P0 ≥1개**, 각 스토리에 As a/I want/So that + 수용기준 |
| `engineer-analysis.md` | 스토리별 위험도(LOW/MED/HIGH), 빌드 명령(test/typecheck/lint) 제안 존재 |
| `user-analysis.md` | 사용자 저니(첫 사용/일상) + UX 수용기준 + 접근성 섹션 존재 |
| `devil-critique.md` | 챌린지 개수가 **정확히 3~10개**, 각 항목 유형∈{가정,범위,모순,타당성,가치} |
| `slop-report.md` | slop 점수 표 존재, 판정(통과/강등/제거/ESCALATE), `최종 범위 요약` 섹션 존재 |
| `prd.json` | 유효 JSON, 모든 `user_stories[].passes == false`, 스키마 `prd.schema.v0` |
| `PRD.md` | 11개 섹션, 한국어 콘텐츠, P0/P1/P2 스토리 구분 |
| `observer-log.jsonl` | 이벤트 **≥7개**(Phase1~7) + Phase8 pipeline 이벤트, **각 줄이 유효한 single-line JSON** |

---

## ④ Conflict Resolution (분쟁 해결)

1. 에이전트 간 의견 충돌은 `disputes[]` 배열로 기록한다 — `{item, raised_by, issue, resolution}`.
2. **PM이 우선순위 주권**을 가진다. 우선순위 분쟁은 PM 판단으로 해소한다. (단, **기술적/법적 blocker**는 예외 — Engineer/법적 제약이 우선.)
3. 합의에 도달하지 못한 항목은 `prd.json`에서 해당 스토리 `disputed: true`로 마킹하고 `disputes[]`에 남긴다.
4. **Devil이 P0 스토리를 blocker로 챌린지**한 경우, SlopChecker는 자동 제거하지 않고 **ESCALATE**한다(사용자/오케스트레이터 판단 필요). Observer 이벤트의 `decisions[].type == "escalate"`로 표기한다.

---

## ⑤ Anti-Patterns (Slop 5기준)

SlopChecker는 각 후보 기능/스토리에 대해 아래 5기준의 충족 개수를 **slop 점수(0~5)**로 매긴다.

1. **대응 스토리 없음** — 원문/enriched에 근거가 없는, 어느 사용자 스토리에도 매핑되지 않는 기능.
2. **중복(Duplication)** — 이미 다른 스토리가 커버하는 기능의 재포장.
3. **미언급 외부 의존** — 원문에 없던 외부 서비스/SDK/플랫폼 의존을 새로 끌어들임.
4. **Nice-to-have** — 핵심 가치에 필수적이지 않은 장식적 기능.
5. **무기여 복잡도** — 가치 대비 구현/유지 복잡도만 늘리는 항목.

**점수 해석**
- `0` → **통과**(scope 유지)
- `1` → **P2로 강등**
- `≥2` → **제거**(`slop_removed[]`에 기록)
- 단, **P0 항목이 ≥2점**이면 자동 제거 불가 → **ESCALATE** (§④-4).
