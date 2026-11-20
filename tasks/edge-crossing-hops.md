---
status: done
---

# Edge crossings — hop markers (semicircle jumps) at every crossing

## Objective (operator ruling, 2026-11-20)

«Лучше, чтобы пересечений рёбер вообще не было. А если и есть — то
должны быть явные обозначения (вот эти полукружочки на схемах)».
Full elimination is impossible in general (non-planar DAG vs layered
layout: a child directly below another fan's bus MUST cross it —
measured case below). So: every crossing of two different edges gets an
explicit hop marker — a semicircle arc in one of the two lines, the
circuit-diagram convention.

## Measured case (pi-etc corpus /graph, 2026-11-20 screenshot)

- Horizontal trunk (fan bus of the "Delete skill"/"Migrate skill" layer)
  spans x≈322..1725 at y≈675.
- Vertical edge `fabric-orchestration → orchestration-nuggets` descends
  at x≈957 straight THROUGH the trunk, continuing to the child below.
- Result: an unmarked X crossing at (957, 675).

## Design decisions (baked)

- **Convention: the VERTICAL segment hops, the horizontal trunk runs
  continuous.** Matches circuit-diagram and metro-map practice; the
  trunk is the shared main line, the single vertical is the exception.
- Hop = semicircle arc, radius ~6px, replacing ±radius of the vertical
  segment around the crossing point: path goes
  `L x (yc − r) A r r 0 0 1 x (yc + r) L …` for a downward run (sweep
  flag so the bump faces right; flip for upward runs so the bump always
  faces the same visual side relative to travel).
- **T-junctions are NOT crossings**: an intersection at a segment
  ENDPOINT of either edge (leg meeting the trunk it belongs to, fan
  legs sharing a node) must stay a plain joint — no arc.
- Crossings between collinear/overlapping segments of the same merged
  geometry are already deduplicated (D3b) — skip.
- Multiple crossings on one vertical: sort by y, hop each (radius must
  keep ≥2px clear between consecutive hops; if two crossings are closer
  than 2r, hop only the first and leave the rest plain — never draw
  overlapping arcs).
- Only inter-EDGE crossings count: an edge crossing its OWN segments
  (should not exist post-D2) is ignored.

## Checklist

- [ ] Crossing detection pass over the final segment list (axis-aligned
      segments — exact integer-ish math, no epsilon ambiguity): pairwise
      interior×interior intersections between DIFFERENT edges
- [ ] Hop insertion in the winning edge's path `d` (arc split as above)
- [ ] T-junction exemption (endpoint touch = joint, not crossing)
- [ ] Unit tests: vertical×horizontal crossing → arc inserted; T-junction
      → no arc; two crossings one segment → two arcs; closer-than-2r
      → single hop; same-endpoint fan edges → untouched
- [ ] Invariant tool extension: tools/edge-invariants.mjs gains a hop
      report (counts crossings found vs hops inserted; every interior
      crossing must have exactly one hop arc)
- [ ] Visual: pi-etc /graph — the (957, 675) crossing shows a hop;
      homelab corpus unchanged joints stay clean; both themes

## Acceptance criteria

- tools/edge-invariants.mjs: interior crossings found = hops inserted
  (report line), RESULT stays PASS for the four existing invariants
- bun test green (140+new), check:full PASS
- Visual both themes: semicircle hops visible at crossings; T-junctions
  untouched; trunk lines continuous under hops
- Local only: commit to main, NO tag/npm publish (operator gates
  releases)

## Source

- Operator screenshot 2026-11-20 08:30 (pi-etc /graph zoom: unmarked
  crossing at (957, 675)) + rulings «пересечений быть не должно… если
  есть — явные обозначения, полукружочки».
