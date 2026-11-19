---
status: pending
blocked-by:
  - ./real-routes-kill-hash.md
---

# Doc page redesign + global design pass

## Objective

The doc page (the card viewer this project exists for) reads poorly: the
content column hugs the left edge on a wide screen, the card title renders
as small body text instead of a proper heading, and the search box + status
chips — meaningful only on list/graph — leak onto the doc route where they
filter nothing. Status chips are also oversaturated for the dark theme
(neon step-6 ramp hues). Ruled by operator 2026-11-19: fix the doc page
layout, drop the filter bar from the doc route, desaturate the chips, and
add a light/dark theme toggle to the header. THEN a designer subagent
critically reviews ALL pages and appends findings to the placeholder below;
follow-up decomposition happens with the operator AFTER that review lands —
this card intentionally does NOT pre-decompose.

## Baked scope (operator non-negotiables — not the executor's to redesign)

1. **Doc page column** — content column centered with a sane max-width,
   reading measure ~65–75ch; back-link stays above the column.
2. **Real title** — the card title renders as a real `<h1>`, the largest
   type on the page (today `web/doc.js` renders it as an unstyled `h2`
   while body headings are tuned in `web/index.html`, so it reads as body
   text and body `h1`s can visually out-rank it).
3. **No filter bar on the doc route** — search box + status chips are
   removed from the doc view (they belong to list/next/graph and stay
   there, fully functional).
4. **Theme toggle** — light/dark toggle in the header; persists via
   localStorage; default dark; no light flash on load.
5. **Chips desaturated in dark theme** — Open Props ramps offer low-chroma
   steps (executor picks: higher ramp steps and/or `-hsl` variants);
   the operator questioned the current neon look.
6. Everything else on every page is the designer's review territory —
   findings go to the placeholder section below, decomposition after.

## Current state (verified in code, 2026-11-19)

- `web/index.html` — single `<style>` block, all page css. `main` has NO
  width constraint at all (no `max-width` anywhere under `web/` or `src/`
  — the operator's "~600px left-hugging column" symptom is real even
  though the code today is full-fluid; the fix is the same either way:
  an explicit centered reading column). Chip hues are step-6 ramp vars:
  `--orange-6 --blue-6 --green-6 --red-6 --indigo-6`. `<html>` hardcodes
  `data-theme="dark"` and a hardcoded `:root { color-scheme: dark }`.
- `src/serve.ts` VENDOR map — vendored today: `normalize`,
  `theme.dark.switch`, `sizes`, `colors`, `shadows`, `easings`.
  **`theme.light.switch.min.css` EXISTS** in `node_modules/open-props/`
  (v1.7.23) but is not mapped/served/linked yet — verified.
  Its mechanism matches the dark one: `:where([data-theme=light])`
  overrides the (light) normalize base; the dark file overrides under
  `:where([data-theme=dark])`. So the toggle = flip the `data-theme`
  attribute on `<html>` + load both switch files.
- `web/app.js` — the `#filters` form (search input + `#chips`) is part of
  the static shell template, rendered unconditionally on every route
  including `#/doc` (post-routes: `/doc/*`) — that is the leak.
- `web/doc.js` — title renders via `el("h2", …)`; the server
  (`src/serve.ts` `/api/doc`) already strips the body's first `# ` line,
  so the title exists ONLY as this heading. Back-link
  (`a.back`, href = caller tab) already exists — keep it.
- Guards: `test/web-tokens.test.ts` AC8 forbids raw hex anywhere in
  `web/*.js` and `index.html` (colour = vendored tokens only) and pins
  `data-theme="dark"` + the six `/vendor/*.min.css` links in index.html —
  adding the light link is additive, keeping the default attr satisfies
  the pin; do not break either. `test/doc-view.test.mjs` (link policy)
  and `tools/probe.mjs` assert nothing about filters/headings/width —
  layout changes are free there.
- NOTE: open-props ships NO `font-size` subset (only `fonts.min.css` for
  families) — type sizes stay plain rem steps like the current stylesheet.

## Checklist

- [ ] `src/serve.ts` VENDOR map + `web/index.html`: add
      `theme.light.switch.min.css` (constant map entry + `<link>`, same
      pattern as the dark file); remove/replace the hardcoded
      `:root { color-scheme: dark }` so `color-scheme` follows the active
      theme (the switch files already set it per theme).
