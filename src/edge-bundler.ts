// Edge buses: parallel horizontal runs sharing a corridor merge into ONE
// trunk (wiring-harness style) — elk layered staggers every edge onto its own
// track, the bundler collapses the ribbon afterwards. Pure geometry on
// mapLayout polylines: no elk re-run, no DOM. Runs group PER KIND (hard with
// hard, soft with soft, cycle with cycle) so trunks stay kind-homogeneous, and
// card-attached stubs snap to the card's centre line so a shared source or
// target paints ONE drop/rise instead of elk's per-edge fan.

import type { Pt } from "./cards.ts";
import { type ElkEdgeRef, edgeId } from "./elk-adapter.ts";

export type Rect = Readonly<{ x: number; y: number; w: number; h: number }>;
export type BundleEdge = ElkEdgeRef;
export type Trunk = Readonly<{ y: number; x0: number; x1: number; kind: string }>;

const EPS = 1e-9;
// two runs share a corridor when their tracks sit within BAND in y AND their
// x-ranges overlap (transitively) — BAND = elk edge-edge spacing, calibrated
// so the measured ribbon (tracks 10 apart) and the 40-apart anchor corridors
// both merge. shortcut: chaining through stepping-stone tracks can bridge two
// visually distinct corridors; narrow BAND if a live probe shows over-merging
export const BAND = 40;

const horiz = (a: Pt, b: Pt): boolean => Math.abs(a.y - b.y) < EPS && Math.abs(a.x - b.x) > EPS;

type Run = { i: number; j: number; y: number; x0: number; x1: number };

/** maximal horizontal runs of one polyline */
const runsOf = (poly: readonly Pt[]): Run[] => {
  const runs: Run[] = [];
  for (let i = 0; i < poly.length - 1; ) {
    const a = poly[i];
    const b = poly[i + 1];
    if (!a || !b || !horiz(a, b)) {
      i++;
      continue;
    }
    let j = i + 1;
    for (;;) {
      const p = poly[j];
      const q = poly[j + 1];
      if (p === undefined || q === undefined || !horiz(p, q)) break;
      j++;
    }
    runs.push({
      i,
      j,
      y: a.y,
      x0: Math.min(a.x, b.x),
      x1: Math.max(a.x, b.x),
    });
    i = j;
  }
  return runs;
};

/** union-find grouping: same corridor ⇔ within BAND in y AND x-overlap (or
 * touch — a fan's runs all END at the shared card-centre x, strict < would
 * leave every one of them a lone unbundled comb tooth) */
const corridorGroups = <R extends Run>(runs: readonly R[]): readonly (readonly R[])[] => {
  const par = runs.map((_, i) => i);
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
  for (let a = 0; a < runs.length; a++)
    for (let b = a + 1; b < runs.length; b++) {
      const ra = runs[a];
      const rb = runs[b];
      if (ra && rb && Math.abs(ra.y - rb.y) <= BAND && ra.x0 <= rb.x1 && rb.x0 <= ra.x1)
        par[find(a)] = find(b);
    }
  const groups = new Map<number, R[]>();
  runs.forEach((r, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), r]);
  });
  return [...groups.values()];
};

/** drop duplicate points, then collinear middles (ac10 parses pieces back) */
const clean = (pts: readonly Pt[]): Pt[] => {
  const out: Pt[] = [];
  for (const p of pts) {
    const q = out.at(-1);
    if (q && q.x === p.x && q.y === p.y) continue;
    out.push(p);
  }
  return out.filter((p, i) => {
    if (i === 0 || i === out.length - 1) return true;
    const a = out[i - 1];
    const b = out[i + 1];
    return !(a && b && ((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y)));
  });
};

/** every point before index i sits at poly[i].x — the prefix is one vertical */
const straightDown = (poly: readonly Pt[], i: number): boolean => {
  const xi = poly[i]?.x;
  if (xi === undefined) return false;
  for (let k = 0; k < i; k++) if (poly[k]?.x !== xi) return false;
  return true;
};

/** every point after index j sits at poly[j].x — the suffix is one vertical */
const straightUp = (poly: readonly Pt[], j: number): boolean => {
  const xj = poly[j]?.x;
  if (xj === undefined) return false;
  for (let k = j + 1; k < poly.length; k++) if (poly[k]?.x !== xj) return false;
  return true;
};

type Rewrite = {
  i: number;
  j: number;
  sx: number;
  sy: number;
  tx: number;
  ey: number;
  ty: number;
  snapS: boolean;
  snapT: boolean;
};

/**
 * split a polyline around its bundled runs: each run collapses to two vertical
 * stubs touching the trunk — the member never paints a horizontal. A stub at
 * the card-attached end is snapped to the card centre line (sx/tx) and spans
 * from the card border (sy/ey), so shared sources/targets overlap into ONE
 * drop/rise line.
 */
