# SNS Auto — ADHD 플래너 SNS 브랜딩 자동화 에이전트

ADHD 플래너의 메시지("흐릿한 목표 → 지금 할 첫 행동")를 인스타그램/스레드 콘텐츠로 변환해
기획·카피·이미지까지 자동 생성하고, 사람은 텔레그램에서 하루 한 번 1탭 승인만 하는 **반자동(승인제)** 파이프라인.

> 기획 산출물: `.scaffold/v0/workspace/`(PRD.md, prd.json, 6개 분석, observer 로그/HTML)
> 이 코드는 **외부 자격증명 없이 도는 코어(P0)** 를 우선 구현했다. 외부 연동은 인터페이스+stub까지.

## 빠른 시작 (외부 키 불필요)

```bash
npm install
npm test                              # tsc + 36 테스트
node dist/src/cli.js calendar 2026-06-01 14      # 2주치 캘린더
node dist/src/cli.js preview 2026-06-01 2026-06-01   # 그날 생성·검수·슬롯·승인알림
node dist/src/cli.js preview 2026-06-01 2026-06-01 --json
```

키 없이 실행하면 `StubLLM`(결정적)·`ConsoleNotifier`·`DryRunPublisher`로 전체 흐름이 돈다.

## 구조 (PRD 스토리 → 모듈)

| 모듈 | 파일 | 스토리 |
|---|---|---|
| 캘린더·주제 | `src/domain/calendar.ts`, `pillars.ts` | US-1, US-2 |
| 카피 생성(가드레일 프롬프트) | `src/generation/{llm,prompts,copywriter}.ts` | US-3, US-4, US-5 |
| 게시 전 자동 체크리스트 | `src/guardrail/checklist.ts` | US-6 |
| pencil.dev 슬롯 계약+어댑터 | `src/design/slots.ts` | US-7 |
| 승인 게이트(상태머신) | `src/publish/approval.ts` | US-8 |
| 텔레그램 알림 / IG·Threads 게시 / 성과 | `src/publish/{telegram,publisher}.ts` | US-9, US-10, US-11 |
| 파이프라인·CLI | `src/pipeline/orchestrator.ts`, `src/cli.ts` | US-12 |
| n8n 워크플로우 블루프린트 | `n8n/workflows/sns-auto.blueprint.json` | US-13 |

## 외부 설정 (env) — 채우면 stub → 실연동으로 자동 전환

| 변수 | 효과 | 없을 때 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 실제 카피 생성 | 결정적 stub |
| `CLAUDE_MODEL` | 모델 override(기본 `claude-sonnet-4-6`) | 기본값 |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | 실제 승인 알림 | 콘솔 출력 |
| `IG_USER_ID` `IG_TOKEN` `THREADS_USER_ID` `THREADS_TOKEN` | 실제 게시 | dry-run |

## 아직 안 된 것 (외부 설정/확인 필요 — 코드는 인터페이스까지)

- **pencil.dev 연동:** 결정=범용 슬롯 JSON. `DesignAdapter` 인터페이스 + 슬롯 파일 출력(`FileDesignAdapter`)까지 구현. 실제 연결(API/template export)은 pencil.dev 사양 확인 후 어댑터 1개만 추가하면 됨.
- **IG/Threads 게시:** 비즈 계정 + FB 페이지 연결 + 앱 심사(2~4주) + 토큰. 심사 전엔 슬롯 JSON/카피 export로 수동 게시.
- **텔레그램 봇 토큰**, **n8n 클라우드 Starter 호스팅**.

코드 내 외부 차단 지점은 `RALPH-BLOCKER:` 주석으로 표기.
