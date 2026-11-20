// Edge buses: parallel horizontal runs sharing a corridor merge into ONE
// trunk (wiring-harness style) — elk layered staggers every edge onto its own
// track, the bundler collapses the ribbon afterwards. Pure geometry on
// mapLayout polylines: no elk re-run, no DOM. Runs group PER KIND (hard with
// hard, soft with soft, cycle with cycle) so trunks stay kind-homogeneous, and
// card-attached stubs snap to the card's centre line — the first member
// keeps it, colliding stubs step +8px rightward (H2) — instead of elk's
// per-edge fan.

import type { Pt } from "./cards.ts";
import { type ElkEdgeRef, edgeId, HOP_R, type Hop } from "./elk-adapter.ts";

export type Rect = Readonly<{ x: number; y: number; w: number; h: number }>;
export type BundleEdge = ElkEdgeRef;
export type Trunk = Readonly<{ y: number; x0: number; x1: number; kind: string }>;
type Mpt = { x: number; y: number };
type RunX = Run & {
  id: string;
  kind: string;
  snapS: boolean;
  snapT: boolean;
  sx: number;
  sy: number;
  tx: number;
  ey: number;
};

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
 * the card-attached end is snapped to the card centre line (sx/tx;
 * H2 spreads colliding members +8px) and spans
 * from the card border (sy/ey).
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
 * D1 — «линия не должна проходить через блок»: a card whose bottom-attach x
 * equals its top-attach x is pierced by ONE continuous line (incoming trunk
 * stub rises to the bottom border while the outgoing edge leaves the top at
 * the same x — the thm012 ruling). Move the side with FEWER attachments by GAP
 * inside the card span: snapped stubs move with their run (trunk spans are
 * computed after this), raw ends slide their vertical chain so the polyline
 * stays orthogonal.
 */
const ATTACH_GAP = 16;

