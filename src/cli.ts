// US-12 CLI 엔트리. 외부 설정 없이 전체 흐름을 콘솔/JSON으로 확인.
// 사용:
//   node dist/src/cli.js calendar <start=YYYY-MM-DD> [days]
//   node dist/src/cli.js preview  <start> <date> [--json]
import { promises as fs } from "node:fs";
import path from "node:path";
import { assignTopics, buildCalendar } from "./domain/calendar.js";
import { PILLAR_LABEL, THREAD_TONE_LABEL } from "./domain/types.js";
import { makeLLM } from "./generation/llm.js";
import { makeNotifier } from "./publish/telegram.js";
import { FileDesignAdapter } from "./design/slots.js";
import { prepareForDate } from "./pipeline/orchestrator.js";

function todayIsoFallback(): string {
  // 인자 미제공 시 사용. 결정적 테스트에는 명시 인자 권장.
  return new Date().toISOString().slice(0, 10);
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
  const outDir = path.resolve("out");
  await fs.mkdir(outDir, { recursive: true });

  const design = new FileDesignAdapter(async (p, d) => fs.writeFile(p, d, "utf8"), outDir);
  const prepared = await prepareForDate(start, date, {
    llm: makeLLM(),
    notifier: makeNotifier(),
    design,
  });

  if (asJson) {
    console.log(JSON.stringify(prepared, null, 2));
    return;
  }
  if (prepared.length === 0) {
    console.log(`(${date}에 예정된 항목이 없습니다 — 캘린더 시작일/날짜를 확인하세요)`);
    return;
  }
  console.log(`\n— ${prepared.length}건 생성·검수 완료, 승인 대기 상태(awaiting_approval) —`);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "calendar": {
      const start = rest[0] ?? todayIsoFallback();
      const days = rest[1] ? Number(rest[1]) : 14;
      await cmdCalendar(start, days);
      break;
    }
    case "preview": {
      const start = rest[0] ?? todayIsoFallback();
      const date = rest[1] ?? start;
      const asJson = rest.includes("--json");
      await cmdPreview(start, date, asJson);
      break;
    }
    default:
      console.log(`SNS 자동화 에이전트 CLI

명령:
  calendar <start=YYYY-MM-DD> [days]     2주치 캘린더 출력
  preview  <start> <date> [--json]       해당 날짜 항목 생성·검수·슬롯·승인알림(승인 게이트에서 멈춤)

환경변수(없으면 stub로 동작):
  ANTHROPIC_API_KEY   실제 카피 생성(없으면 결정적 stub)
  CLAUDE_MODEL        모델 override(기본 claude-sonnet-4-6)
  TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID   실제 승인 알림(없으면 콘솔)
`);
  }
}

main().catch((err) => {
  console.error("[cli] 오류:", err);
  process.exitCode = 1;
});
