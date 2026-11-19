---
status: done
---

# Bundle parallel edge tracks into shared trunks (edge buses)

## Objective

Operator ruling on the live homelab corpus (80 nodes / 36 edges): the graph
shows BUSSES — many parallel edge lines stacked in the same corridor. elk
layered deliberately staggers every edge onto its own track (edge-edge
spacing), so the ribbons are PARALLEL but never collinear. They must merge
into ONE line per corridor with short branch stubs — wiring-harness style.
This is a render-layer transform on polylines: a pure geometry fn,
unit-testable, elk output untouched.

## Measured geometry (live viewer, 2026-11 — bake-facts)

- d-attrs: `M{x} {y}L{x} {y}…` — space-separated pairs, no separator before
  the next command (`polyToD` in `web/elk-adapter.js`).
- 36 edges → 20 carry horizontal runs (the rest are pure verticals).
- Worst corridors: a track at y=672 spanning x 1956→5622 (3666 units); a
  track at y=712 spanning x 4341→5760 (1419).
- Adjacent tracks in a corridor are band-separated by ~40 units, distinct y
  per track — elk's edge-edge spacing at work.

## Design (spec direction — executor refines)

- New pure module `web/edge-bundler.js`: deterministic fn
  `polylines → { pieces per edge, trunks }`. Input is the `mapLayout`
  polylines map (edgeId → Pt[]); NO elk re-run, NO DOM — the transform runs
  post-`mapLayout`, pre-paint in `web/graph.js` `paint()`.
- Grouping: horizontal runs (consecutive points with dy≈0) whose y falls in
  one band AND whose x-ranges overlap. Grouping is transitive through
  x-overlap. Tolerance: ~edge-spacing/2 as the starting point, but CALIBRATED
  LIVE so the measured y=672/y=712 anchor tracks (40 apart) land in ONE
  corridor — the ±20 in the AC below is the post-bundling CHECK band
  (stricter), not necessarily the grouping tolerance. Groups of ≥2 members →
  bundle; a group of 1 → identity (edge untouched).
- Trunk: ONE per group — horizontal at band center (midpoint of member track
  y's; mean is fine too — tests pin the choice), spanning the union x-range.
  Painted as its own `path.edge.trunk`, styled neutral gray via Open Props
  token (`stroke: var(--gray-6)` — ac8 forbids raw hex).
- Member rewrite: the original polyline splits at its horizontal run.
  Piece 1 = source-side prefix + short vertical stub ending ON the trunk;
  Piece 2 = target-side suffix + short vertical stub starting ON the trunk.
  Per-edge horizontals are GONE — a bundled member never paints its own
  horizontal run; the trunk carries it. Both pieces keep
  `class: "edge {kind}"` + `data-from`/`data-to` (kinds stay per-edge:
  hard/soft/broken/cycle). Zero-length stub (member already at trunk y)
  collapses; drop degenerate/duplicate collinear points after the rewrite
  (ac10 parses these paths back).
- viewBox unchanged: a trunk spans the union of existing member runs — no
  geometry outside the elk envelope, PAD stays as is.
- Orthogonal to the AC7 merge: `mergeEdges` collapses same-PAIR parallels;
  buses are DIFFERENT pairs sharing a corridor. Edgeless corpora
  (rectPacking branch) never reach the bundler — zero edges, no-op.

## Checklist

- [ ] `web/edge-bundler.js` pure fn; unit tests `test/edge-bundler.test.ts`:
      (a) 3 parallel staggered tracks with x-overlap → ONE trunk at band
      center + per-edge pieces, ZERO member horizontals; (b) single horizontal
      run → identity; (c) same-band but x-disjoint runs → both identity;
      (d) deterministic under input permutation (stable sort by edgeId).
- [ ] `web/graph.js` `paint()`: bundler between `mapLayout` and painting;
      trunk paths painted alongside member pieces.
- [ ] `web/index.html`: `.tsk-graph .edge.trunk` style — token color only.
- [ ] `tools/probe.mjs`: extend the AC state eval with the bus detector —
      parse ALL painted paths' d-attrs, extract horizontal segments
      {y, x0, x1}, group by y-band ±20 with x-overlap (transitive), report
      `{horizontals, corridors, buses}`. New gate ac13 `no-buses`: every
      group holds exactly ONE segment. ac11 taught piece semantics: outer
      endpoints 0-gap on their rect (`pointOnRect`), inner endpoints ON a
      trunk (y within tolerance, x inside its span) — no false `:src`/`:dst`
      fails on pieces. ac7 pair counting dedupes pieces per unordered pair
      (a bundled pair must still count `between: 1`).
- [ ] Live runs: homelab corpus `--ac` probe (ac13 green, horizontals drop
      20 → ≤ corridors, ac10/ac11 green, zero console errors); this repo's
      fixtures corpus probe unchanged where no buses exist — bundler identity,
      no d-attr drift.
- [ ] `bun test` + `bun run check:full` green.

## Acceptance criteria

Machine (probe on the homelab corpus, 80 nodes / 36 edges):

- For every y-band (±20) with x-overlap: exactly ONE horizontal segment (the
  trunk) — per-edge horizontals gone, `buses: []` (ac13).
- Total horizontal segments drop from the measured 20 to ≤ the number of
  distinct non-overlapping corridors: `horizontals === corridors` (every
  remaining horizontal owns its corridor) and `horizontals < 20`.
- All edges still attach 0/0 — ac11 green under piece semantics (outer gap
  0/0 on rects, inner endpoints on trunks); ac10 axis-aligned green.
- Fixtures corpus regression: where no buses exist the bundler is identity —
  probe output unchanged (same nodes/links/attach rows as pre-bundling).

Unit: bundler contract per tests (a)–(d) above.

## Source

- Operator ruling + geometric dossier measured live from the running viewer
  (all values baked into this card).
- Code: `web/elk-adapter.js` (`polyToD`, `mapLayout` — the polylines the
  transform consumes), `web/graph.js` (`paint()` — path.edge classes,
  data-attrs), `web/edges.js` (`mergeEdges` — one line per relation,
  pre-bundling), `tools/probe.mjs` (ac10/ac11 parse d back out — the
  detector extends exactly this machinery).
- Corpus lineage: homelab deps became hard edges via the taskmd migration
  ([migrate-taskmd-corpora](./migrate-taskmd-corpora.md)) — the 36-edge
  layered graph is post-migration reality; the edgeless-wall world of
  [rectpack-edgeless-corpora](./rectpack-edgeless-corpora.md) is the
  zero-edge branch the bundler never touches.

## Resolution

Implemented: web/edge-bundler.js (union-find band grouping BAND=40, transitive x-overlap, groups>=2 -> trunk at mean-y with vertical stubs, group of 1 = identity zero-drift); ac13 no-buses gate in probe; ac10/11/7 trunk-aware. Live homelab: 10-track ribbon -> 1 trunk + 3 more merges; fixtures byte-identical (A/B). Known non-blockers: ac2 wide-short viewport underuse (pre-existing, corpus aspect), ac7 fixture-scoped by design.
