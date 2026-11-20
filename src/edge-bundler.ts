// Edge buses: parallel horizontal runs sharing a corridor merge into ONE
// trunk (wiring-harness style) — elk layered staggers every edge onto its own
// track, the bundler collapses the ribbon afterwards. Pure geometry on
// mapLayout polylines: no elk re-run, no DOM. Runs group PER KIND (hard with
// hard, soft with soft, cycle with cycle) so trunks stay kind-homogeneous.
// Single-stem attach (tasks/single-stem-attach.md, supersedes H2 spreading):
// every edge end whose attach x sits inside the owner card's span attaches at
// the card's side stem — inbound at centre − 8, outbound at centre + 8 — so a
// fan paints ONE line per side instead of elk's per-edge comb. Raw
// pure-vertical teeth inside the span bundle into the stem too; teeth outside
// the span stay raw (genuinely distant routes).

import type { Pt } from "./cards.ts";
import { type ElkEdgeRef, edgeId, HOP_R, type Hop } from "./elk-adapter.ts";

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
 * the card-attached end is snapped to the card's side stem (sx/tx; single-stem
 * doctrine: outbound centre+8, inbound centre−8) and spans from the card
 * border (sy/ey).
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
/**
 * H1 (tasks/edge-crossing-hops.md): every INTERIOR crossing of two different
 * edges gets a semicircle hop on the VERTICAL side — horizontal trunks and
 * horizontal pieces run continuous. An intersection at a segment endpoint of
 * either side is a T-junction (leg meeting its trunk) and stays a plain
 * joint. Crossings closer than 2r on one vertical: hop only the first in
 * travel order, leave the rest plain — arcs never overlap. Bus-free corpora
 * (no crossings) emit byte-identical polylines.
 */
export const addHops = (
  pieces: ReadonlyMap<string, readonly Pt[][]>,
  trunks: readonly Trunk[],
): Map<string, (Pt | Hop)[][]> => {
  type HSeg = { y: number; x0: number; x1: number; owner: string | null }; // null = shared trunk
  const hs: HSeg[] = trunks.map((t) => ({ y: t.y, x0: t.x0, x1: t.x1, owner: null }));
  for (const [id, polys] of pieces)
    for (const poly of polys)
      for (let i = 1; i < poly.length; i++) {
        const a = poly[i - 1];
        const b = poly[i];
        if (!a || !b) continue;
        if (Math.abs(a.y - b.y) < EPS && Math.abs(a.x - b.x) > EPS)
          hs.push({ y: a.y, x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), owner: id });
      }
  const out = new Map<string, (Pt | Hop)[][]>();
  for (const [id, polys] of pieces)
    out.set(
      id,
      polys.map((poly) => {
        const items: (Pt | Hop)[] = [];
        for (let k = 0; k < poly.length; k++) {
          const a = poly[k];
          const b = poly[k + 1];
          if (!a) continue;
          items.push(a);
          if (!b || Math.abs(a.x - b.x) >= EPS) continue; // verticals hop, horizontals run
          const y0 = Math.min(a.y, b.y);
          const y1 = Math.max(a.y, b.y);
          const down = b.y > a.y;
          const ys = new Set<number>();
          for (const h of hs) {
            if (h.owner === id) continue; // own segments ignored (D2 keeps them disjoint anyway)
            if (
              Math.min(h.y - y0, y1 - h.y) > HOP_R && // interior + arc stays inside the segment
              a.x - h.x0 > EPS &&
              h.x1 - a.x > EPS // not the horizontal's endpoint (T-junction)
            )
              ys.add(h.y);
          }
          const cs = [...ys].sort((c, d) => (down ? c - d : d - c));
          let last = Number.NaN;
          for (const c of cs) {
            if (Math.abs(c - last) < 2 * HOP_R) continue; // closer than 2r → first wins
            const d = down ? HOP_R : -HOP_R;
            items.push({ x: a.x, y: c - d }, { x: a.x, y: c + d, sweep: down ? 1 : 0 });
            last = c;
          }
        }
        return items;
      }),
    );
  return out;
};

