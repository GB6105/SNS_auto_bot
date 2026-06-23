import { test } from "node:test";
import assert from "node:assert/strict";
import { feedbackText, handleUpdate, type BotDeps } from "../src/publish/bot.js";
import { TelegramApi, type TelegramUpdate } from "../src/publish/telegram-api.js";
import { MemoryStore, type ContentRecord } from "../src/store/store.js";
import { DryRunPublisher } from "../src/publish/publisher.js";
import { StubImageHost } from "../src/design/imagehost.js";
import type { ChecklistReport } from "../src/guardrail/checklist.js";

const okChecklist: ChecklistReport = { results: [], warnCount: 0, hasWarning: false };

function threadRecord(id: string): ContentRecord {
  return {
    id,
    date: "2026-06-01",
    platform: "threads",
    tone: "serious",
    copy: { kind: "thread", copy: { text: "지금 할 첫 한 가지.", tone: "serious" } },
    checklist: okChecklist,
    status: "awaiting_approval",
    awaitingSinceMs: 0,
  };
}

/** 호출을 기록하는 가짜 TelegramApi */
function fakeApi(): { api: TelegramApi; calls: Array<{ m: string; args: unknown[] }> } {
  const calls: Array<{ m: string; args: unknown[] }> = [];
  const fakeFetch = (async (url: string | URL) => {
    const method = String(url).split("/").pop()!;
    calls.push({ m: method, args: [] });
    const result = method === "getMe" ? { id: 1, username: "test_bot" } : {};
    return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
  }) as unknown as typeof fetch;
  // editMessageText/answerCallbackQuery 호출을 직접 추적하려고 api 메서드를 감싸지 않고 fetch로 추적
  return { api: new TelegramApi("TOKEN", fakeFetch), calls };
}

function deps(store: MemoryStore, api: TelegramApi): BotDeps {
  return { api, store, publisher: new DryRunPublisher(), host: new StubImageHost() };
}

test("feedbackText — 분기별 문구", () => {
  assert.match(feedbackText({ id: "x", action: "discard", status: "discarded" }), /폐기/);
  assert.match(feedbackText({ id: "x", action: "revise", status: "revise" }), /수정/);
  assert.match(
    feedbackText({ id: "x", action: "approve", status: "published", publish: { platform: "threads", posted: true, postId: "P1", dryRun: false } }),
    /게시 완료/,
  );
  assert.match(
    feedbackText({ id: "x", action: "approve", status: "approved", publish: { platform: "instagram", posted: false, postId: "d1", dryRun: true } }),
    /DRY-RUN/,
  );
});

test("handleUpdate — 콜백 처리 + answer/edit 호출", async () => {
  const store = new MemoryStore();
  await store.upsert(threadRecord("2026-06-01:threads:serious"));
  const { api, calls } = fakeApi();
  const update: TelegramUpdate = {
    update_id: 10,
    callback_query: { id: "cq1", data: "discard:2026-06-01:threads:serious", message: { message_id: 5, chat: { id: 42 } } },
  };
  const result = await handleUpdate(update, deps(store, api));
  assert.equal(result?.status, "discarded");
  assert.ok(calls.some((c) => c.m === "answerCallbackQuery"), "스피너 종료 호출");
  assert.ok(calls.some((c) => c.m === "editMessageText"), "메시지 수정 호출");
  assert.equal((await store.get("2026-06-01:threads:serious"))!.status, "discarded");
});

test("handleUpdate — 콜백 아닌 업데이트는 무시", async () => {
  const store = new MemoryStore();
  const { api } = fakeApi();
  const result = await handleUpdate({ update_id: 1, message: { message_id: 1, chat: { id: 1 }, text: "hi" } }, deps(store, api));
  assert.equal(result, null);
});

test("handleUpdate — 잘못된 callback_data는 answer만 하고 null", async () => {
  const store = new MemoryStore();
  const { api, calls } = fakeApi();
  const result = await handleUpdate(
    { update_id: 2, callback_query: { id: "cq2", data: "bogus", message: { message_id: 1, chat: { id: 1 } } } },
    deps(store, api),
  );
  assert.equal(result, null);
  assert.ok(calls.some((c) => c.m === "answerCallbackQuery"));
  assert.ok(!calls.some((c) => c.m === "editMessageText"));
});

test("handleUpdate — approve(dry-run) 스레드: 승인됨 상태", async () => {
  const store = new MemoryStore();
  await store.upsert(threadRecord("t"));
  const { api } = fakeApi();
  const result = await handleUpdate(
    { update_id: 3, callback_query: { id: "cq3", data: "approve:t", message: { message_id: 1, chat: { id: 1 } } } },
    deps(store, api),
  );
  // dry-run → posted:false → approved 유지(실게시 안 함)
  assert.equal(result?.status, "approved");
  assert.equal(result?.publish?.dryRun, true);
});
