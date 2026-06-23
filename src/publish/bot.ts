// 텔레그램 롱폴링 봇: 버튼 탭 수신 → 승인 처리 → 결과 피드백. 공개 서버 불필요.
import type { Store } from "../store/store.js";
import type { ImageHost } from "../design/imagehost.js";
import type { Publisher } from "./publisher.js";
import { handleCallback, type CallbackResult } from "./webhook.js";
import { TelegramApi, type TelegramUpdate } from "./telegram-api.js";

export interface BotDeps {
  api: TelegramApi;
  store: Store;
  publisher: Publisher;
  host: ImageHost;
  log?: (m: string) => void;
}

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

/**
 * 업데이트 1건 처리: 콜백 → 승인 처리 → 스피너 종료 + 메시지 수정.
 * 테스트 가능(api/store/publisher/host 주입). 콜백이 아니면 무시.
 */
export async function handleUpdate(update: TelegramUpdate, deps: BotDeps): Promise<CallbackResult | null> {
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

/**
 * 롱폴링 루프. 버튼 탭을 계속 수신해 처리. shouldStop으로 종료 제어(테스트/시그널).
 */
export async function runBot(deps: BotDeps, shouldStop: () => boolean = () => false): Promise<void> {
  const log = deps.log ?? console.log;
  const me = await deps.api.getMe();
  log(`[bot] @${me.username ?? me.first_name} 폴링 시작 (Ctrl+C로 종료)`);
  let offset = 0;
  while (!shouldStop()) {
    let updates: TelegramUpdate[];
    try {
      updates = await deps.api.getUpdates(offset, 30);
    } catch (err) {
      log(`[bot] getUpdates 오류(재시도): ${String(err)}`);
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    for (const u of updates) {
      offset = Math.max(offset, u.update_id + 1);
      await handleUpdate(u, deps);
    }
  }
}
