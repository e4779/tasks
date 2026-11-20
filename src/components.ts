// Component repack: elkjs 0.12.1 layered ignores elk.aspectRatio the moment a
// graph has several connected components (measured on the 80-card homelab
// corpus: 44 components → world aspect 7.19 at any ask), and disco ignores
// fixed node sizes. So elk lays out each component beautifully, and THIS pure
// post-pass shelf-packs elk's own component boxes against the target aspect.
// Boxes translate rigidly — elk's inner routing survives untouched.

import type { Pt, Rect } from "./cards.ts";
import type { ElkEdgeRef } from "./elk-adapter.ts";

// gaps big enough that the edge bundler's BAND=40 corridors and the ac13
// bus detector (±20 band + x-overlap) can never couple two components
const X_GAP = 60;
const Y_GAP = 64;

/** union-find over merged edges → node id → component root index */
export const componentsOf = (ids: readonly string[], edges: readonly ElkEdgeRef[]): number[] => {
  const par = ids.map((_, i) => i);
  const find = (x: number): number => {
    let i = x;
    for (;;) {
      const p = par[i] ?? i;
      if (p === i) return i;
      const g = par[p] ?? p;
      par[i] = g;
      i = g;
    }
  };
  const idx = new Map(ids.map((id, i) => [id, i]));
  for (const e of edges) {
    const a = idx.get(e.from);
    const b = idx.get(e.to);
    if (a === undefined || b === undefined) continue;
    par[find(a)] = find(b);
  }
  return par.map((_, i) => find(i));
};

/**
 * shelf-pack elk's component boxes against the target aspect: rows of boxes
 * (height-desc order, deterministic) that wrap at ~sqrt(area × aspect).
 * @returns per-node-id translation deltas
 */
export const packDeltas = (
  boxes: ReadonlyMap<number, Rect>, // component root → bbox in elk space
  aspect: number,
): ReadonlyMap<number, { dx: number; dy: number }> => {
  const list = [...boxes.entries()].sort(([ra, a], [rb, b]) => b.h - a.h || b.w - a.w || ra - rb);
  const area = list.reduce((s, [, r]) => s + r.w * r.h, 0);
  const target = Math.max(
    Math.sqrt(area * aspect),
    Math.max(...list.map(([, r]) => r.w)) + X_GAP, // the widest box must fit a row
  );
  const out = new Map<number, { dx: number; dy: number }>();
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const [root, r] of list) {
    if (x > 0 && x + r.w > target) {
      x = 0;
      y += rowH + Y_GAP;
      rowH = 0;
    }
    out.set(root, { dx: x - r.x, dy: y - r.y });
    x += r.w + X_GAP;
    rowH = Math.max(rowH, r.h);
  }
  return out;
};

/**
 * one elk layout's rects+polylines, repacked: components keep their inner
 * geometry, boxes rearrange to honour the aspect. Edges belong to exactly one
 * component (both endpoints), so each polyline translates with its box.
 */
export const packComponents = (
  rects: ReadonlyMap<string, Rect>,
  polylines: ReadonlyMap<string, readonly Pt[]>,
  edges: readonly ElkEdgeRef[],
  aspect: number,
): { rects: Map<string, Rect>; polylines: Map<string, readonly Pt[]> } => {
  const ids = [...rects.keys()];
  const comp = componentsOf(ids, edges);
  const boxes = new Map<number, Rect>();
  ids.forEach((id, i) => {
    const root = comp[i] ?? i;
    const r = rects.get(id);
    if (!r) return;
    const b = boxes.get(root);
    boxes.set(
      root,
      b
        ? {
            x: Math.min(b.x, r.x),
            y: Math.min(b.y, r.y),
            w: Math.max(b.x + b.w, r.x + r.w) - Math.min(b.x, r.x),
            h: Math.max(b.y + b.h, r.y + r.h) - Math.min(b.y, r.y),
          }
        : r,
    );
  });
  const deltas = packDeltas(boxes, aspect);
  const rootOf = new Map(ids.map((id, i) => [id, comp[i] ?? i]));
  const outRects = new Map<string, Rect>();
  for (const [id, r] of rects) {
    const d = deltas.get(rootOf.get(id) ?? -1) ?? { dx: 0, dy: 0 };
    outRects.set(id, { ...r, x: r.x + d.dx, y: r.y + d.dy });
  }
  const outPolylines = new Map<string, readonly Pt[]>();
  for (const e of edges) {
    const d = deltas.get(rootOf.get(e.from) ?? -1) ?? { dx: 0, dy: 0 };
    outPolylines.set(
      `${e.from}\t${e.to}\t${e.kind}`,
      (polylines.get(`${e.from}\t${e.to}\t${e.kind}`) ?? []).map((p) => ({
        x: p.x + d.dx,
        y: p.y + d.dy,
      })),
    );
  }
  return { rects: outRects, polylines: outPolylines };
};
