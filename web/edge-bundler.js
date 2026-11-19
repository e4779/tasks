// Edge buses: parallel horizontal runs sharing a corridor merge into ONE
// trunk (wiring-harness style) — elk layered staggers every edge onto its own
// track, the bundler collapses the ribbon afterwards. Pure geometry on
// mapLayout polylines: no elk re-run, no DOM; graph.js paint() runs it
// between mapLayout and path drawing. Runs group PER KIND (hard with hard,
// soft with soft, cycle with cycle) so trunks stay kind-homogeneous, and
// card-attached stubs snap to the card's centre line so a shared source or
// target paints ONE drop/rise instead of elk's per-edge fan.

import { edgeId } from "./elk-adapter.js";

/** @typedef {Readonly<{x: number, y: number}>} Pt */
/** @typedef {Readonly<{from: string, to: string, kind: string}>} BundleEdge */
/** @typedef {Readonly<{x: number, y: number, w: number, h: number}>} Rect */

const EPS = 1e-9;
// two runs share a corridor when their tracks sit within BAND in y AND their
// x-ranges overlap (transitively) — BAND = elk edge-edge spacing, calibrated
// so the measured ribbon (tracks 10 apart) and the 40-apart anchor corridors
// both merge. shortcut: chaining through stepping-stone tracks can bridge two
// visually distinct corridors; narrow BAND if a live probe shows over-merging
export const BAND = 40;

const horiz = (a, b) => Math.abs(a.y - b.y) < EPS && Math.abs(a.x - b.x) > EPS;

/** maximal horizontal runs of one polyline: [{i, j}] over point indices */
const runsOf = (poly) => {
  const runs = [];
  for (let i = 0; i < poly.length - 1; ) {
    if (!horiz(poly[i], poly[i + 1])) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < poly.length - 1 && horiz(poly[j], poly[j + 1])) j++;
    runs.push({
      i,
      j,
      y: poly[i].y,
      x0: Math.min(poly[i].x, poly[j].x),
      x1: Math.max(poly[i].x, poly[j].x),
    });
    i = j;
  }
  return runs;
};

/** union-find grouping: same corridor ⇔ within BAND in y AND x-overlap (or
 * touch — a fan's runs all END at the shared card-centre x, strict < would
 * leave every one of them a lone unbundled comb tooth) */
const corridorGroups = (runs) => {
  const par = runs.map((_, i) => i);
  const find = (x) => {
    let i = x;
    while (par[i] !== i) {
      par[i] = par[par[i]];
      i = par[par[i]];
    }
    return i;
  };
  for (let a = 0; a < runs.length; a++)
    for (let b = a + 1; b < runs.length; b++)
      if (
        Math.abs(runs[a].y - runs[b].y) <= BAND &&
        runs[a].x0 <= runs[b].x1 &&
        runs[b].x0 <= runs[a].x1
      )
        par[find(a)] = find(b);
  const groups = new Map();
  runs.forEach((r, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), r]);
  });
  return [...groups.values()];
};

/** drop duplicate points, then collinear middles (ac10 parses pieces back) */
const clean = (pts) => {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && q.x === p.x && q.y === p.y) continue;
    out.push(p);
  }
  return out.filter((p, i) => {
    if (i === 0 || i === out.length - 1) return true;
    const a = out[i - 1];
    const b = out[i + 1];
    return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
  });
};

/** every point before index i sits at poly[i].x — the prefix is one vertical */
const straightDown = (poly, i) => {
  for (let k = 0; k < i; k++) if (poly[k].x !== poly[i].x) return false;
  return true;
};

/** every point after index j sits at poly[j].x — the suffix is one vertical */
const straightUp = (poly, j) => {
  for (let k = j + 1; k < poly.length; k++) if (poly[k].x !== poly[j].x) return false;
  return true;
};

