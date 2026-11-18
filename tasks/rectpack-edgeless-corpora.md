---
status: done
---

# Rectpack edgeless corpora (ELK algorithm switch)

## Objective

`web/elk-adapter.js` hardcodes `elk.algorithm: "layered"`. With zero edges,
layered puts every node into one rank → an overlapping wall. Observed on the
real homelab corpus: 82 nodes, 0 edges, probe `ac9 no-card-overlap` FAIL.
ELK ships `org.eclipse.elk.rectPacking` — built for edgeless/disconnected
input, it packs node rectangles in 2D. Detect an edgeless corpus and switch
the algorithm at layout-input build time.

## Switch rule (v0 scope)

- Switch condition: the merged edge list is EMPTY (`edges.length === 0` as
  passed into `buildElkGraph`). rectPacking routes no edges, so it is only
  correct when there is nothing to route.
- "Mostly disconnected" corpora (some edges, several components) stay on
  layered — layered already stacks disconnected components. Revisit only if a
  real mostly-disconnected corpus still walls; record the observation here.
- Interplay: once taskmd `dependencies` become visible edges (see
  [decide-taskmd-deps-adapter-or-migration](./decide-taskmd-deps-adapter-or-migration.md)),
  homelab stops being edgeless — but fresh and filtered corpora remain a real
  case, so this fix stays regardless of that decision.

## Checklist

- [ ] `web/elk-adapter.js` `buildElkGraph`: when `edges.length === 0`, set
      `elk.algorithm` to `org.eclipse.elk.rectPacking`; keep
      `elk.aspectRatio`; drop layered-only options in that branch
      (`elk.edgeRouting`, layered spacings are meaningless there).
- [ ] `test/elk-adapter.test.ts`: new test — 80 synthetic nodes, empty edge
      list → algorithm is rectPacking; the existing layered-options test
      unchanged (edges present → still `"layered"`).
- [ ] Synthetic fixture corpus at `test/fixtures/edgeless/tasks/` (the dir
      MUST contain `tasks/` — discovery pattern is `**/{tasks,todos}/**/*.md`):
      80 minimal frontmatter cards. Generator preferred over 80 committed
      files; ponytail picks the smaller diff, but files must exist on disk at
      serve time.
- [ ] Browser-truth run: `bun bin/tsk.ts serve test/fixtures/edgeless` +
      `bun tools/probe.mjs 'http://127.0.0.1:8931/'` — eval payload
      `nodes: 80`, `overlaps: []`, nonzero spread on both axes, exit 0.

## Acceptance criteria

- Unit: `buildElkGraph` with 80 nodes + 0 edges selects rectPacking; with the
  existing 4-edge fixture it stays layered.
- Probe on the synthetic 80-node no-edge corpus: zero overlaps in the eval
  payload (the ac9 predicate), cards spread in BOTH axes (`xSpread > 0` and
  `ySpread > 0` — no single-rank wall), no console errors, exit 0.

## Source

- Observed failure: homelab probe run this week — 82 nodes / 0 edges / ac9
  FAIL (all cards one rank, overlapping wall).
- Code: `web/elk-adapter.js` (`layoutOptions` block), `web/graph.js`
  (`elk.layout` call, edge merge), `tools/probe.mjs` (ac9 + DEFAULT_EVAL
  payload semantics), elkjs vendored via `src/serve.ts` VENDOR map.

## Resolution

Implemented in 532a88c: empty merged edges -> org.eclipse.elk.rectpacking (all-lowercase id — card casing was a typo); elk overshoots asked aspect 1.2-1.7x so we ask aspect/1.5 (shortcut noted); targetWidth dead end recorded. Both corpora green at 1920x1080.
