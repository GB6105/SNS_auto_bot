// 텔레그램 콜백 수신 웹훅 서버(node:http). n8n 없이 코드만으로 승인→게시 구동.
import http from "node:http";
import { handleCallback, type CallbackAction, type WebhookDeps } from "./publish/webhook.js";

interface TelegramUpdate {
  callback_query?: { id?: string; data?: string };
}

/** callback_data "<action>:<id>" 파싱. 순수 함수(테스트 대상). */
export function parseCallback(update: TelegramUpdate): { action: CallbackAction; id: string } | null {
  const data = update.callback_query?.data;
  if (!data) return null;
  const idx = data.indexOf(":");
  if (idx === -1) return null;
  const action = data.slice(0, idx);
  const id = data.slice(idx + 1);
  if (action !== "approve" && action !== "revise" && action !== "discard") return null;
  return { action, id };
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (c) => (buf += c));
    req.on("end", () => resolve(buf));
    req.on("error", reject);
  });
}

/** 웹훅 서버 시작. POST /telegram-webhook 으로 텔레그램 콜백 수신. */
export function startServer(deps: WebhookDeps, port: number, log: (m: string) => void = console.log): http.Server {
  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || !req.url?.startsWith("/telegram-webhook")) {
      res.writeHead(404).end("not found");
      return;
    }
    try {
      const update = JSON.parse(await readBody(req)) as TelegramUpdate;
      const parsed = parseCallback(update);
      if (!parsed) {
        res.writeHead(200).end("ignored");
        return;
      }
      const result = await handleCallback(parsed.id, parsed.action, deps);
      log(`[webhook] ${parsed.action} ${parsed.id} → ${result.status}${result.publish ? ` (${result.publish.note ?? result.publish.postId})` : ""}`);
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(result));
    } catch (err) {
      log(`[webhook] 오류: ${String(err)}`);
      res.writeHead(500).end("error");
    }
  });
  server.listen(port, () => log(`[webhook] 수신 대기 :${port}/telegram-webhook`));
  return server;
}
