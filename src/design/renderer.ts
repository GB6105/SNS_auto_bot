// 카드 → 실제 이미지 파일 렌더러. 인터페이스 뒤로 추상화(SVG 무의존 기본 / Puppeteer PNG).
import { cardHtml, cardSvg, toRenderCards, CANVAS } from "./template.js";
import type { CardCopy } from "../domain/types.js";

export interface RenderedImage {
  path: string;
  mime: string;
  width: number;
  height: number;
  cardIndex: number;
}

export interface ImageRenderer {
  readonly name: string;
  /** CardCopy → 카드별 이미지 파일 배열 */
  render(copy: CardCopy, meta: { date: string }): Promise<RenderedImage[]>;
}

type WriteFile = (path: string, data: string | Uint8Array) => Promise<void>;

/**
 * 기본 렌더러: 의존성 0. 카드별 SVG(1080×1080)를 파일로 저장.
 * 미리보기/수동 게시에 충분. 단, IG API는 PNG/JPG만 받으므로 IG 자동게시엔 PuppeteerRenderer 사용.
 */
export class SvgRenderer implements ImageRenderer {
  readonly name = "svg";
  constructor(private readonly writeFile: WriteFile, private readonly outDir: string) {}

  async render(copy: CardCopy, meta: { date: string }): Promise<RenderedImage[]> {
    const cards = toRenderCards(copy.cards);
    const out: RenderedImage[] = [];
    for (const c of cards) {
      const path = `${this.outDir}/card-${meta.date}-${c.cardIndex}.svg`;
      await this.writeFile(path, cardSvg(c));
      out.push({ path, mime: "image/svg+xml", width: CANVAS.width, height: CANVAS.height, cardIndex: c.cardIndex });
    }
    return out;
  }
}

/**
 * Puppeteer 렌더러: HTML을 1080×1080 PNG로 래스터. IG 자동게시용.
 * puppeteer는 무겁(Chromium)고 선택 의존이라 lazy import 한다 — `npm i puppeteer` 후 활성.
 * RALPH-BLOCKER: puppeteer 미설치 시 사용 불가(SvgRenderer로 폴백).
 */
export class PuppeteerRenderer implements ImageRenderer {
  readonly name = "puppeteer";
  constructor(private readonly writeFileBytes: (path: string, data: Uint8Array) => Promise<void>, private readonly outDir: string) {}

  async render(copy: CardCopy, meta: { date: string }): Promise<RenderedImage[]> {
    const specifier = "puppeteer"; // 변수 specifier → 미설치 시 컴파일 영향 없음
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import(specifier).catch(() => null);
    if (!mod) throw new Error("puppeteer 미설치 — `npm i puppeteer` 후 사용하거나 SvgRenderer를 쓰세요");
    const browser = await mod.default.launch({ args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: CANVAS.width, height: CANVAS.height, deviceScaleFactor: 1 });
      const cards = toRenderCards(copy.cards);
      const out: RenderedImage[] = [];
      for (const c of cards) {
        await page.setContent(cardHtml(c), { waitUntil: "domcontentloaded" });
        const buf: Uint8Array = await page.screenshot({ type: "png" });
        const path = `${this.outDir}/card-${meta.date}-${c.cardIndex}.png`;
        await this.writeFileBytes(path, buf);
        out.push({ path, mime: "image/png", width: CANVAS.width, height: CANVAS.height, cardIndex: c.cardIndex });
      }
      return out;
    } finally {
      await browser.close();
    }
  }
}

/**
 * 환경에 맞는 렌더러 선택. IMAGE_RENDERER=puppeteer 면 PNG, 기본은 SVG.
 */
export function makeRenderer(
  writeText: WriteFile,
  writeBytes: (path: string, data: Uint8Array) => Promise<void>,
  outDir: string,
): ImageRenderer {
  if (process.env.IMAGE_RENDERER === "puppeteer") return new PuppeteerRenderer(writeBytes, outDir);
  return new SvgRenderer(writeText, outDir);
}
