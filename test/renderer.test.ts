import { test } from "node:test";
import assert from "node:assert/strict";
import { cardSvg, cardHtml, wrapText, toRenderCards, CANVAS } from "../src/design/template.js";
import { SvgRenderer } from "../src/design/renderer.js";
import type { CardCopy } from "../src/domain/types.js";

test("wrapText — 한도 내 줄 분할", () => {
  const lines = wrapText("할 일을 지금 할 첫 한 가지로 쪼갠다", 8);
  for (const l of lines) assert.ok([...l].length <= 8, `줄 길이 <=8: "${l}"`);
  assert.ok(lines.length >= 2);
});

test("toRenderCards — 0=headline, 마지막=cta, 중간=body", () => {
  const rc = toRenderCards(["H", "a", "b", "CTA"]);
  assert.equal(rc[0].kind, "headline");
  assert.equal(rc[3].kind, "cta");
  assert.equal(rc[1].kind, "body");
});

test("cardSvg — 1080x1080 SVG + 텍스트 포함 + XML 이스케이프", () => {
  const svg = cardSvg({ cardIndex: 0, text: "A & B < C", kind: "headline" });
  assert.ok(svg.startsWith("<svg"));
  assert.ok(svg.includes(`width="${CANVAS.width}"`));
  assert.ok(svg.includes("&amp;") && svg.includes("&lt;"), "특수문자 이스케이프");
});

test("cardHtml — cta는 화살표 포함", () => {
  const html = cardHtml({ cardIndex: 2, text: "댓글에 적어보기", kind: "cta" });
  assert.ok(html.includes("→"));
  assert.ok(html.includes(`${CANVAS.width}px`));
});

test("SvgRenderer — 카드 수만큼 파일, 결정적", async () => {
  const writes: Record<string, string> = {};
  const r = new SvgRenderer(async (p, d) => void (writes[p] = String(d)), "/out");
  const copy: CardCopy = { cards: ["H", "a", "b", "c", "CTA"], caption: "c", hashtags: ["#ADHD"] };
  const imgs = await r.render(copy, { date: "2026-06-01" });
  assert.equal(imgs.length, 5);
  assert.equal(imgs[0].mime, "image/svg+xml");
  assert.equal(imgs[0].width, 1080);
  assert.equal(Object.keys(writes).length, 5);
  // 결정적
  const writes2: Record<string, string> = {};
  const r2 = new SvgRenderer(async (p, d) => void (writes2[p] = String(d)), "/out");
  await r2.render(copy, { date: "2026-06-01" });
  assert.deepEqual(writes, writes2);
});
