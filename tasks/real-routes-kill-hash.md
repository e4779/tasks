---
status: pending
---

# Real routes + server-rendered pages (wave C) — hash, SPA and /api all die

## Objective

Operator ruling 2026-11-19 (design discussion): the viewer becomes CLASSIC
server-rendered pages. Doc URLs stop being monsters
(`/#/doc?path=%2Fhome%2F...`) and become canonical file addresses:
`/doc/tasks/ponytail-user-level.md` — relative to the served corpus root,
`.md` kept (plumber-canonical: URL = file). Tab routes become real pages:
`/list`, `/next`, `/graph`. Everything is rendered SERVER-SIDE per request
(our computed-views doctrine, literally); the browser gets complete HTML.
Client JS shrinks to two tiny pieces: vendored d3-zoom for graph pan/zoom
and a 5-line theme toggle. `#/`-routing, the SPA shell, pushState/popstate,
client tab state, the whole `/api/*` JSON layer and client-side markdown
rendering all die.

## Routes

- `GET /` → redirect (303) to `/list` (or render list directly — executor's
  call, document it).
- `GET /list` — server-rendered table: discover → parse → cards; columns
  status/title/path; undone first, then path (same order as `nextUp`).
- `GET /next` — server-rendered nextUp output.
- `GET /graph` — server-rendered SVG: discover → parse → buildGraph →
  mergeEdges → bundleEdges → elk layout (server-side elkjs; 87–118ms @ 180
  nodes measured — fine) → SVG emitted inline into the page. Edge bundling,
  per-kind trunks, cycle-red overlay: all server geometry (move
  `web/edge-bundler.js` + card geometry fns into `src/`; they were browser
  only by accident of the canvas era).
- `GET /doc/<relpath.md>` — server-rendered document: markdown-it (npm
  module, server-side — the vendored browser UMD dies) → HTML; leading h1
  skipped (title above), frontmatter hidden, raw source behind `<details>`.
- Resolution/trust boundary: `/doc` relpath resolves against the served
  roots + corpus membership re-check per request (same rule as the old
  `/api/doc`); abs paths, `..`, unresolvable → 404 page.

## Pages share one layout (function includes, NOT a template engine)

`src/render.ts` (or similar): `page({active, title, body})` wrapper emitting
head (Open Props links, d3/zoom script only on /graph, theme-toggle 5-liner)
+ `<nav><ul><li><a>` (plain links; "tabs" are pure CSS styling of
`aria-current`) + body. Server-side filter form on list/graph: GET form →
query params (`?status=pending&q=therm`) — filters are URL arguments,
server filters, shareable/bookmarkable/curl-able. Theme toggle: flips
`data-theme` on `<html>` + localStorage; `theme.light.switch` subset link
added; `[data-theme=light]` remap of the ~15 fixed ramp steps (chips, bars,
edges, accent, links — they do NOT flip on their own; light mode ships
half-broken without this remap, designer review flagged it).

## Client JS inventory after this wave (COMPLETE list)

1. d3-zoom (vendored) wired to the graph SVG: wheel/pinch pan+zoom over the
   static server SVG. Progressive enhancement: the graph is fully readable
   with JS off.
2. Theme toggle 5-liner (localStorage persist, default dark).
Everything else that today lives in `web/*.js` (app shell, SPA tabs,
snapshot fetch, client markdown, client bundler consumers) is DELETED.

## Card geometry → server

`web/edge-bundler.js`, card size/rect/intersect fns, `web/elk-adapter.js`
move to `src/` (drop the `.js`-in-web pattern). `web/` keeps only CSS,
d3-zoom glue, theme toggle.

## Gates (ac rebirth — most become curl-level)

- Geometry ACs (ac9 overlap, ac10 axis-aligned, ac11 attach, ac13 no-buses,
  ac14 per-edge rise) assert against the SVG ATTRIBUTES in the served HTML:
  curl /graph → parse → verdict. No CDP for geometry — the CDP dependency
  that cost this project days dies with the canvas era's last client piece.
- ac1 (fit) + ac5 (zoom) + vision passes stay CDP/vision (interaction +
  looks) on the viewport matrix (4 sizes).
- ac12 (no ellipsis) — server measures via the same cardSize fn; assert in
  HTML.
- New: /doc/<relpath> returns 200 + rendered HTML for every corpus file;
  404 for abs/.. /missing (trust boundary), asserted.
- Full gates: bun test green, check:full clean (biome symlink),
  probe --ac matrix on test/fixtures AND ~/projects/homelab (with its
  .tsk.conf negations: 80 nodes / 36 edges expected), --canvas dumps for
  vision.

## Notes

- `web/doc.js` markdown rendering moves server-side; markdown-it already an
  npm dep (the browser UMD vendor entry dies).
- Probe --ac rewrite is part of this wave (SVG attr assertions + route
  changes) — budget it, it is not a footnote.
- CDP stays in the harness for screenshots + the two interaction ACs only.
- Design-pass card (blocked-by this) executes AFTER this wave — its
  designer findings target the SSR pages.
- Foreign-repo migrated corpora (homelab 80, bcf 40) are uncommitted in
  those repos — operator review pending, unrelated to this wave's gates.