/**
 * split a polyline around its bundled runs: each run collapses to two vertical
 * stubs touching the trunk — the member never paints a horizontal. A stub at
 * the card-attached end is snapped to the card centre line (sx/tx) and spans
 * from the card border (sy/ey), so shared sources/targets overlap into ONE
 * drop/rise line.
 * @param {readonly Pt[]} poly
 * @param {{i: number, j: number, sx: number, sy: number, tx: number, ey: number, ty: number}[]} runs bundled runs of this edge
 */
const rewrite = (poly, runs) => {
  const byStart = new Map(runs.map((r) => [r.i, r]));
  const out = [];
  let cur = [];
  for (let k = 0; k < poly.length; k++) {
    const run = byStart.get(k);
    if (!run) {
      cur.push(poly[k]);
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
  }
  out.push(cur);
  return out.map(clean).filter((p) => p.length >= 2);
};

/**
 * @param {ReadonlyMap<string, readonly Pt[]>} polylines mapLayout output (edgeId → Pt[])
 * @param {readonly BundleEdge[]} [edges] kind + endpoints per edgeId
 * @param {ReadonlyMap<string, Rect>} [rects] card rects (node path → rect)
 * @returns {{pieces: Map<string, Pt[][]>, trunks: {y: number, x0: number, x1: number, kind: string}[]}}
 *   groups of 1 → identity: that edge's polyline passes through untouched
 */
export const bundleEdges = (polylines, edges = [], rects = new Map()) => {
  const meta = new Map(edges.map((e) => [edgeId(e), e]));
  const centre = (nodeId, fallback) => {
    const r = rects.get(nodeId);
    return r ? r.x + r.w / 2 : fallback;
  };
  const runs = [...polylines].flatMap(([id, poly]) => {
    const e = meta.get(id);
    return runsOf(poly).map((r) => {
      // snap only where prefix/suffix are pure verticals — the snapped stub
      // replaces them, so orthogonality survives (ac10); interior ends keep
      // the elk bend x
      const snapS = straightDown(poly, r.i) && !!rects.get(e?.from);
      const snapT = straightUp(poly, r.j) && !!rects.get(e?.to);
      return {
        ...r,
        id,
        kind: e?.kind ?? "",
        snapS,
        snapT,
        sx: snapS ? centre(e?.from, 0) : poly[r.i].x,
        sy: snapS ? poly[0].y : poly[r.i].y,
        tx: snapT ? centre(e?.to, 0) : poly[r.j].x,
        ey: snapT ? poly[poly.length - 1].y : poly[r.j].y,
      };
    });
  });
  const trunkOf = new Map(); // run record → its trunk
  const byKind = new Map();
  for (const r of runs) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r]);
  const trunks = [...byKind.entries()]
    .flatMap(([kind, rs]) =>
      corridorGroups(rs)
        .filter((g) => g.length >= 2)
        .map((g) => {
          // trunk y = mean of member track y's, span = the snapped drop/rise
          // x's it must connect
          const t = {
            kind,
            y: g.reduce((s, r) => s + r.y, 0) / g.length,
            x0: Math.min(...g.map((r) => Math.min(r.sx, r.tx))),
            x1: Math.max(...g.map((r) => Math.max(r.sx, r.tx))),
          };
          for (const r of g) trunkOf.set(r, t);
          return t;
        }),
    )
    .sort((a, b) => a.y - b.y || a.x0 - b.x0); // deterministic DOM order
  const pieces = new Map();
  for (const [id, poly] of polylines) {
    const mine = [];
    for (const r of runs)
      if (r.id === id && trunkOf.has(r)) {
        const t = trunkOf.get(r);
        mine.push({
          i: r.i,
          j: r.j,
          sx: r.sx,
          sy: r.sy,
          tx: r.tx,
          ey: r.ey,
          ty: t.y,
          snapS: r.snapS,
        });
      }
    mine.sort((a, b) => a.i - b.i);
    pieces.set(id, mine.length ? rewrite(poly, mine) : [poly]);
  }
  return { pieces, trunks };
};