export const bundleEdges = (
  polylines: ReadonlyMap<string, readonly Pt[]>,
  edges: readonly BundleEdge[] = [],
  rects: ReadonlyMap<string, Rect> = new Map(),
): { pieces: Map<string, Pt[][]>; trunks: Trunk[] } => {
  const meta = new Map(edges.map((e) => [edgeId(e), e]));
  // elk jitters geometry-equal points by ~1e-12 (start vs bend vs end of ONE
  // vertical differ in the last bits) — that noise defeats every strict
  // equality below (snap predicates, collinear clean) and left overshoot
  // knees (elk track 658 kept beside trunk level 663). Quantize once; 1e-6 is
  // invisible at any paint scale.
  const q = (v: number): number => Math.round(v * 1e6) / 1e6;
  const polys = new Map(
    [...polylines].map(([id, poly]) => [id, poly.map((p) => ({ x: q(p.x), y: q(p.y) }))]),
  );
  const centre = (nodeId: string | undefined, fallback: number): number => {
    const r = nodeId === undefined ? undefined : rects.get(nodeId);
    return r ? q(r.x + r.w / 2) : q(fallback);
  };
  // single-stem doctrine (tasks/single-stem-attach.md): every end whose attach
  // x sits inside the owner card's span attaches at the card's side stem —
  // outbound centre+8, inbound centre−8 — deterministic, no ledger
  const STEM = 8;
  const inSpan = (x: number, r: Rect): boolean => x >= r.x - 0.5 && x <= r.x + r.w + 0.5;
  const stemOf = (at: "S" | "T", cardId: string, attachX: number): number => {
    const card = rects.get(cardId);
    return card && inSpan(attachX, card)
      ? centre(cardId, card.x) + (at === "S" ? STEM : -STEM)
      : q(attachX); // out-of-span: genuinely distant route keeps elk's x
  };
  const onBorder = (cardId: string, y: number): boolean => {
    const r = rects.get(cardId);
    return !!r && (Math.abs(y - r.y) < 0.5 || Math.abs(y - (r.y + r.h)) < 0.5);
  };
  const runs = [...polys].flatMap(([id, poly]) => {
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
        sx: snapS ? stemOf("S", e?.from ?? "", poly[0]?.x ?? 0) : (poly[r.i]?.x ?? 0),
        sy: snapS ? (poly[0]?.y ?? r.y) : r.y,
        tx: snapT ? stemOf("T", e?.to ?? "", poly.at(-1)?.x ?? 0) : (poly[r.j]?.x ?? 0),
        ey: snapT ? (poly.at(-1)?.y ?? r.y) : r.y,
      };
    });
  });
  // trunk MEMBERSHIP first (drafts without span — the span is filled from
  // member stub x's once snapping is final)
  type TrunkDraft = { y: number; x0: number; x1: number; kind: string };
  const trunkOf = new Map<number, TrunkDraft>(); // run record (by index into runs) → its trunk
  const drafts: TrunkDraft[] = [];
  const byKind = new Map<string, typeof runs>();
  for (const r of runs) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r]);
  for (const [kind, rs] of [...byKind.entries()])
    for (const g of corridorGroups(rs))
      if (g.length >= 2) {
        // trunk y = mean of member track y's
        const t: TrunkDraft = {
          kind,
          y: g.reduce((s, r) => s + r.y, 0) / g.length,
          x0: Number.POSITIVE_INFINITY,
          x1: Number.NEGATIVE_INFINITY,
        };
        drafts.push(t);
        for (const r of g) trunkOf.set(runs.indexOf(r), t);
      }
  const runIdx = new Map<string, number[]>(); // edge id → indices into runs
  runs.forEach((r, i) => {
    runIdx.set(r.id, [...(runIdx.get(r.id) ?? []), i]);
  });
  // single-stem: UNBUNDLED edges snap their in-span border attaches to the
  // side stems exactly like trunk members — raw pure-vertical teeth (no run)
  // jog at the vertical midpoint, lone V-H-V routes jog at elk's own run
  // level. Bundled and multi-run edges keep the trunk rewrite below.
  for (const [id, poly] of polys) {
    const e = meta.get(id);
    if (!e || e.from === e.to || poly.length < 2) continue;
    const idxs = runIdx.get(id) ?? [];
    const idx0 = idxs[0];
    if (idxs.length > 1 || (idx0 !== undefined && trunkOf.has(idx0))) continue;
    const p0 = poly[0];
    const pn = poly.at(-1);
    if (!p0 || !pn || Math.abs(pn.y - p0.y) < EPS) continue; // horizontal edge: no stems
    const run = idx0 !== undefined ? runs[idx0] : undefined;
    const sOk = (run ? straightDown(poly, run.i) : true) && onBorder(e.from, p0.y);
    const tOk = (run ? straightUp(poly, run.j) : true) && onBorder(e.to, pn.y);
    if (!sOk && !tOk) continue;
    const sx = sOk ? stemOf("S", e.from, p0.x) : p0.x;
    const tx = tOk ? stemOf("T", e.to, pn.x) : pn.x;
    if (sx === p0.x && tx === pn.x) continue; // out-of-span both ends: genuinely distant route stays raw
    const jog = run ? run.y : q((p0.y + pn.y) / 2);
    polys.set(
      id,
      clean([
        { x: sx, y: p0.y },
        { x: sx, y: jog },
        { x: tx, y: jog },
        { x: tx, y: pn.y },
      ]),
    );
  }
  for (const [idx, t] of trunkOf) {
    const r = runs[idx];
    if (!r) continue;
    t.x0 = Math.min(t.x0, r.sx, r.tx);
    t.x1 = Math.max(t.x1, r.sx, r.tx);
  }
  const trunks: Trunk[] = drafts.sort((a, b) => a.y - b.y || a.x0 - b.x0); // deterministic DOM order
  const pieces = new Map<string, Pt[][]>();
  for (const [id, poly] of polys) {
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
  // D1 as assertion (single-stem makes a pierce impossible by construction:
  // top stem centre+8, bottom stem centre−8) — the old mover is dead. Trip =
  // construction bug, fail loud.
  const sides = new Map<string, { top: number[]; bottom: number[] }>();
  for (const [id, ps] of pieces) {
    const e = meta.get(id);
    if (!e || e.from === e.to) continue;
    const s = ps[0]?.[0];
    const t = ps.at(-1)?.at(-1);
    for (const [pt, cardId] of [
      [s, e.from],
      [t, e.to],
    ] as const) {
      const card = pt === undefined ? undefined : rects.get(cardId);
      if (!pt || !card) continue;
      const side =
        Math.abs(pt.y - card.y) < 0.5
          ? "top"
          : Math.abs(pt.y - (card.y + card.h)) < 0.5
            ? "bottom"
            : "";
      if (!side) continue;
      const rec = sides.get(cardId) ?? { top: [], bottom: [] };
      rec[side].push(pt.x);
      sides.set(cardId, rec);
    }
  }
  for (const [cardId, { top, bottom }] of sides)
    for (const b of bottom)
      for (const t of top)
        if (Math.abs(b - t) < 0.5)
          throw new Error(
            `D1 assertion: card ${cardId} pierced — top attach x=${t} == bottom attach x=${b}`,
          );
  return { pieces, trunks };
};
