// 텔레그램 롱폴링 봇: 버튼 탭 수신 → 승인 처리 + 슬래시 명령(/ig·/threads)으로 온디맨드 생성.
import type { Store } from "../store/store.js";
import type { ImageHost } from "../design/imagehost.js";
import type { Platform } from "../domain/types.js";
import type { Publisher } from "./publisher.js";
import { handleCallback, type CallbackResult } from "./webhook.js";
import { TelegramApi, type TelegramUpdate } from "./telegram-api.js";

export interface BotDeps {
  api: TelegramApi;
  store: Store;
  publisher: Publisher;
  host: ImageHost;
  /** 온디맨드 생성 — /ig·/threads 명령에서 호출. 생성·렌더·미리보기 발송까지 내부 수행. */
  generate?: (platform: Platform, arg?: string) => Promise<{ count: number }>;
  log?: (m: string) => void;
}

/** 슬래시 명령 메뉴(텔레그램 / 버튼) + setMyCommands 등록값 */
export const BOT_COMMANDS = [
  { command: "ig", description: "인스타 카드 생성 (기둥: 공감·팁·비포애프터·빌드)" },
  { command: "threads", description: "스레드 생성 (톤: 진지·일상·질문·공감)" },
  { command: "help", description: "사용법 보기" },
];

const HELP = [
  "🤖 SNS 자동화 봇",
  "",
  "/ig [기둥] — 인스타 카드뉴스 생성",
  "   기둥: 공감 · 팁 · 비포애프터 · 빌드  (생략 시 공감)",
  "/threads [톤] — 스레드 글 생성",
  "   톤: 진지 · 일상 · 질문 · 공감  (생략 시 진지)",
  "/help — 이 도움말",
  "",
  "예) `/ig 팁`  ·  `/threads 질문`",
  "생성하면 미리보기(이미지+전문)가 오고, [게시]·[수정]·[폐기] 버튼으로 결정하세요.",
].join("\n");

/** 결정 결과 → 운영자에게 보일 한 줄 피드백 (순수, 테스트 대상) */
export function feedbackText(result: CallbackResult): string {
  if (result.action === "discard") return "🗑 폐기했어요. 오늘은 이 콘텐츠를 올리지 않아요.";
  if (result.action === "revise") return "✏️ 수정 요청 접수 — 다음 생성에서 다시 만들어 드릴게요.";
  // approve
  const pub = result.publish;
  if (pub?.posted) return `✅ 게시 완료! (${pub.platform} · ${pub.postId})`;
  if (pub?.dryRun) return "✅ 승인됨 (DRY-RUN: 실제 게시는 IG/Threads 토큰 설정 후 동작해요)";
  return `✅ 승인됨 (상태: ${result.status})`;
}

/** 콜백 data "<action>:<id>" 파싱 */
function parseData(data?: string): { action: "approve" | "revise" | "discard"; id: string } | null {
  if (!data) return null;
  const i = data.indexOf(":");
  if (i === -1) return null;
  const action = data.slice(0, i);
  if (action !== "approve" && action !== "revise" && action !== "discard") return null;
  return { action, id: data.slice(i + 1) };
}

/** 슬래시 명령 파싱: "/ig 팁" → {cmd:"ig", arg:"팁"}. 명령 아니면 null. (`/ig@Bot`도 처리) */
export function parseCommand(text: string): { cmd: string; arg?: string } | null {
  const t = text.trim();
  if (!t.startsWith("/")) return null;
  const parts = t.split(/\s+/);
  let cmd = parts[0].slice(1).toLowerCase();
  const at = cmd.indexOf("@"); // 그룹에서 /ig@MyBot 형식
  if (at !== -1) cmd = cmd.slice(0, at);
  const arg = parts.slice(1).join(" ") || undefined;
  return { cmd, arg };
}

/**
 * 업데이트 1건 처리: 콜백(버튼) → 승인 처리 / 메시지(슬래시 명령) → 온디맨드 생성.
 * 그 외는 무시. 테스트 가능(api/store/publisher/host/generate 주입).
 */
