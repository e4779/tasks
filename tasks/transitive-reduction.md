---
status: pending
---

# Transitive reduction — implied blocked-by edges off the picture

## Objective (operator, 2026-11-20)

Canonical `tred` (graphviz): if A→B→C exist, the direct A→C edge is
implied — render WITHOUT it. Cut render-time edges only; card data
untouched.

## Design (baked)

- Apply at graph build (src/graph.ts where edges assemble) AFTER edge
  list construction, BEFORE rendering.
- Cycles exist in corpora (cycle style is a real thing) — naive
  reduction would dissolve cycles (each cycle edge has an alternative
  path around). Correct handling: **SCC condensation** — reduce only
  edges BETWEEN strongly-connected components (transitively implied),
  keep every edge INSIDE an SCC (cycle members stay).
- Semantics: edge u→v is redundant iff ∃ path u→v of length ≥2 within
  the condensation DAG that does not use u→v itself.
- Config flag in .tsk.conf: `reduction = on` default; `off` restores
  the full edge set (a corpus owner may keep a direct edge meaningful).
  Flag flows through the existing config cascade.
- The /doc pages and list counts are UNAFFECTED — reduction is a render
  layer only.

## Checklist

- [ ] SCC condensation + inter-SCC transitive reduction in src/graph.ts
- [ ] .tsk.conf flag (reduction, default on) through config cascade
- [ ] Unit tests: chain A→B→C with A→C → A→C dropped; cycle A→B→C→A +
      chord → cycle edges kept, chord dropped; flag off → full set
- [ ] tools/edge-invariants.mjs still PASS on both corpora (fewer
      edges, crossings drop — report the delta)
- [ ] pi-etc + homelab: report edges-before/after counts

## Acceptance criteria

- Machine: synthetic cases above green; both corpora invariants PASS;
  edge count reduced on homelab (report numbers)
- No data mutation: /doc pages and `tsk list` unchanged
- Local only: no tag, no npm publish

## Source

- Operator 2026-11-20: «что ещё каноничного взять» — tred выбран как
  главный остаток (меньше рёбер = меньше пересечений навсегда).
