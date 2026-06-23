// 카드 1장 → HTML/SVG 템플릿 (순수 함수). pencil.dev로 디자인한 템플릿을 이식하는 자리.
// PRD §생성 규칙: 1080×1080, 강한 색 대비, 텍스트 면적 20% 이내, 시선 흐름.

export type CardKind = "headline" | "body" | "cta";

export interface RenderCard {
  cardIndex: number; // 0-based
  text: string;
  kind: CardKind;
}

export const CANVAS = { width: 1080, height: 1080 } as const;

/** 기둥/역할에 따른 배경·전경 (강한 대비) */
const PALETTE: Record<CardKind, { bg: string; fg: string; accent: string }> = {
  headline: { bg: "#1A1730", fg: "#FFFFFF", accent: "#FFD166" },
  body: { bg: "#F5F3FF", fg: "#1A1730", accent: "#6C5CE7" },
  cta: { bg: "#6C5CE7", fg: "#FFFFFF", accent: "#FFD166" },
};

/** 한글/영문 혼합 텍스트를 maxCharsPerLine 기준으로 단순 줄바꿈 */
export function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/(\s+)/); // 공백 보존
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ([...(cur + w)].length > maxCharsPerLine && cur.trim().length > 0) {
      lines.push(cur.trim());
      cur = w.trimStart();
    } else {
      cur += w;
    }
  }
  if (cur.trim().length > 0) lines.push(cur.trim());
  // 한 단어가 너무 길면 강제 분할
  return lines.flatMap((l) =>
    [...l].length <= maxCharsPerLine
      ? [l]
      : (l.match(new RegExp(`.{1,${maxCharsPerLine}}`, "gu")) ?? [l]),
  );
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

/** 카드 → SVG(1080×1080). 무의존 미리보기/렌더 소스. (IG는 PNG 필요 → Puppeteer로 래스터) */
export function cardSvg(card: RenderCard): string {
  const p = PALETTE[card.kind];
  const fontSize = card.kind === "headline" ? 72 : card.kind === "cta" ? 60 : 56;
  const maxChars = card.kind === "headline" ? 12 : 16;
  const lines = wrapText(card.text, maxChars);
  const lineHeight = fontSize * 1.35;
  const blockHeight = lines.length * lineHeight;
  const startY = (CANVAS.height - blockHeight) / 2 + fontSize;
  const arrow = card.kind === "cta" ? " →" : "";

  const tspans = lines
    .map((l, i) => {
      const suffix = i === lines.length - 1 ? arrow : "";
      return `<tspan x="${CANVAS.width / 2}" y="${Math.round(startY + i * lineHeight)}">${escapeXml(l + suffix)}</tspan>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}">
  <rect width="100%" height="100%" fill="${p.bg}"/>
  <rect x="64" y="64" width="160" height="14" rx="7" fill="${p.accent}"/>
  <text font-family="'Apple SD Gothic Neo','Noto Sans KR',sans-serif" font-weight="800" font-size="${fontSize}" fill="${p.fg}" text-anchor="middle">${tspans}</text>
  <text x="${CANVAS.width - 64}" y="${CANVAS.height - 56}" font-family="sans-serif" font-size="28" fill="${p.fg}" opacity="0.6" text-anchor="end">ADHD 플래너</text>
</svg>`;
}

/** 카드 → 완전한 HTML 문서. Puppeteer 스크린샷(1080×1080)용. */
export function cardHtml(card: RenderCard): string {
  const p = PALETTE[card.kind];
  const fontSize = card.kind === "headline" ? 72 : card.kind === "cta" ? 60 : 56;
  const arrow = card.kind === "cta" ? " →" : "";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0}
  .card{width:${CANVAS.width}px;height:${CANVAS.height}px;background:${p.bg};color:${p.fg};
    display:flex;align-items:center;justify-content:center;position:relative;
    font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;font-weight:800;box-sizing:border-box;padding:120px;}
  .bar{position:absolute;top:64px;left:64px;width:160px;height:14px;border-radius:7px;background:${p.accent}}
  .txt{font-size:${fontSize}px;line-height:1.35;text-align:center;word-break:keep-all}
  .brand{position:absolute;bottom:56px;right:64px;font-weight:400;font-size:28px;opacity:.6}
  </style></head><body><div class="card"><div class="bar"></div>
  <div class="txt">${escapeXml(card.text)}${arrow}</div><div class="brand">ADHD 플래너</div></div></body></html>`;
}

/** CardCopy.cards 배열 → RenderCard[] (0=headline, 마지막=cta, 중간=body) */
export function toRenderCards(cards: string[]): RenderCard[] {
  return cards.map((text, i) => ({
    cardIndex: i,
    text,
    kind: i === 0 ? "headline" : i === cards.length - 1 ? "cta" : "body",
  }));
}