- [ ] Theme toggle in the header (`web/index.html` + `web/app.js`): a
      button in/next to `<nav>` flips `data-theme` on `<html>`; choice in
      localStorage; a tiny pre-paint inline script in `<head>` applies the
      stored theme on boot (default dark when unset) — no light flash;
      `data-theme="dark"` stays the default attribute in the served HTML
      (web-tokens test pins it).
- [ ] Doc route drops the filter bar (`web/app.js`): search box + chips
      absent on `/doc/*` (post-routes shell; do not render them for the
      doc view); list/next/graph keep them working unchanged.
- [ ] Doc page layout (`web/index.html` + `web/doc.js`): content column
      centered (`margin-inline: auto`) with `max-width` ~65–75ch; title
      becomes `el("h1", …)` styled as the largest type on the page
      (rem scale; body `.md h1` tuned down so the page title wins);
      back-link stays above the column.
- [ ] Chips desaturated for dark (`web/index.html`): active chip hues
      move from step-6 ramps to low-chroma picks (higher ramp steps /
      `-hsl` variants — executor's eye decides); five statuses remain
      distinguishable; vendored tokens only (no raw hex — AC8).
- [ ] Verify: `bun test` + `bun run check:full` green; probe `--ac`
      matrix green on the fixtures corpus; wide-viewport screenshots of
      the doc page (light AND dark) captured as handoff evidence for the
      designer subagent.

## Acceptance criteria

- On a wide viewport the doc page content is a centered column with a
  reading measure in the ~65–75ch band — not full-width, not hugging the
  left edge — and the back-link is visible above it.
- The card title renders as an `<h1>` and is visually the largest text on
  the page, outranking every heading inside the rendered body.
- On the doc route the search box and status chips do not appear; on
  list/next/graph the filter bar still filters (search matches, chips
  toggle visibility) as before.
- The header toggle switches light/dark instantly; the choice survives
  reload (localStorage); with no stored choice the page loads dark; no
  light-theme flash on boot in dark mode; native form controls/scrollbars
  follow the active `color-scheme`.
- In dark theme the active chips no longer read as neon: desaturated
  hues, legible on the dark surface, the five statuses still tell apart.
- `bun test` green (incl. `test/web-tokens.test.ts`: no raw hex, default
  `data-theme="dark"` and all seven vendor css links present),
  `bun run check:full` green, probe `--ac` green on the fixtures corpus
  (post-routes URLs).

## Design review (designer findings)

<!-- Placeholder — DO NOT pre-fill.
     After this card lands, a designer subagent critically reviews ALL
     pages (list / next / graph / doc, both themes) and APPENDS its
     findings to this section. -->

## Decomposition

<!-- Placeholder — DO NOT pre-fill.
     Parent + operator decompose the follow-up work AFTER the design
     review above lands. This card intentionally does not pre-decompose. -->

## Source

- Operator intent 2026-11-19 (essence, verbatim): doc page layout is
  broken — content column narrow (~600px) hugging the LEFT edge on a wide
  screen; the card title renders as small body text, not a proper H1; the
  search box + status chips are meaningless on the doc page — REMOVE them
  from doc view (they belong to list/graph); status chips are
  oversaturated for dark theme; need a light/dark theme toggle in the
  header (persist localStorage, default dark); then a designer subagent
  reviews ALL pages — leave placeholder sections for its findings and for
  the post-review decomposition.
- Hard edge rationale: [real-routes-kill-hash](./real-routes-kill-hash.md)
  (pending) rewrites the routing this design sits on (`web/app.js`
  pathname routing, `web/doc.js` relpath fetch/back-link) and changes doc
  URLs — the design executor must see and screenshot the POST-routes
  pages, and would collide head-on in `app.js`/`doc.js`/`index.html`
  otherwise. Hence `blocked-by`, not a soft edge.
- Code (verified 2026-11-19): `web/index.html` (all page css, chip hues,
  `data-theme="dark"`), `web/app.js` (shell + `#filters` template),
  `web/doc.js` (h2 title, back-link, render pipeline), `src/serve.ts`
  (VENDOR map, `/api/doc` title split);
  `node_modules/open-props/theme.light.switch.min.css` (exists, unmapped).
- Guards: `test/web-tokens.test.ts` (AC8 no-hex + vendor/theme pins),
  `test/doc-view.test.mjs`, `test/serve.test.ts`, `tools/probe.mjs`.
- Related (soft): builds on
  [render-markdown-doc-view](./render-markdown-doc-view.md) (done — the
  doc page being redesigned).
