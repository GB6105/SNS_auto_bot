# Engineer Analysis

`enriched-plan.md` + `pm-analysis.md` 기반 타당성·위험·블로커·스택을 평가한다. 우선순위는 바꾸지 않는다(PM 주권). 외부 자격증명/심사/호스팅이 필요한 스토리는 **인터페이스+stub까지 구현 가능, 실연결만 블로커**로 분리한다.

## 스택 추천
- **언어/런타임:** TypeScript + Node 20+ (ESM). n8n·IG Graph·Threads 생태계와 정합. 의존성 최소화.
- **빌드:** `tsc`. 런타임 의존 0(코어), 개발 의존 = typescript, @types/node 만.
- **HTTP:** Node 내장 `fetch`(Claude/IG/Threads/Telegram). SDK 미도입으로 무키 환경에서도 설치 가벼움.
- **테스트:** `node --test`(내장) — 추가 의존 없음. 도메인/가드레일/캘린더/슬롯/상태머신은 결정적이라 단위테스트 적합.
- **상태 저장:** MVP는 JSON 파일 스토어(`workspace`/런타임 디렉토리). n8n 이전 시 외부 DB로 교체 가능하게 `Store` 인터페이스로 추상화.

## 빌드 명령 (prd.json tech_stack)
- test: `npm test`  → `tsc --noEmit && node --test`
- typecheck: `npm run typecheck` → `tsc --noEmit`
- lint: `npm run lint` → `tsc --noEmit`  (별도 ESLint 미도입, 타입체크로 대체 — 의존 최소화)

## 스토리별 위험도 / 블로커

| 스토리 | 위험 | 블로커 | 노트 |
|---|---|---|---|
| US-1 캘린더 | LOW | 없음 | 순수 함수. 결정적 날짜 매핑. 격주 교차는 ISO week 패리티로. |
| US-2 주제 선정 | LOW | 없음 | 풀에서 미사용 우선 선택. 상태에 used 마킹. |
| US-3 IG 카피 | MED | 없음(stub로 개발 가능) | 구조화 출력 강제 필요 → JSON 스키마 응답 + 파서. 무키 시 결정적 stub. |
| US-4 스레드 카피 | MED | 없음 | 280자 제약·질문형 종료 후처리 검증. |
| US-5 Claude 클라이언트 | MED | API 키(런타임만) | 키 없으면 stub. 최신 모델 claude-opus-4-8 기본. 재시도/타임아웃. |
| US-6 체크리스트 | MED | 없음 | 규칙기반 정규식+휴리스틱. 통계(숫자+%/명), 사연("어떤 분이/DM"), 의학단정("완치/치료된다"), 출처필요. 오탐은 warn(차단 아님). |
| US-7 슬롯 계약 | LOW | pencil.dev 연결방식(실연결만) | 범용 슬롯 JSON + DesignAdapter 인터페이스. 기본 어댑터=파일 출력. |
| US-8 승인 게이트 | LOW | 없음 | 상태머신 전이표 + 가드. 24h 만료는 타임스탬프 비교(주입식 clock). |
| US-9 텔레그램 봇 | MED | BOT_TOKEN(실연결만) | sendMessage+inline keyboard 포맷. 무토큰 콘솔 stub. Webhook 수신은 n8n 측. |
| US-10 IG/Threads 게시 | HIGH | 비즈계정·앱심사·토큰(실연결만) | IG: 미디어 컨테이너→publish 2단계. Threads 별도 API. dry-run stub. 24h 25건 한도 주의. |
| US-11 성과 수집 | MED | API 권한(실연결만) | insights 엔드포인트. stub. |
| US-12 CLI 파이프라인 | LOW | 없음 | 코어 조립. 결정적. |
| US-13 n8n 블루프린트 | LOW | n8n 호스팅(임포트만) | 워크플로우 JSON 설계도. 실행은 클라우드. |

## 외부 차단 요인 (RALPH-BLOCKER 대상 — 코드에 주석으로 표기)
1. `ANTHROPIC_API_KEY` — 없으면 stub 동작(개발/테스트 가능, 실 카피 품질만 차단).
2. `TELEGRAM_BOT_TOKEN` + chat_id — 승인 알림 실발송.
3. IG Graph API: 비즈/크리에이터 계정 + FB 페이지 연결 + 앱 심사(2~4주) + 장기 토큰.
4. Threads API: 별도 앱/토큰.
5. pencil.dev: 연결 방식(API/export) 미확정 → DesignAdapter 실구현 보류.
6. n8n 클라우드 Starter 인스턴스(호스팅) — 워크플로우 임포트/실행.

## 결정적 설계 원칙
- 모든 외부 I/O는 인터페이스(`LLM`, `DesignAdapter`, `Notifier`, `Publisher`, `InsightsSource`, `Store`, `Clock`) 뒤로. 기본 구현은 무자격증명 stub → 외부 설정 완료 시 실구현 주입(DI).
- 코어(도메인/가드레일/생성 후처리/상태머신)는 순수·결정적 → 테스트로 잠금.
