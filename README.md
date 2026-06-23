# SNS Auto — ADHD 플래너 SNS 브랜딩 자동화 에이전트

ADHD 플래너의 메시지("흐릿한 목표 → 지금 할 첫 행동")를 인스타그램/스레드 콘텐츠로 변환해
기획·카피·이미지까지 자동 생성하고, 사람은 텔레그램에서 하루 한 번 1탭 승인만 하는 **반자동(승인제)** 파이프라인.

> 기획 산출물: `.scaffold/v0/workspace/`(PRD.md, prd.json, 6개 분석, observer 로그/HTML)
> 이 코드는 **외부 자격증명 없이 도는 코어(P0)** 를 우선 구현했다. 외부 연동은 인터페이스+stub까지.

## 빠른 시작 (외부 키 불필요)

```bash
npm install
npm test                              # tsc + 51 테스트

node dist/src/cli.js calendar 2026-06-01 14            # 2주치 캘린더
node dist/src/cli.js preview  2026-06-01 2026-06-01    # 생성·이미지렌더(SVG)·검수·저장·승인알림
node dist/src/cli.js decide   "2026-06-01:instagram:empathy" approve   # 승인→호스팅→게시
node dist/src/cli.js decide   "2026-06-01:threads:serious"  discard    # 폐기
node dist/src/cli.js tick                              # 무응답 리마인드/만료 1회
node dist/src/cli.js serve    8080                     # 텔레그램 콜백 웹훅 서버
```

키 없이 실행하면 `StubLLM`(결정적)·`SvgRenderer`·`StubImageHost`·`ConsoleNotifier`·`DryRunPublisher`로
**캘린더→카피→이미지→검수→저장→승인→(dry-run)게시**까지 전 흐름이 돈다. 상태는 `out/state.json`에 영속.

## 구조 (PRD 스토리 → 모듈)

| 모듈 | 파일 | 스토리 |
|---|---|---|
| 캘린더·주제 | `src/domain/calendar.ts`, `pillars.ts` | US-1, US-2 |
| 카피 생성(가드레일 프롬프트) | `src/generation/{llm,prompts,copywriter}.ts` | US-3, US-4, US-5 |
| 게시 전 자동 체크리스트 | `src/guardrail/checklist.ts` | US-6 |
| pencil.dev 슬롯 계약+어댑터 | `src/design/slots.ts` | US-7 |
| 이미지 렌더(SVG/Puppeteer PNG) + 호스팅 | `src/design/{template,renderer,imagehost}.ts` | US-7 |
| 승인 게이트(상태머신) | `src/publish/approval.ts` | US-8 |
| 상태 영속화(JSON/메모리 스토어) | `src/store/store.ts` | US-8/12 |
| 승인 스케줄러(리마인드/만료) + 웹훅 | `src/publish/{scheduler,webhook}.ts`, `src/server.ts` | US-8/9 |
| 텔레그램 알림 / IG·Threads 게시 / 성과 | `src/publish/{telegram,publisher}.ts` | US-9, US-10, US-11 |
| 파이프라인·CLI | `src/pipeline/orchestrator.ts`, `src/cli.ts` | US-12 |
| n8n 워크플로우 블루프린트(선택) | `n8n/workflows/sns-auto.blueprint.json` | US-13 |

> **n8n은 선택사항**: `serve`(웹훅) + `tick`(cron으로 호출) 조합으로 n8n 없이 코드만으로 구동 가능.

## 외부 설정 (env) — 채우면 stub → 실연동으로 자동 전환

| 변수 | 효과 | 없을 때 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 실제 카피 생성 | 결정적 stub |
| `CLAUDE_MODEL` | 모델 override(기본 `claude-sonnet-4-6`) | 기본값 |
| `IMAGE_RENDERER=puppeteer` | 진짜 PNG 렌더(`npm i puppeteer` 필요) | SVG 렌더 |
| `IMAGE_UPLOAD_BASE` `IMAGE_PUBLIC_BASE` `IMAGE_UPLOAD_TOKEN` | 이미지 공개 호스팅(IG `image_url`) | file:// stub |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | 실제 승인 알림 | 콘솔 출력 |
| `IG_USER_ID` `IG_TOKEN` `THREADS_USER_ID` `THREADS_TOKEN` | 실제 게시 | dry-run |

## 남은 외부 설정 (1회, 코드는 전부 준비됨 — 토큰만 꽂으면 동작)

- **Anthropic 키 / Telegram 봇 토큰** — 발급 5분.
- **이미지 PNG:** `npm i puppeteer` (Chromium 다운로드). 안 하면 SVG로 미리보기/수동 게시.
- **이미지 공개 호스팅:** S3/R2 등 공개 버킷(IG는 `image_url`만 받음). `HttpPutImageHost` 준비됨.
- **Instagram 게시:** 비즈/크리에이터 계정 + FB 페이지 연결 + Meta 앱 생성 + 본인 IG를 앱에 역할 추가 + 장기 토큰.
  → **본인 계정 게시는 보통 앱 심사(2~4주) 없이 가능** (개발 모드/역할 부여). 비즈니스 인증만 걸릴 수 있음.
- **Threads 게시:** Meta 앱 + 토큰.

코드 내 외부 차단 지점은 `RALPH-BLOCKER:` 주석으로 표기. 모든 외부 I/O는 인터페이스+stub 뒤에 있어
env만 채우면 stub→실연동으로 자동 전환된다.
