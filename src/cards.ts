// Card geometry: pure, shared by elk input sizing (graph-view), the probe's
// ac12 assert and unit tests — one source of truth for the card rect.

export type Pt = Readonly<{ x: number; y: number }>;
export type Rect = Readonly<{ x: number; y: number; w: number; h: number }>;
export type MeasureCtx = Readonly<{ measureText: (text: string) => { width: number } }> & {
  font: string;
};

export const CARD_FONT = 12;
export const CARD_H = 26;

// one coordinate world: cards live in elk space at font 12, the svg zoom
// scales them with everything else — no per-scale variants anywhere
export const cardSize = (title: string, ctx: MeasureCtx): { w: number; h: number } => {
  ctx.font = `${CARD_FONT}px system-ui, sans-serif`;
  return { w: Math.max(40, ctx.measureText(title).width + 24), h: CARD_H };
};

export const intersect = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// p sits on/in the rect within eps — "on the card" for an edge endpoint (AC11:
// inside-or-touching counts as ON; the audit's 8px float does not)
export const pointOnRect = (p: Pt, r: Rect, eps = 0): boolean =>
  p.x >= r.x - eps && p.x <= r.x + r.w + eps && p.y >= r.y - eps && p.y <= r.y + r.h + eps;

// server-side measureText: system-ui is Helvetica/Arial/Segoe-class, so the
// AFM width table (units per 1000em) tracks every real system font within a
// few %; the svg <text> paints the SAME title the rect was sized for (ac12)
const WIDTHS: ReadonlyArray<readonly [number, string]> = [
  [191, "'"],
  [222, "ijl"],
  [260, "|"],
  [278, " !,./:;I[]\\ft"],
  [333, "()-`r"],
  [334, "{}"],
  [355, '"'],
  [389, "*"],
  [469, "^"],
  [500, "Jcksvxyz"],
  [556, "#$?0123456789ABL_Pabdeghnopu"],
  [584, "+=>~"],
  [611, "FTZ"],
  [667, "&CEKSVXY"],
  [722, "DHNUw"],
  [778, "GOQ"],
  [833, "Mm"],
  [944, "W"],
  [1015, "@"],
];
const CHAR_W = new Map<string, number>(
  WIDTHS.flatMap(([w, chars]) => [...chars].map((c) => [c, w])),
);

// non-table glyphs (Cyrillic etc.) take a slightly generous 0.6em — the
// padding absorbs it and over-estimate never overflows the rect
const widthOf = (t: string): number =>
  [...t].reduce((s, c) => s + (CHAR_W.get(c) ?? 600), 0) * (CARD_FONT / 1000);

export const serverCtx: MeasureCtx = {
  font: `${CARD_FONT}px system-ui, sans-serif`,
  measureText: (t) => ({ width: widthOf(t) }),
};
