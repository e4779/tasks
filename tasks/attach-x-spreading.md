---
status: pending
---

# Attach-x spreading — no two edges share a card attach point

## Measured defect (pi-etc /graph, zoomed screenshot 2026-11-20 11:11)

Card `new-repo-structure` (x=6038, w=344, top y=226) has THREE outbound
edges snapped to its centre line:

- `→ migrate-ext-llm`:  x=6203.634, y 226→26, with hop arc at y≈161
- `→ extract-pi-recall`: x=6210.004, y 226→156
- `→ migrate-ext-shell-gate`: x=6210.004, y 226→161

Two edges share x=6210.004 EXACTLY and run collinearly — a double-painted
line invisible at fit zoom, a fat double track when zoomed (operator's
screenshot). Root: source stubs snap to the card centre line by design
(edge-bundler.ts:407 `centre(e?.from, 0)`, docblock «shared sources
overlap into ONE drop line») — that merge design predates hops/zoom.

## Ruling

No two edges may attach to the same card at the same x on the same side.
Spread collisions: first edge keeps the centre, each next takes +8px
rightward (clamp within the card span, wrap to left if exhausted — same
policy as the D1 mover). Applies to BOTH snap sides (S and T).

## Checklist

- [ ] Used-x ledger per (card, side) during snap assignment; colliding
      snaps offset +8px step
- [ ] Invariant H2 in tools/edge-invariants.mjs: per card+side, attach x
      values pairwise distinct (report line like D1-D3b/H1)
- [ ] Existing invariants D1-D3b + H1 stay PASS; hops recompute cleanly
      after re-spread (a hop between two now-spread verticals may vanish
      — fine, H1 counts what exists)
- [ ] Unit tests: 2 edges same source card → distinct snap x (≥8px);
      3 edges → 3 distinct; fan edges (snapS=false) unaffected

## Acceptance criteria

- pi-etc /graph: the new-repo-structure triple renders as three separate
  verticals (no collinear pair); zoomed screenshot clean
- tools/edge-invariants.mjs: H2 PASS on homelab + pi-etc; D1-D3b, H1 PASS
- bun test green, check:full PASS
- Local only: no tag, no npm publish

## Source

- Operator zoomed screenshot 2026-11-20 11:11 («снова с шинами беда») +
  SVG path census by the parent (verbatim x values above).
