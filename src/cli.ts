// US-12 CLI 엔트리. 외부 설정 없이 전체 흐름을 콘솔/JSON으로 확인.
// 사용:
//   node dist/src/cli.js calendar <start=YYYY-MM-DD> [days]
//   node dist/src/cli.js preview  <start> <date> [--json]   생성·렌더·검수·저장·승인알림
//   node dist/src/cli.js tick                                리마인드/만료 스케줄러 1회
//   node dist/src/cli.js decide   <id> <approve|revise|discard>   승인 콜백 시뮬/실행
//   node dist/src/cli.js serve    [port]                    텔레그램 웹훅 서버
import { promises as fs } from "node:fs";
import path from "node:path";
import { assignTopics, buildCalendar } from "./domain/calendar.js";
import { PILLAR_LABEL, THREAD_TONE_LABEL } from "./domain/types.js";
import { makeLLM } from "./generation/llm.js";
import { makeNotifier } from "./publish/telegram.js";
import { FileDesignAdapter } from "./design/slots.js";
import { makeRenderer } from "./design/renderer.js";
import { makeImageHost } from "./design/imagehost.js";
import { makePublisher } from "./publish/publisher.js";
import { JsonFileStore } from "./store/store.js";
import { prepareForDate } from "./pipeline/orchestrator.js";
import { tickPending } from "./publish/scheduler.js";
import { handleCallback, type CallbackAction } from "./publish/webhook.js";
import { startServer } from "./server.js";

const OUT = path.resolve("out");
const STATE = path.join(OUT, "state.json");

function todayIsoFallback(): string {
  return new Date().toISOString().slice(0, 10);
}

async function ensureOut(): Promise<void> {
  await fs.mkdir(OUT, { recursive: true });
}

function makeStore(): JsonFileStore {
  return new JsonFileStore(STATE, (p) => fs.readFile(p, "utf8"), (p, d) => fs.writeFile(p, d, "utf8"));
}

async function cmdCalendar(start: string, days: number): Promise<void> {
  const cal = assignTopics(buildCalendar(start, days));
  console.log(`📅 캘린더 (${start}부터 ${days}일)\n`);
  for (const it of cal) {
    if (it.platform === "instagram") {
      console.log(`${it.date}  📸 IG    ${PILLAR_LABEL[it.pillar!].padEnd(8)} ${it.topic ?? ""}`);
    } else {
      console.log(`${it.date}  🧵 스레드 ${THREAD_TONE_LABEL[it.tone!]}`);
    }
  }
}

async function cmdPreview(start: string, date: string, asJson: boolean): Promise<void> {
  await ensureOut();
  const design = new FileDesignAdapter(async (p, d) => fs.writeFile(p, d, "utf8"), OUT);
  const renderer = makeRenderer(
    async (p, d) => fs.writeFile(p, d, "utf8"),
    async (p, d) => fs.writeFile(p, d),
    OUT,
  );
  const prepared = await prepareForDate(start, date, {
    llm: makeLLM(),
    notifier: makeNotifier(),
    design,
    renderer,
    store: makeStore(),
  });

  if (asJson) {
    console.log(JSON.stringify(prepared, null, 2));
    return;
  }
  if (prepared.length === 0) {
    console.log(`(${date}에 예정된 항목이 없습니다 — 캘린더 시작일/날짜를 확인하세요)`);
    return;
  }
  console.log(`\n— ${prepared.length}건 생성·렌더·검수·저장 완료, 승인 대기(awaiting_approval). 상태: ${STATE} —`);
}

async function cmdTick(): Promise<void> {
  await ensureOut();
  const summary = await tickPending(makeStore(), makeNotifier());
  console.log(`⏰ 리마인드 ${summary.reminded.length}건, 만료(폐기) ${summary.expired.length}건`);
}

async function cmdDecide(id: string, action: CallbackAction): Promise<void> {
  await ensureOut();
  const result = await handleCallback(id, action, {
    store: makeStore(),
    publisher: makePublisher(),
    host: makeImageHost((p) => fs.readFile(p)),
  });
  console.log(`결정: ${action} → 상태 ${result.status}` + (result.publish ? ` (${result.publish.note ?? result.publish.postId})` : ""));
}

async function cmdServe(port: number): Promise<void> {
  await ensureOut();
  startServer(
    { store: makeStore(), publisher: makePublisher(), host: makeImageHost((p) => fs.readFile(p)) },
    port,
  );
  // 서버 유지
  await new Promise(() => {});
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "calendar":
      await cmdCalendar(rest[0] ?? todayIsoFallback(), rest[1] ? Number(rest[1]) : 14);
      break;
    case "preview":
      await cmdPreview(rest[0] ?? todayIsoFallback(), rest[1] ?? rest[0] ?? todayIsoFallback(), rest.includes("--json"));
      break;
    case "tick":
      await cmdTick();
      break;
    case "decide": {
      const [id, action] = rest;
      if (!id || !["approve", "revise", "discard"].includes(action ?? "")) {
        console.log("사용: decide <id> <approve|revise|discard>");
        break;
      }
      await cmdDecide(id, action as CallbackAction);
      break;
    }
    case "serve":
      await cmdServe(rest[0] ? Number(rest[0]) : 8080);
      break;
    default:
      console.log(`SNS 자동화 에이전트 CLI

명령:
  calendar <start=YYYY-MM-DD> [days]      2주치 캘린더 출력
  preview  <start> <date> [--json]        생성·렌더·검수·저장·승인알림(승인 게이트에서 멈춤)
  tick                                    리마인드/만료 스케줄러 1회 실행
  decide   <id> <approve|revise|discard>  승인 결정 처리(승인 시 게시)
  serve    [port=8080]                    텔레그램 콜백 웹훅 서버

환경변수(없으면 stub로 동작):
  ANTHROPIC_API_KEY / CLAUDE_MODEL                 실제 카피 생성
  IMAGE_RENDERER=puppeteer                          PNG 렌더(기본 SVG, npm i puppeteer 필요)
  IMAGE_UPLOAD_BASE / IMAGE_PUBLIC_BASE / IMAGE_UPLOAD_TOKEN   이미지 공개 호스팅
  TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID            실제 승인 알림
  IG_USER_ID / IG_TOKEN / THREADS_USER_ID / THREADS_TOKEN   실제 게시
`);
  }
}

main().catch((err) => {
  console.error("[cli] 오류:", err);
  process.exitCode = 1;
});
