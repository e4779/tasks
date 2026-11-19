// Edge buses: parallel horizontal runs sharing a corridor merge into ONE
// trunk (wiring-harness style) — elk layered staggers every edge onto its own
// track, the bundler collapses the ribbon afterwards. Pure geometry on
// mapLayout polylines: no elk re-run, no DOM; graph.js paint() runs it
// between mapLayout and path drawing.

/** @typedef {Readonly<{x: number, y: number}>} Pt */

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

/** union-find grouping: same corridor ⇔ within BAND in y AND x-overlap */
const corridorGroups = (runs) => {
  const par = runs.map((_, i) => i);
  const find = (x) => {
    let i = x;
    while (par[i] !== i) {
      par[i] = par[par[i]];
      i = par[i];
    }
    return i;
  };
  for (let a = 0; a < runs.length; a++)
    for (let b = a + 1; b < runs.length; b++)
      if (
        Math.abs(runs[a].y - runs[b].y) <= BAND &&
        runs[a].x0 < runs[b].x1 &&
        runs[b].x0 < runs[a].x1
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

/**
 * split a polyline around its bundled runs: each run collapses to two
 * vertical stubs touching the trunk — the member never paints a horizontal
 * @param {readonly Pt[]} poly
 * @param {{i: number, j: number, ty: number}[]} runs bundled runs of this edge
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
    cur.push(poly[k], { x: poly[k].x, y: run.ty }); // source side ends ON the trunk
    out.push(cur);
    cur = [{ x: poly[run.j].x, y: run.ty }]; // target side starts ON the trunk
    k = run.j - 1; // replay the run end point
  }
  out.push(cur);
  return out.map(clean).filter((p) => p.length >= 2);
};

/**
 * @param {ReadonlyMap<string, readonly Pt[]>} polylines mapLayout output (edgeId → Pt[])
 * @returns {{pieces: Map<string, Pt[][]>, trunks: {y: number, x0: number, x1: number}[]}}
 *   groups of 1 → identity: that edge's polyline passes through untouched
 */
export const bundleEdges = (polylines) => {
  const runs = [...polylines].flatMap(([id, poly]) => runsOf(poly).map((r) => ({ ...r, id })));
  const trunkOf = new Map(); // run record → its trunk
  const trunks = corridorGroups(runs)
    .filter((g) => g.length >= 2)
    .map((g) => {
      // trunk y = mean of member track y's, span = union of member x-ranges
      const t = {
        y: g.reduce((s, r) => s + r.y, 0) / g.length,
        x0: Math.min(...g.map((r) => r.x0)),
        x1: Math.max(...g.map((r) => r.x1)),
      };
      for (const r of g) trunkOf.set(r, t);
      return t;
    })
    .sort((a, b) => a.y - b.y || a.x0 - b.x0); // deterministic DOM order
  const pieces = new Map();
  for (const [id, poly] of polylines) {
    const mine = [];
    for (const r of runs)
      if (r.id === id && trunkOf.has(r)) mine.push({ ...r, ty: trunkOf.get(r).y });
    mine.sort((a, b) => a.i - b.i);
    pieces.set(id, mine.length ? rewrite(poly, mine) : [poly]);
  }
  return { pieces, trunks };
};