export async function handleUpdate(update: TelegramUpdate, deps: BotDeps): Promise<CallbackResult | null> {
  if (update.message?.text) {
    await handleMessage(update.message.text, update.message.chat.id, deps);
    return null;
  }
  const cq = update.callback_query;
  if (!cq) return null;
  const parsed = parseData(cq.data);
  if (!parsed) {
    await deps.api.answerCallbackQuery(cq.id, "알 수 없는 동작이에요");
    return null;
  }

  let result: CallbackResult;
  try {
    result = await handleCallback(parsed.id, parsed.action, { store: deps.store, publisher: deps.publisher, host: deps.host });
  } catch (err) {
    await deps.api.answerCallbackQuery(cq.id, "처리 중 오류가 났어요");
    deps.log?.(`[bot] 처리 오류 ${parsed.id}: ${String(err)}`);
    return null;
  }

  const fb = feedbackText(result);
  await deps.api.answerCallbackQuery(cq.id, fb);
  if (cq.message) await deps.api.editMessageText(cq.message.chat.id, cq.message.message_id, fb);
  deps.log?.(`[bot] ${parsed.action} ${parsed.id} → ${result.status}`);
  return result;
}

/** 슬래시 명령 → 온디맨드 생성/도움말. 미리보기 발송은 deps.generate 내부에서 수행. */
async function handleMessage(text: string, chatId: number, deps: BotDeps): Promise<void> {
  const parsed = parseCommand(text);
  if (!parsed) return; // 명령이 아니면 조용히 무시
  const { cmd, arg } = parsed;

  if (cmd === "help" || cmd === "start" || cmd === "도움말") {
    await deps.api.sendMessage(chatId, HELP);
    return;
  }
  const platform: Platform | null =
    cmd === "ig" || cmd === "instagram" || cmd === "인스타" || cmd === "인스타그램" ? "instagram"
    : cmd === "threads" || cmd === "th" || cmd === "스레드" ? "threads"
    : null;
  if (!platform) {
    await deps.api.sendMessage(chatId, `알 수 없는 명령: /${cmd}\n/help 로 사용법을 확인하세요.`);
    return;
  }
  if (!deps.generate) {
    await deps.api.sendMessage(chatId, "생성 기능이 비활성화돼 있어요(서버 설정 필요).");
    return;
  }

  const label = platform === "instagram" ? "인스타 카드" : "스레드";
  await deps.api.sendMessage(chatId, `⏳ ${label} 생성 중… (10~30초)`);
  try {
    const r = await deps.generate(platform, arg);
    if (r.count === 0) await deps.api.sendMessage(chatId, `⚠️ ${label} 생성 결과가 없어요.`);
    deps.log?.(`[bot] /${cmd} ${arg ?? ""} → ${r.count}건`);
  } catch (err) {
    await deps.api.sendMessage(chatId, `❌ ${label} 생성 실패: ${String(err)}`);
    deps.log?.(`[bot] generate 오류: ${String(err)}`);
  }
}

/**
 * 롱폴링 루프. 버튼 탭 + 슬래시 명령을 계속 수신해 처리. shouldStop으로 종료 제어(테스트/시그널).
 */
export async function runBot(deps: BotDeps, shouldStop: () => boolean = () => false): Promise<void> {
  const log = deps.log ?? ((m: string) => console.log(m));
  const d: BotDeps = { ...deps, log }; // handleUpdate가 항상 로그를 남기도록 주입
  const me = await d.api.getMe();
  await d.api.setMyCommands(BOT_COMMANDS).catch(() => {}); // 명령 메뉴 등록(실패해도 진행)
  log(`[bot] @${me.username ?? me.first_name} 폴링 시작 (Ctrl+C로 종료)`);
  let offset = 0;
  while (!shouldStop()) {
    let updates: TelegramUpdate[];
    try {
      updates = await d.api.getUpdates(offset, 30);
    } catch (err) {
      log(`[bot] getUpdates 오류(재시도): ${String(err)}`);
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    for (const u of updates) {
      offset = Math.max(offset, u.update_id + 1);
      await handleUpdate(u, d);
    }
  }
}
