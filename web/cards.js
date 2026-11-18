// Card geometry: pure, shared by the elk input sizing (graph.js), the --ac
// probe and unit tests — one source of truth for the card rect.

export const CARD_FONT = 12;
export const CARD_H = 26;

// one coordinate world: cards live in elk space at font 12, the svg zoom
// scales them with everything else — no per-scale variants anywhere
export const cardSize = (title, ctx) => {
  ctx.font = `${CARD_FONT}px system-ui, sans-serif`;
  return {
    w: Math.max(40, ctx.measureText(title).width + 24),
    h: CARD_H,
  };
};

export const intersect = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// p sits on/in the rect within eps — "on the card" for an edge endpoint (AC11:
// inside-or-touching counts as ON; the audit's 8px float does not)
export const pointOnRect = (p, r, eps = 0) =>
  p.x >= r.x - eps && p.x <= r.x + r.w + eps && p.y >= r.y - eps && p.y <= r.y + r.h + eps;

// Legacy pure geometry from the canvas era, kept as tested documentation of
// the AC11 reattach rule. The svg painter never calls it: elk routes in the
// same space the cards live in, so endpoints cannot detach in the first place.
const clampToRect = (p, r) => ({
  x: Math.min(Math.max(p.x, r.x), r.x + r.w),
  y: Math.min(Math.max(p.y, r.y), r.y + r.h),
});

export const trimEnds = (poly, src, dst) => {
  if (poly.length < 2) return poly;
  const pts = poly.map((p, i) =>
    i === 0 ? clampToRect(p, src) : i === poly.length - 1 ? clampToRect(p, dst) : p,
  );
  return [
    ...pts.slice(0, -1).flatMap((p, i) => {
      const q = pts[i + 1];
      return p.x === q.x || p.y === q.y ? [p] : [p, { x: p.x, y: q.y }];
    }),
    pts[pts.length - 1],
  ];
};