const separateAttachXs = (
  polys: ReadonlyMap<string, Mpt[]>,
  runs: readonly RunX[],
  trunkOf: ReadonlyMap<number, unknown>,
  meta: ReadonlyMap<string, BundleEdge>,
  rects: ReadonlyMap<string, Rect>,
): void => {
  // one snapped stub per edge end: snapS ⇒ first run, snapT ⇒ last run
  const snapped: Record<"S" | "T", Map<string, RunX>> = { S: new Map(), T: new Map() };
  for (const [idx, r] of runs.entries()) {
    if (!trunkOf.has(idx)) continue;
    if (r.snapS) snapped.S.set(r.id, r);
    if (r.snapT) snapped.T.set(r.id, r);
  }
  type End = { id: string; at: "S" | "T"; x: number; y: number; side: string };
  const endsOf = new Map<string, Record<"S" | "T", End>>();
  const byCard = new Map<string, End[]>();
  for (const [id, poly] of polys) {
    const e = meta.get(id);
    if (!e || e.from === e.to || poly.length < 2) continue;
    const mk = (at: "S" | "T"): End => {
      const run = (at === "S" ? snapped.S : snapped.T).get(id);
      const pt = at === "S" ? poly[0] : poly.at(-1);
      return {
        id,
        at,
        x: run ? (at === "S" ? run.sx : run.tx) : (pt?.x ?? 0),
        y: run ? (at === "S" ? run.sy : run.ey) : (pt?.y ?? 0),
        side: "",
      };
    };
    const ends: Record<"S" | "T", End> = { S: mk("S"), T: mk("T") };
    endsOf.set(id, ends);
    for (const end of [ends.S, ends.T]) {
      const cardId = end.at === "S" ? e.from : e.to;
      const card = rects.get(cardId);
      if (!card) continue;
      end.side =
        Math.abs(end.y - card.y) < 0.5
          ? "top"
          : Math.abs(end.y - (card.y + card.h)) < 0.5
            ? "bottom"
            : "";
      if (end.side) byCard.set(cardId, [...(byCard.get(cardId) ?? []), end]);
    }
  }
  const slideChain = (poly: Mpt[], fromStart: boolean, dx: number): void => {
    const anchor = fromStart ? poly[0]?.x : poly.at(-1)?.x;
    if (anchor === undefined) return;
    if (fromStart)
      for (const p of poly) {
        if (p.x !== anchor) break;
        p.x += dx;
      }
    else
      for (let i = poly.length - 1; i >= 0; i--) {
        const p = poly[i];
        if (!p || p.x !== anchor) break;
        p.x += dx;
      }
  };
  const applyEnd = (end: End, dx: number): void => {
    const run = snapped[end.at].get(end.id);
    if (run) {
      if (end.at === "S") run.sx += dx;
      else run.tx += dx;
      end.x += dx;
      return;
    }
    const poly = polys.get(end.id);
    if (!poly) return;
    slideChain(poly, end.at === "S", dx);
    // a raw slide moves the whole vertical — the edge's OTHER attach may have
    // slid too (pure vertical), refresh both records
    const ends = endsOf.get(end.id);
    const p0 = poly[0];
    const pn = poly.at(-1);
    if (ends && p0 && pn) {
      ends.S.x = p0.x;
      ends.T.x = pn.x;
    }
  };
  // passes: one moved end can expose a clash on its OTHER card (a raw vertical
  // is two attach points) — rescan until no move fires
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (const [cardId, ends] of byCard) {
      const card = rects.get(cardId);
      if (!card) continue;
      const tops = ends.filter((e) => e.side === "top");
      const bots = ends.filter((e) => e.side === "bottom");
      const xs = [...new Set([...tops, ...bots].map((e) => e.x))].sort((a, b) => a - b);
      for (const x of xs) {
        const gT = tops.filter((e) => Math.abs(e.x - x) < 0.5);
        const gB = bots.filter((e) => Math.abs(e.x - x) < 0.5);
        if (gT.length === 0 || gB.length === 0) continue;
        // fewer-attached side yields; tie → the outgoing (top) side
        const group = gT.length <= gB.length ? gT : gB;
        const others = ends.filter((e) => Math.abs(e.x - x) >= 0.5).map((e) => e.x);
        const free = (nx: number): boolean =>
          nx > card.x + 1 &&
          nx < card.x + card.w - 1 &&
          others.every((v) => Math.abs(v - nx) >= 0.5);
        const dx = [ATTACH_GAP, -ATTACH_GAP, 2 * ATTACH_GAP, -2 * ATTACH_GAP].find((d) =>
          free(x + d),
        );
        if (dx === undefined) continue; // shortcut: card span exhausted; probe flags — widen offsets if a corpus ever hits it
        for (const end of group) {
          applyEnd(end, dx);
          moved = true;
        }
      }
    }
    if (!moved) return;
  }
};

/**
 * H2 (tasks/attach-x-spreading.md) — no two edges may attach to the same card
 * at the same x on the same border side. Colliding snapped stubs spread at
 * snap-assignment time: the first keeps the card centre, each next steps
 * +8px rightward, clamped inside the card span, wrapping left when the right
 * side is exhausted (same policy as the D1 mover's offsets). The ledger is
 * SEEDED with raw attach x's first — unbundled edges (pure-vertical fan
 * teeth, lone runs) keep elk's own x, so snapped slots must step around
 * them. Keyed by GEOMETRIC side (top/bottom): a snapS and a snapT can land
 * on one border — the S/T split alone would not see them collide. Runs
 * AFTER trunk membership (unpainted stubs keep elk's own attach and take no
 * slot) and BEFORE D1, whose mover checks every new x against all other
 * ends of the card — so a spread never gets re-collided.
 */
const SPREAD_STEP = 8;