const rewrite = (poly: readonly Pt[], runs: readonly Rewrite[]): Pt[][] => {
  const byStart = new Map(runs.map((r) => [r.i, r]));
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  for (let k = 0; k < poly.length; k++) {
    const run = byStart.get(k);
    const pt = poly[k];
    if (!pt) continue;
    if (!run) {
      cur.push(pt);
      continue;
    }
    if (run.snapS) cur = []; // snapped source: discard the pure-vertical prefix
    cur.push({ x: run.sx, y: run.sy }, { x: run.sx, y: run.ty }); // source stub ends ON the trunk
    out.push(cur);
    cur = [
      { x: run.tx, y: run.ty },
      { x: run.tx, y: run.ey }, // target stub; the run end point is consumed here
    ];
    k = run.j;
    if (run.snapT) k = poly.length - 1; // snapped target: the stub REPLACED the pure-vertical suffix — consume it, or the old attach x leaks back as a border jog
  }
  out.push(cur);
  return out.map(clean).filter((p) => p.length >= 2);
};

/**
 * @param polylines mapLayout output (edgeId → points)
 * @param edges kind + endpoints per edgeId
 * @param rects card rects (node path → rect)
 * @returns pieces (groups of 1 → identity: that edge's polyline passes through
 *   untouched) and trunks, y-then-x sorted for deterministic paint order
 */
export const bundleEdges = (
  polylines: ReadonlyMap<string, readonly Pt[]>,
  edges: readonly BundleEdge[] = [],
  rects: ReadonlyMap<string, Rect> = new Map(),
): { pieces: Map<string, Pt[][]>; trunks: Trunk[] } => {
  const meta = new Map(edges.map((e) => [edgeId(e), e]));
  const centre = (nodeId: string | undefined, fallback: number): number => {
    const r = nodeId === undefined ? undefined : rects.get(nodeId);
    return r ? r.x + r.w / 2 : fallback;
  };
  const runs = [...polylines].flatMap(([id, poly]) => {
    const e = meta.get(id);
    return runsOf(poly).map((r) => {
      // snap only where prefix/suffix are pure verticals — the snapped stub
      // replaces them, so orthogonality survives (ac10); interior ends keep
      // the elk bend x
      const snapS = straightDown(poly, r.i) && !!rects.get(e?.from ?? "");
      const snapT = straightUp(poly, r.j) && !!rects.get(e?.to ?? "");
      return {
        ...r,
        id,
        kind: e?.kind ?? "",
        snapS,
        snapT,
        sx: snapS ? centre(e?.from, 0) : (poly[r.i]?.x ?? 0),
        sy: snapS ? (poly[0]?.y ?? r.y) : r.y,
        tx: snapT ? centre(e?.to, 0) : (poly[r.j]?.x ?? 0),
        ey: snapT ? (poly.at(-1)?.y ?? r.y) : r.y,
      };
    });
  });
  const trunkOf = new Map<number, Trunk>(); // run record (by index into runs) → its trunk
  const byKind = new Map<string, typeof runs>();
  for (const r of runs) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r]);
  const trunks: Trunk[] = [...byKind.entries()]
    .flatMap(([kind, rs]) =>
      corridorGroups(rs)
        .filter((g) => g.length >= 2)
        .map((g) => {
          // trunk y = mean of member track y's, span = the snapped drop/rise
          // x's it must connect
          const t: Trunk = {
            kind,
            y: g.reduce((s, r) => s + r.y, 0) / g.length,
            x0: Math.min(...g.map((r) => Math.min(r.sx, r.tx))),
            x1: Math.max(...g.map((r) => Math.max(r.sx, r.tx))),
          };
          for (const r of g) trunkOf.set(runs.indexOf(r), t);
          return t;
        }),
    )
    .sort((a, b) => a.y - b.y || a.x0 - b.x0); // deterministic DOM order
  const pieces = new Map<string, Pt[][]>();
  for (const [id, poly] of polylines) {
    const mine: Rewrite[] = [];
    for (const [ri, r] of runs.entries())
      if (r.id === id && trunkOf.has(ri)) {
        const t = trunkOf.get(ri);
        if (!t) continue;
        mine.push({
          i: r.i,
          j: r.j,
          sx: r.sx,
          sy: r.sy,
          tx: r.tx,
          ey: r.ey,
          ty: t.y,
          snapS: r.snapS,
          snapT: r.snapT,
        });
      }
    mine.sort((a, b) => a.i - b.i);
    pieces.set(id, mine.length ? rewrite(poly, mine) : [poly.slice()]);
  }
  return { pieces, trunks };
};
