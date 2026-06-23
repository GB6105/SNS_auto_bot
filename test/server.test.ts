import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCallback } from "../src/server.js";

test("parseCallback — 유효 콜백", () => {
  assert.deepEqual(parseCallback({ callback_query: { data: "approve:2026-06-01:instagram:empathy" } }), {
    action: "approve",
    id: "2026-06-01:instagram:empathy",
  });
});

test("parseCallback — discard/revise", () => {
  assert.equal(parseCallback({ callback_query: { data: "discard:x" } })?.action, "discard");
  assert.equal(parseCallback({ callback_query: { data: "revise:x" } })?.action, "revise");
});

test("parseCallback — 잘못된/없는 데이터는 null", () => {
  assert.equal(parseCallback({}), null);
  assert.equal(parseCallback({ callback_query: { data: "bogus:x" } }), null);
  assert.equal(parseCallback({ callback_query: { data: "noseparator" } }), null);
});
