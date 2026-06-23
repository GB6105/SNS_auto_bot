import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore, JsonFileStore, recordId, type ContentRecord } from "../src/store/store.js";
import { tickPending } from "../src/publish/scheduler.js";
import { handleCallback } from "../src/publish/webhook.js";
import { ConsoleNotifier } from "../src/publish/telegram.js";
import { DryRunPublisher, GraphApiPublisher } from "../src/publish/publisher.js";
import { StubImageHost } from "../src/design/imagehost.js";
import { fixedClock, DEFAULT_POLICY } from "../src/publish/approval.js";
import type { ChecklistReport } from "../src/guardrail/checklist.js";

const okChecklist: ChecklistReport = { results: [], warnCount: 0, hasWarning: false };

function igRecord(id: string, awaitingSinceMs = 0): ContentRecord {
  return {
    id,
    date: "2026-06-01",
    platform: "instagram",
    pillar: "empathy",
    copy: { kind: "ig_card", copy: { cards: ["H", "a", "b", "c", "CTA"], caption: "본문 #ADHD", hashtags: ["#ADHD"] } },
    checklist: okChecklist,
    images: [{ path: "/out/card-0.svg", mime: "image/svg+xml", width: 1080, height: 1080, cardIndex: 0 }],
    status: "awaiting_approval",
    awaitingSinceMs,
    reminded: false,
  };
}

test("recordId 멱등 키", () => {
  assert.equal(recordId("2026-06-01", "instagram", "empathy"), "2026-06-01:instagram:empathy");
});

test("JsonFileStore — 인메모리 파일로 roundtrip", async () => {
  let file = "";
  const store = new JsonFileStore("/state.json", async () => file, async (_p, d) => void (file = d));
  await store.upsert(igRecord("a"));
  const got = await store.get("a");
  assert.equal(got?.id, "a");
  assert.equal((await store.byStatus("awaiting_approval")).length, 1);
});

test("스케줄러: 리마인드 후 만료(Devil#3) — 자동 게시 없음", async () => {
  const store = new MemoryStore();
  await store.upsert(igRecord("r", 0));
  const msgs: string[] = [];
  const notifier = new ConsoleNotifier((m) => msgs.push(m));

  // 13h 경과 → 리마인드
  let s = await tickPending(store, notifier, fixedClock(13 * 3600 * 1000), DEFAULT_POLICY);
  assert.deepEqual(s.reminded, ["r"]);
  assert.equal((await store.get("r"))!.reminded, true);

  // 다시 13h → 이미 리마인드 → 아무 것도 안 함
  s = await tickPending(store, notifier, fixedClock(13 * 3600 * 1000), DEFAULT_POLICY);
  assert.equal(s.reminded.length + s.expired.length, 0);

  // 25h → 만료(폐기)
  s = await tickPending(store, notifier, fixedClock(25 * 3600 * 1000), DEFAULT_POLICY);
  assert.deepEqual(s.expired, ["r"]);
  assert.equal((await store.get("r"))!.status, "discarded");
});

test("웹훅 approve(dry-run): 승인 후 게시 시도, 호스팅 거침", async () => {
  const store = new MemoryStore();
  await store.upsert(igRecord("a"));
  const result = await handleCallback("a", "approve", {
    store,
    publisher: new DryRunPublisher(),
    host: new StubImageHost(),
  });
  assert.equal(result.action, "approve");
  // dry-run은 posted:false → approved 상태 유지(실게시 안 함)
  assert.equal(result.status, "approved");
  assert.equal(result.publish?.dryRun, true);
  assert.ok((await store.get("a"))!.imageUrls!.length >= 1, "승인 시 이미지 호스팅됨");
});

test("웹훅 discard: 폐기, 게시 없음", async () => {
  const store = new MemoryStore();
  await store.upsert(igRecord("d"));
  const result = await handleCallback("d", "discard", { store, publisher: new DryRunPublisher(), host: new StubImageHost() });
  assert.equal(result.status, "discarded");
  assert.equal(result.publish, undefined);
});

test("웹훅 approve(실 publisher mock): IG 캐러셀 2단계 호출", async () => {
  const store = new MemoryStore();
  const rec = igRecord("c");
  rec.images = [
    { path: "/out/0.png", mime: "image/png", width: 1080, height: 1080, cardIndex: 0 },
    { path: "/out/1.png", mime: "image/png", width: 1080, height: 1080, cardIndex: 1 },
  ];
  await store.upsert(rec);

  const calls: string[] = [];
  const fakeFetch = (async (url: string | URL) => {
    const u = String(url);
    calls.push(u);
    const id = u.includes("media_publish") ? "POSTID" : `c${calls.length}`;
    return new Response(JSON.stringify({ id }), { status: 200 });
  }) as unknown as typeof fetch;

  const publisher = new GraphApiPublisher("IGUSER", "IGTOK", "THUSER", "THTOK", fakeFetch);
  const result = await handleCallback("c", "approve", { store, publisher, host: new StubImageHost() });

  assert.equal(result.status, "published");
  assert.equal(result.publish?.posted, true);
  assert.equal(result.publish?.postId, "POSTID");
  // 2 child + 1 carousel + 1 publish = 4 호출
  assert.equal(calls.length, 4);
  assert.ok(calls.some((c) => c.includes("media_type=CAROUSEL")), "캐러셀 컨테이너 생성");
  assert.ok(calls.some((c) => c.includes("media_publish")), "게시 호출");
});

test("웹훅 approve(Threads mock): 텍스트 2단계 게시", async () => {
  const store = new MemoryStore();
  const rec: ContentRecord = {
    id: "t",
    date: "2026-06-01",
    platform: "threads",
    tone: "serious",
    copy: { kind: "thread", copy: { text: "지금 할 첫 한 가지.", tone: "serious" } },
    checklist: okChecklist,
    status: "awaiting_approval",
    awaitingSinceMs: 0,
  };
  await store.upsert(rec);

  const calls: string[] = [];
  const fakeFetch = (async (url: string | URL) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ id: String(url).includes("publish") ? "THPOST" : "tc1" }), { status: 200 });
  }) as unknown as typeof fetch;

  const publisher = new GraphApiPublisher("IGUSER", "IGTOK", "THUSER", "THTOK", fakeFetch);
  const result = await handleCallback("t", "approve", { store, publisher, host: new StubImageHost() });
  assert.equal(result.status, "published");
  assert.equal(result.publish?.postId, "THPOST");
  assert.equal(calls.length, 2);
  assert.ok(calls.some((c) => c.includes("graph.threads.net")));
});
