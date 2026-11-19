---
status: pending
---

# Edge routing hygiene — no pass-through, no overshoot, no phantom knees

## Objective (operator ruling, 2026-11-19)

«Линия не должна проходить через блок» — an edge may never visually pierce
a card. Measured defects on the homelab corpus /graph (SVG path data,
live 2026-11-19):

### D1 — pass-through threading (thm012 case)

Incoming merged trunk arrives at a card's BOTTOM at x=1490
(`M1490.04 663 L1490.04 478`, card thm012 x-span 1274..1705, y 452..478),
outgoing edge leaves the card's TOP at the SAME x=1490
(`M1490.04 452 L1490.04 252` to thm002). Result: one continuous line
pierces the card. Invariant: for every card, the set of bottom-attach x
coordinates and top-attach x coordinates must be DISJOINT (offset the
side with fewer attachments by ≥16px within the card span when they
collide — implementation's choice, invariant is the contract).

### D2 — overshoot/backtrack stubs

Grid-snapped rise levels disagree, legs fly PAST the knee and come back:
`thm015→thm012: M370.138 678 L370.138 658 L370.138 663` (5px overshoot);
`hmlb015→hmlb005: 1220→1120→1165` (45px overshoot); `hmlb060→hmlb056:
1762→1742→1747`. Invariant: within one edge path, consecutive VERTICAL
segments must be monotonic (no direction reversal); a stub may not
overshoot its bus/knee level and return.

### D3 — phantom knees + trunk overdraw

`thm008→thm012: 678→668→663` — three collinear segments (a knee that
isn't a knee). Collapse collinear consecutive segments into one. Also:
the identical trunk segment `M1490.04 663 L1490.04 478` is emitted FOUR
times (once per incoming edge) — identical path `d` strings must be
deduplicated (draw shared segments once).

## Current state (verified)

- Defects live in the bundler/riser post-processing: src/edge-bundler.ts
  (bus merge, snapped stubs — ac14 per-edge rise semantics), consumed by
  src/serve.ts /graph rendering.
- Probe evidence: `curl http://127.0.0.1:8931/graph` — paths quoted
  above are verbatim from the live SVG.
- Graph geometry: cards h=26, layers y ∈ {0,226,452,678,904,...}, legs
  rise from card tops to bus levels snapped on a 5px grid.

## Checklist

- [ ] Invariant D1: per-card bottom-attach x set ∩ top-attach x set = ∅
- [ ] Invariant D2: no vertical backtrack within an edge path
- [ ] Invariant D3a: no collinear consecutive segments
- [ ] Invariant D3b: no duplicate path `d` strings in the emitted SVG
- [ ] Visual check both themes, homelab + fixtures corpora

## Acceptance criteria

- Machine check on homelab corpus /graph SVG: all four invariants hold
  (parse paths, assert). thm012 specifically: the incoming trunk x ≠
  outgoing exit x.
- Regression: existing tests green (bun test 136+), ac14 semantics not
  regressed (per-edge rise + snapped stub still route around obstacles).
- Visual: screenshot of homelab /graph (light + dark) — thm012 area
  shows the line STOPPING at the card's edge and the outgoing line
  leaving from a visibly different x; no zigzag stubs.
- Tools/probe or a small node script prints the invariant report.

## Source

- Operator screenshot 2026-11-19 17:30 (thm012 two-legs/pass-through) +
  ruling «линия не должна проходить через блок»; SVG path census by the
  parent session (verbatim paths above).
