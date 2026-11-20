---
status: pending
---

# Through-cards sort to layer ends — crossing-free deep edges

## Objective (operator ruling, 2026-11-20)

«Почему бы mcporter и fabric-orchestration блоки не поменять местами? И
тогда из fabric-orchestration выходит два ребра: одно в шину, второе в
другой блок. Без пересечений». Cards whose edges reach BEYOND the
adjacent layer («through-cards», e.g. `delete-llm → new-repo-structure`
skipping the migrate layer, `delete-fabric → orchestration-nuggets`)
must sort to the ENDS of their layer, so their verticals drop OUTSIDE
the sibling fans' bus spans — zero crossings, hops become unnecessary
for this class.

## Why it crosses today

elk's crossing minimizer runs on ITS model — our hand-drawn buses are
emergent from merged stubs and invisible to it. It places
through-cards mid-layer, directly above foreign bus spans → forced
crossing (measured: x≈957 through bus y≈675 pi-etc; x≈695 homelab
`delete-llm → close-repo`).

## Design

- Pre-layout pass (graph-view/elk-adapter, before feeding elk): per
  layer, order nodes — through-cards (cards with edges spanning ≥2
  layers, i.e. |layer(to) − layer(from)| ≥ 2) sort to the ENDS; the
  end side chosen to match where their deep target sits (left/right by
  target x barycenter). Stable otherwise.
- elk must RESPECT the fed order: enable the model-order option
  (`elk.layered.considerModelOrder.strategy: PREFER_MODEL_ORDER` —
  verify the exact option name supported by the vendored elkjs; older
  name `elk.layered.crossingMinimization.forceNodeModelOrder`).
- Hops stay as the safety net for whatever still crosses (S1/H1
  unchanged — crossings legitimately remaining get arcs).

## Checklist

- [ ] Layer-ordering pass: through-cards to layer ends by target
      barycenter side; stable for the rest
- [ ] elk model-order option enabled (verify vendored elkjs support)
- [ ] Tests: synthetic 3-layer graph with a skip-layer edge → the
      through-card sorts to the end, its route crosses no bus
- [ ] Invariant tool: report remaining interior crossings (H1 exists);
      expect the measured cases to drop to 0
- [ ] Visual: pi-etc (delete-llm/delete-fabric cases) + homelab, both
      themes

## Acceptance criteria

- pi-etc /graph: `delete-llm → close-repo` and `delete-fabric →
  orchestration-nuggets` verticals cross NO bus (H1 crossings for these
  edges = 0; total crossings dropped vs the 16→1 baseline)
- No regression: S1, D1-D3b, H1 PASS both corpora; bun test green;
  check:full PASS
- Visual both themes: through-cards sit at layer ends, verticals fall
  clear of bus spans
- Local only: no tag, no npm publish

## Source

- Operator screenshot 2026-11-20 11:11 + swap proposal (mcporter ↔
  fabric-orchestration) «без пересечений»; same pattern confirmed on
  delete-llm → close-repo (screenshot 2026-11-20 11:11, hop visible).