const spreadSnapXs = (
  polys: ReadonlyMap<string, Mpt[]>,
  runs: readonly RunX[],
  trunkOf: ReadonlyMap<number, unknown>,
  meta: ReadonlyMap<string, BundleEdge>,
  rects: ReadonlyMap<string, Rect>,
): void => {
  const used = new Map<string, number[]>(); // cardId + side → taken attach x's
  const sideOf = (card: Rect, y: number): string =>
    Math.abs(y - card.y) < 0.5 ? "top" : Math.abs(y - (card.y + card.h)) < 0.5 ? "bottom" : "";
  // one snapped stub per edge end: snapS ⇒ first run, snapT ⇒ last run
  const snapped: Record<"S" | "T", Set<string>> = { S: new Set(), T: new Set() };
  for (const [idx, r] of runs.entries()) {
    if (!trunkOf.has(idx)) continue;
    if (r.snapS) snapped.S.add(r.id);
    if (r.snapT) snapped.T.add(r.id);
  }
  // seed: raw painted attaches (edge ends without a snapped stub) are fixed —
  // register them so snapped slots never land on a fan tooth
  for (const [id, poly] of polys) {
    const e = meta.get(id);
    if (!e || e.from === e.to || poly.length < 2) continue;
    const p0 = poly[0];
    const pn = poly.at(-1);
    for (const [at, pt, cardId] of [
      ["S", p0, e.from],
      ["T", pn, e.to],
    ] as const) {
      if (snapped[at].has(id) || !pt) continue;
      const card = rects.get(cardId);
      if (!card) continue;
      const side = sideOf(card, pt.y);
      if (!side) continue;
      const key = `${cardId}\u0000${side}`;
      const taken = used.get(key) ?? [];
      if (taken.some((v) => Math.abs(v - pt.x) < 0.5)) continue;
      used.set(key, [...taken, pt.x]);
    }
  }
  for (const [idx, r] of runs.entries()) {
    if (!trunkOf.has(idx)) continue;
    const e = meta.get(r.id);
    if (!e) continue;
    const take = (cardId: string, at: "S" | "T"): void => {
      const card = rects.get(cardId);
      if (!card) return;
      const side = sideOf(card, at === "S" ? r.sy : r.ey);
      if (!side) return; // off-border attach: outside D1/H2 scope, keep the centre
      const key = `${cardId}\u0000${side}`;
      const taken = used.get(key) ?? [];
      const x0 = at === "S" ? r.sx : r.tx;
      const free = (x: number): boolean => taken.every((v) => Math.abs(v - x) >= 0.5);
      let x = Number.NaN;
      if (free(x0)) x = x0;
      for (let c = x0 + SPREAD_STEP; Number.isNaN(x) && c <= card.x + card.w - 1; c += SPREAD_STEP)
        if (free(c)) x = c;
      for (let c = x0 - SPREAD_STEP; Number.isNaN(x) && c >= card.x + 1; c -= SPREAD_STEP)
        if (free(c)) x = c;
      if (Number.isNaN(x)) x = x0; // shortcut: span exhausted both ways; probe flags — widen span policy if a corpus ever paints one
      if (at === "S") r.sx = x;
      else r.tx = x;
      used.set(key, [...taken, x]);
    };
    if (r.snapS) take(e.from, "S");
    if (r.snapT) take(e.to, "T");
  }
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
        sx: snapS ? centre(e?.from, 0) : (poly[r.i]?.x ?? 0),
        sy: snapS ? (poly[0]?.y ?? r.y) : r.y,
        tx: snapT ? centre(e?.to, 0) : (poly[r.j]?.x ?? 0),
        ey: snapT ? (poly.at(-1)?.y ?? r.y) : r.y,
      };
    });
  });
  // trunk MEMBERSHIP first (drafts without span — the span must be computed
  // only AFTER D1 moves the stub x's it has to reach)
  type TrunkDraft = { y: number; x0: number; x1: number; kind: string };
  const trunkOf = new Map<number, TrunkDraft>(); // run record (by index into runs) → its trunk
  const drafts: TrunkDraft[] = [];
  const byKind = new Map<string, typeof runs>();
  for (const r of runs) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r]);
  for (const [kind, rs] of [...byKind.entries()])
    for (const g of corridorGroups(rs))
      if (g.length >= 2) {
        // trunk y = mean of member track y's; span filled post-D1
        const t: TrunkDraft = {
          kind,
          y: g.reduce((s, r) => s + r.y, 0) / g.length,
          x0: Number.POSITIVE_INFINITY,
          x1: Number.NEGATIVE_INFINITY,
        };
        drafts.push(t);
        for (const r of g) trunkOf.set(runs.indexOf(r), t);
      }
  spreadSnapXs(polys, runs, trunkOf, meta, rects); // H2 spread first — D1 sees and avoids the taken x's
  separateAttachXs(polys, runs, trunkOf, meta, rects);
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
  return { pieces, trunks };
};
