---
status: done
---

# Single-stem attach doctrine — one stem per card side, ±8px from centre

## Objective (operator ruling, 2026-11-20)

«Мы страдаем какой-то хуйнёй и по-месту чиним заплатками. Решение должно
быть простое, как остальные это решают». Supersedes the attach-x-spreading
approach (H2 comb): the D1 mover, the spread pass, and the raw-tooth
exemption are all band-aids over one wrong model — «many attach x per
card side». The canon (graphviz ports, org-chart tools): **a card has at
most ONE attach stem per side** — inbound stems at centre − 8, outbound
stems at centre + 8. All edges merging into a side's stem paint one line;
the fan distributes at the rail over the CHILDREN's x positions.

## Why this kills every symptom by construction

- Comb (26-stub hatch): all teeth snap to the side stem — one line.
- Double track (raw tooth beside the bundle): raw pure-vertical teeth
  within the card's span SNAP to the side stem too — no exception.
- D1 pierce: sides are ±8 apart by construction — the mover is dead code
  (kept only as an assertion).
- H2 (attach x pairwise distinct) is REVERSED: the invariant becomes
  **S1 — exactly one attach x per card per side** (per geometric
  direction; both sides may coexist, offset ±8).

## Implementation notes

- edge-bundler: remove spreadSnapXs + its ledger; extend snapping to
  raw pure-vertical teeth whose attach x lies within the owner card's
  span — they bundle into the side stem (same stub emission as snapped
  members). Teeth outside the card span stay raw (genuinely distant
  routes).
- D1 mover: delete the move logic; keep a debug assertion that top x ≠
  bottom x (should be impossible: −8 vs +8 from centre).
- tools/edge-invariants.mjs: replace H2 with S1 (per card+side, distinct
  attach x count ≤ 1). H1 stays (stems crossing unrelated rails hop;
  cluster rule ≤2r stays — a stem through a dense rail band hops once).
- Hop arcs on a stem: a stem may cross several rails — one hop per
  crossing cluster, arc faces travel direction as today.
- Revert the +8 test expectations from attach-x-spreading; new tests:
  26-edge fan → exactly 2 stems at centre±8; raw tooth within span →
  snapped into the stem; tooth outside span → stays raw; top/bottom
  stems never coincide.

## Acceptance criteria

- pi-etc /graph: the new-repo-structure fan = ONE stem (no comb, no
  double track), verified zoomed; homelab thm012 fan = one stem.
- tools/edge-invariants.mjs: S1 PASS both corpora; D1-D3b, H1 PASS.
- bun test green, check:full PASS.
- Local only: no tag, no npm publish.

## Source

- Operator screenshot 2026-11-20 11:58 (hatched comb) + ruling «решение
  должно быть простое, как остальные это решают»; supersedes
  attach-x-spreading.md.
