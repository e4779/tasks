---
status: pending
---

# Real routes kill hash routing

## Objective

Doc URLs today are ugly monsters — absolute-encoded fs paths behind a hash
route (`/#/doc?path=%2Fhome%2F...`). Ruled by operator 2026-11-19: they
become normal paths — `/doc/tasks/ponytail-user-level.md` — RELATIVE to the
served corpus root, WITH the `.md` kept (plumber-canonical: URL = file).
`/list` `/next` `/graph` become real routes too. The client `#` routing
dies entirely — no redirects for legacy `#/` URLs, they just stop working.

## Baked spec (session design discussion 2026-11-19 — not the executor's to redesign)

Server (`src/serve.ts`):

- `GET /list`, `/next`, `/graph`, `/doc/*` all serve the SAME `index.html`
  shell — the app is client-rendered from `/api/snapshot`; the server does
  not know tabs. Unknown app-routes → shell too, or 404 — executor picks
  and documents the choice next to the route table.
- `/api/doc` gains the relpath protocol: the client sends the path
  RELATIVE to the served roots (`tasks/ponytail-user-level.md`); the
  server resolves against the roots and re-checks corpus membership via
  `discover()` recomputed per request — trust boundary preserved, no
  arbitrary fs reads; absolute paths, `..` traversal, empty → 404.
- `/api/snapshot` nodes gain `relPath` — relative to `roots[0]`; the
  multi-root prefix rule (node lives under another root) is documented
  next to the field.

Client (`web/`, plain JS, no router lib — pathname parsing is trivial):

- `web/app.js` reads `location.pathname` to pick the active tab
  (`/list` `/next` `/graph`; `/doc/<relpath>` → doc view).
- Tab switches use `history.pushState` — instant, no reload; F5/reload
  works because the server serves the shell on every app route; browser
  back/forward = `popstate`.
- `.md` stays in URLs (operator ruling — address = file).
- `web/doc.js` fetches `/api/doc?path=<relpath>`; body links (md links
  and `[[wikilinks]]`) resolve against the current doc's relpath dir and
  rewrite to `/doc/<relpath>` — links between cards become real doc
  routes; absolute `http(s)` targets stay verbatim; the `safeHref`
  allowlist and the scrub pipeline are untouched.
- `web/list.js`, `web/graph.js`, `web/next.js` node-click →
  `/doc/<relpath>` (next.js has no click handler today — it gains one).
- Legacy `#/` URLs die: zero `#/` left under `web/`.

Probes/tests:

- `tools/probe.mjs`: all AC routes move from `/#/x` to `/x`; `--viewport`
  matrix unchanged. New AC OPTIONAL (routes exist = shell 200 on `/list`
  `/next` `/graph` `/doc/<real relpath>` + snapshot nodes carry
  `relPath`).

## Checklist

- [ ] `src/serve.ts`: shell routes `/list` `/next` `/graph` `/doc/*`
      (unknown app-route choice documented); `/api/doc` relpath protocol
      with the membership gate; `/api/snapshot` `relPath` + multi-root
      rule documented.
- [ ] `web/app.js`: pathname routing, `pushState` tab switches,
      `popstate` listener, nav links to real routes, `#/` gone.
- [ ] `web/doc.js`: relpath fetch; body md/wikilink rewrite to
      `/doc/<relpath>`; back link uses the real last-tab pathname.
- [ ] `web/list.js` + `web/graph.js` clicks → `/doc/<relpath>`;
      `web/next.js` gains the click handler.
- [ ] `test/serve.test.ts`: relpath protocol (member 200; non-corpus /
      absolute / `..` / empty → 404, fs untouched), shell 200 on app
      routes, `relPath` added to the snapshot shape test.
- [ ] `tools/probe.mjs` routes moved to `/x`; optional new AC added.
- [ ] `bun test` + `bun run check:full` green.

## Acceptance criteria

- A fixture doc page's URL is `/doc/<relpath>` — no `#`, no query, no
  absolute fs path; `.md` present. EVERY fixture doc in
  `test/fixtures/tasks/` is reachable at its relpath URL.
- `/list` `/next` `/graph` are real routes serving the shell; tab
  switches are `pushState` (no full reload); F5 on any app route
  restores the same view; back/forward walk history without errors.
- Prose links between cards navigate via the new doc routes
  (`normal-card.md` → `./cyclic-a.md` renders as
  `/doc/<relpath-of-cyclic-a.md>`); graph/list/next node-click →
  `/doc/<relpath>`.
- Relpath trust boundary holds: non-corpus relpaths, absolute paths,
  `..` traversal and empty → 404; the fs is only ever read at resolved
  corpus-member paths.
- Snapshot nodes carry `relPath` consistent with the documented
  multi-root rule.
- Zero console errors; full `--ac` matrix green on the fixtures corpus
  AND the homelab corpus (its `.tsk.conf` negations active).
- Legacy `#/` URLs: zero occurrences under `web/` (dead, no redirect).

## Source

- Operator ruling 2026-11-19 (essence, verbatim): doc URLs are ugly
  monsters (`#/doc?path=%2Fhome%2F...` absolute-encoded) — must become
  normal paths relative to the served corpus root, `.md` kept, URL =
  file, plumber-canonical; client #routing dies.
- Spec baked from the session design discussion 2026-11-19 (see Baked
  spec above — server shell, pushState/popstate, relpath protocol).
- Code: `src/serve.ts` (routes, `/api/doc`, `/api/snapshot`,
  trust-boundary comments), `web/app.js` (hash router today),
  `web/doc.js` (fetch + link pipeline), `web/list.js`, `web/graph.js`,
  `web/next.js`, `web/index.html` (shell).
- Tests/probes: `test/serve.test.ts`, `test/doc-view.test.mjs` (link
  policy), `tools/probe.mjs` (AC1–AC14, `--viewport` matrix);
  `test/probe-args.test.mjs` carries an inert `/#/graph` string as an
  arg-parse fixture — not gating, updating it is optional.
- Soft edges: builds on
  [render-markdown-doc-view](./render-markdown-doc-view.md) (done — the
  doc page this routing serves); probe-as-evidence pattern per
  [fix-svg-title-truncation](./fix-svg-title-truncation.md).
