---
status: done
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

Re-based 2026-11-19 onto the post-wave-C files (see the reality-check map
above); ✅ = already landed by wave C / the operator pass, verify only.

- [x] ✅ Light theme plumbing (D10, D1): `theme.light.switch.min.css` in
      the VENDOR map (`src/serve.ts`) + `<link>` in the shell
      (`src/render.ts`); hardcoded `:root { color-scheme: dark }` gone;
      switch files set `color-scheme` per theme.
- [x] ✅ Filter bar drop on doc (baked scope 3): `page({filters = ""})`
      and the doc route passes none; list/next/graph keep theirs.
- [x] ✅ Real title (baked scope 2) + centered column (baked scope 1):
      `docPage()` renders `<h1 class="doc-title">` (1.75rem, largest on
      the page; body `.md h1` tuned down to 1.4rem); `.doc` centered at
      75ch; back-link above.
- [x] ✅ Fonts (D2): system sans + `ui-monospace` for paths/ids/code,
      no serif — conforming in `web/style.css`; standing bar only.
- [ ] D4 title breakout: move `<h1 class="doc-title">` BEFORE the
      `.doc` div in `docPage()` (`src/render.ts`) — full-width title,
      the column div wraps only article + details; back-link above.
- [ ] D3 marginnotes: `<aside class="marginnote">` in `docPage()`
      (`src/render.ts`) from frontmatter attrs (status; blocked-by
      resolved to `/doc/…` links; tags/created_at when present) + grid
      css in `web/style.css` (main + ~240px rail at ≥1280px viewport,
      stacked below on narrower) + `--text-2` / 0.85rem / no-border
      styling; raw source keeps `<details>`.
- [ ] D5+D6 doc css pass (`web/style.css`): lists — outside markers,
      `padding-left: 0`, nested `ul` `margin-left: 1rem`, `::marker`
      tinted `--text-2`; pre breakout to ~1200px max, centered.
- [ ] D1 token desat in BOTH themes (`web/style.css`): dark chips off
      step-6 (five statuses) + fold in the fixed accents (`.md a`,
      checkbox `accent-color`, status bars, edges); light stays neutral
      gray (no cream); vendored tokens only (AC8).
- [ ] D7 permalinks: `src/markdown.ts` — h2/h3 get `id` + `¶` anchor
      link, hover-revealed, `--text-2`.
- [ ] D8 next-link: `/doc` handler computes `nextUp` (`src/serve.ts`,
      `m` in scope) and `docPage()` renders a `next →` footer link to
      `nextUp[0]`, only when non-empty.
- [ ] D10 no-flash boot: tiny pre-paint inline script in the shell head
      (`src/render.ts`) applies the stored theme before first paint
      (`web/main.js` stays `defer`); `data-theme="dark"` default and
      the seven vendor links stay pinned (`test/web-tokens.test.ts`).
- [ ] Verify: `bun test` + `bun run check:full` green; probe `--ac`
      green on the fixtures corpus; wide-viewport doc screenshots in
      light AND dark (marginnote rail, full-width title, pre breakout,
      desaturated chips in both themes) as handoff evidence.

D9 has no checklist item by design — explicit non-goal.

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

Reviewed 2026-11-19, dark theme, all four routes at 1562x547 + 1920x1080
(plus homelab corpus graph+doc at 1920x1080); shots in /tmp/shots/.

### Ruling violations — known, listed not re-litigated

- **Column**: doc body collapses to a ~480px left-hugging fragment — root
  cause `tsk-doc` has no `display:block` rule (style block, `web/index.html`,
  cf. `tsk-graph` which has one); probe-measured `display:inline`, `p` 480px
  vs `main` 1905px at 1920x1080.
- **Title**: `web/doc.js:62` renders the title as `el("h2")` — computed
  14px/400 while body `.md h2` is 20px (`web/index.html:69`); body headings
  visually outrank the page title.
- **Filter bar on doc**: `web/app.js:17` — `#filters` lives in the static
  shell template, rendered unconditionally on every route.
- **Theme toggle**: absent; `data-theme="dark"` hardcoded
  (`web/index.html:2`), `:root { color-scheme: dark }` hardcoded
  (`web/index.html:14`).
- **Chips**: step-6 ramp hues (`web/index.html:23-27`) — neon on dark.

### P1 (ugly/broken)

1. **Doc body width is a fragmentation accident, not a layout.**
   `tsk-doc` (selector `tsk-doc`, `web/index.html` style block) has no
   `display` rule, so it renders inline; block children land in narrow
   left-hugging anonymous fragments — paragraphs ~480px while the
   `raw source` details/pre row spans the full 1905px on the same page
   (homelab-doc-1920.png: two competing widths, one wall of text). The
   ruled centered column must start from `tsk-doc { display: block }`, or
   any max-width/margin-inline fights the fragmentation instead of layout.
2. **Graph legend overlaps cards at short viewports.** `.tsk-legend`
   absolute bottom-right (`web/index.html:50`) paints on top of bottom-row
   cards at 1562x547 (graph-1562x547.png: covers the right half of the
   bottom-right card). `pointer-events: none` saves clicks, not eyes.
3. **done/cancelled cards are illegible, not de-emphasized.**
   `.card.dim { opacity: .4 }` (`web/index.html:56`, applied
   `web/graph.js:179`) drops 12px titles below readability and washes out
   the status bar too — reads as broken rendering, not hierarchy.

### P2 (polish)

1. Clickable rows have no hover/focus feedback — `tbody tr { cursor:
   pointer }` (`web/index.html:38`) is the only affordance; rows are not
   keyboard reachable either (click-only handler, `web/list.js`; no
   tabindex/role/link). Add a `tbody tr:hover` surface + real links.
2. List table full-bleed: at 1920 the title→path gap is ~1100px of dead
   whitespace (list-1920x1080.png), and paths repeat the redundant absolute
   prefix `/home/e4779/projects/tsk/tasks/...`. Cap the table measure
   (~1280px, centered) and/or show corpus-relative paths — separate from
   the doc-column ruling, same one-declaration cost.
3. Next page is an orphan list: no heading/count, rows flush against the
   viewport edge (`.next-item`, `web/index.html:37`), no status shown (can't
   tell pending from in-progress), rows not clickable while list rows are —
   inconsistent affordance (`web/next.js`).
4. Chips on `#/next` are dead controls: the next view (`web/app.js:86`)
   filters by `isNext` + match only, ignoring `chips` — done/cancelled/
   blocked chips do nothing there. The ruling says filters on next stay
   "fully functional" — today they aren't; wire them or hide them
   (executor's call, do not silently keep dead UI).
5. Graph affordances are invisible: wheel-zoom/pan/click-card exist but
   nothing hints at them; the legend (`web/graph.js` LEGEND) explains edge
   kinds only — the card status bars (pending/in-progress/done/cancelled/
   blocked/none) have no key. Add a one-line hint + status key rows.
6. Soft edges nearly invisible on dark: `--gray-7` dashed strokes
   (`web/index.html:44,47`) on `--surface-1` — only visible on a close look.
7. Empty states are raw text nodes: graph `no matching tasks`
   (`web/graph.js:82`) renders unstyled top-left inside the bordered
   canvas; doc not-found is similarly stark. Style both while touching
   those files.
8. Neon family leaks beyond chips: checkbox `accent-color: var(--blue-6)`
   (`web/index.html:74`), `.md a` blue-4 (`web/index.html:75`) — fold into
   the same desaturation/token pass as the ruled chips.

### Theme toggle pre-work (what the toggle needs)

- `node_modules/open-props/theme.light.switch.min.css` EXISTS (v1.7.23);
  mechanism mirrors dark: `:where([data-theme=light],.light,.light-theme)`
  overrides `--text-1/--text-2/--surface-*` AND sets `color-scheme` per
  theme. Toggle = flip `data-theme` on `<html>` + add the `<link>` + drop
  the hardcoded `:root { color-scheme: dark }` (`web/index.html:14`).
- The ruling does NOT cover: ~15 fixed ramp steps in `web/index.html`
  (chips :23-27, `.st` :32-36, bars :57-63, edges :42-47, accent :74,
  links :75) do not flip with the switch. On light they fail: step-6 text
  on gray-0 fails small-text contrast (orange-6 on white ≈ 2.9:1), gray-7
  soft edges go invisible, chip active text `--surface-1` (near-white) on
  step-6 bg fails. The toggle needs a small `[data-theme=light]` remap
  (higher steps: ~-9/-11 for text, ~-8/-9 for fills) or light mode ships
  half-broken.
- **RESOLVED (final rulings 2026-11-19)** — wave C already ships the
  `[data-theme=light]` remap (`web/style.css`, ≥10 blocks, pinned by
  `test/web-tokens.test.ts`) plus the light switch VENDOR entry + `<link>`
  (`src/serve.ts`, `src/render.ts`). The palette *direction* is now final
  in **Design decisions (final, 2026-11-19)** below: light theme =
  neutral Open Props grays, NO cream (D1); desaturated chip/accent steps
  in BOTH themes (D1); serif never enters the viewer (D2); toggle
  mechanics unchanged — only the no-flash inline head script is still
  missing (D10).

### Vision-unsure

- homelab-graph-1920.png: 12px card labels at fit-zoom — most legible,
  some not; readability flagged regardless of individual labels.
- indigo-6 (blocked) vs blue-6 (in-progress) chips: distinct in both
  shots, borderline at a glance — both readings stand.
- doc-1562x547.png: `.md h1` (1.4rem) vs page-title h2 (14px) — certain
  the body heading wins; shot cuts mid-heading, no second reading needed.

### Suggested decomposition (least code)

1. **Doc pass (ruled)**: `tsk-doc { display: block }` + centered 65-75ch
   column + `el("h1")` title + drop `#filters` on the doc route —
   `web/index.html`, `web/app.js`, `web/doc.js`.
2. **Theme toggle (ruled) + token remap**: toggle button + light switch
   link + drop hardcoded color-scheme + `[data-theme=light]` remap of the
   fixed ramp steps + dark chip desat — `web/index.html`, `web/app.js`,
   `src/serve.ts` VENDOR map.
3. **Graph polish**: legend collision fix + dim .4→~.65 + status key in
   legend + soft-edge contrast + styled empty state + zoom/click hint —
   `web/index.html`, `web/graph.js`.
4. **Table/next polish**: row hover + keyboard-reachable rows, next
   affordance/status/count, list measure cap + path shortening —
   `web/index.html`, `web/list.js`, `web/next.js`, `web/app.js`.

## Design decisions (final, 2026-11-19)

Operator + parent session rulings; they layer ON TOP of baked scope 1-6
above and win where earlier drafts in this card disagree (e.g. the
theme-toggle pre-work's remap sketch). D9 names the one explicit
non-goal. The checklist below carries the D-numbers. ACs for D3-D8 land
with the post-review decomposition pass, not here (this card still does
not pre-decompose).

### Reality check — file map after wave C

Wave C landed AFTER the review above was written (commit 4799766:
server-rendered pages — SPA shell, `/api` layer and client markdown
deleted). The older sections reference pre-wave-C files; they stay as
the historical record. Current mapping:

- `web/index.html` (style block + shell + `#filters`) → `web/style.css`
  (all page css, incl. the `[data-theme=light]` remap) + `src/render.ts`
  (`page()` shell, `filterForm`).
- `web/app.js` → deleted. `#filters` on doc is already gone:
  `page({ filters = "" })` and the doc route passes none.
- `web/doc.js` (h2 title, `/api/doc` fetch) → deleted. `src/render.ts`
  `docPage()` renders `<h1 class="doc-title">`, `<article class="md">`
  and the raw-source `<details>` server-side.
- `src/serve.ts` VENDOR map already maps all seven vendor css incl.
  `theme.light.switch.min.css` — old checklist item 1 is landed, not
  pending.
- `src/parse.ts` exposes raw frontmatter as `ParsedTask.attrs` (D3 rides
  it); `src/next.ts` `nextUp` is server-side (D8 rides it).

### D1 — Colors: neutral light, desaturated accents in both themes

tsk does NOT parrot the operator's tufte-styled personal site
(zola-harmless: cream `#fffff8`, serif). The viewer is a tool aesthetic —
identity lives in the graph and the layout, not a paper imitation.

- Light theme = NEUTRAL: Open Props gray ramp surfaces (`--gray-0`/`--gray-1`)
  + text `--gray-9`/`--gray-10` (the light switch vars already lean gray —
  keep them; add nothing warm).
- Dark theme keeps the current desaturated surfaces.
- Chip/accent hues: desaturated steps in BOTH themes — the dark neon fix
  (baked scope 5) generalizes. Move every fixed ramp step off step-6
  (chips, `.st`, status bars, edges, `.md a` blue-4, checkbox
  `accent-color` blue-6) to low-chroma picks (higher ramp steps and/or
  `-hsl` variants; the five statuses stay distinguishable in both
  themes).
- Vendored tokens only — no raw hex (`test/web-tokens.test.ts` AC8).
- No cream anywhere in the viewer; no serif (D2).

### D2 — Fonts: system stacks stay, no serif

use-system-fonts philosophy, already conforming in `web/style.css`:
system sans everywhere; `ui-monospace` for paths/ids/code. The operator
REJECTED introducing serif for doc pages — his personal site keeps its
serif; the tsk viewer never gets one. No work in this card; a standing
bar against future drift.

### D3 — Marginnotes: frontmatter as right rail

The borrowed idea, from the operator's zola-harmless aside pattern
(in-body margin notes, not footer).

- `src/render.ts` `docPage()`: frontmatter metadata (status;
  blocked-by, each entry resolved to a corpus-relative `/doc/…` link;
  tags and created_at when present — raw frontmatter rides
  `ParsedTask.attrs`, path resolution reuses the serve roots + `relOf`
  trust pattern) renders as `<aside class="marginnote">`.
- Layout: grid — main column + marginnote column ~240px at ≥1280px
  viewport; below that breakpoint the aside stacks UNDER the content.
- Styling: `--text-2`, 0.85rem, no borders.
- Raw source keeps its `<details>`. This REPLACES the bare
  hide-behind-details as the only metadata surface: details stays for
  the full source, the marginnote becomes the at-a-glance metadata UI.

### D4 — Title full-width (ruled)

`docPage()` renders `<h1 class="doc-title">` BEFORE the `.doc` column
div — a structural breakout, not CSS (today the h1 sits inside `.doc`
and inherits the 75ch measure). Back-link stays above.

### D5 — Lists: markers hang in the gutter (ruled)

Inside `.doc`: `list-style-position: outside`, `padding-left: 0`
(markers hang in the left gutter, list text at full column measure);
nested `ul` gets `margin-left: 1rem` for hierarchy; markers tinted
`--text-2` (`::marker`). `web/style.css`, `.doc .md ul/ol` block.

### D6 — Pre/code breakout (ruled earlier)

`pre` blocks escape the column: width breakout to ~1200px max, centered
against `<main>` (breakout mechanics are the executor's — negative
inline margins or `width: min(1200px, …)` + `margin-inline: auto`).
Keep the existing `white-space: pre-wrap` + surface/border styling.

### D7 — Permalinks on h2/h3

`src/markdown.ts` heading render: emit an `id` + a zola-anchor-style `¶`
link on h2/h3; revealed on heading hover, `--text-2`.

### D8 — Next link in the doc footer

Doc page footer link `next →` to `nextUp[0]`. `nextUp` is already
computed server-side (`src/next.ts`) for `/next`; compute it in the
`/doc` handler (`m` is already in scope, `src/serve.ts`) and thread the
href through `docPage()`. Render only when `nextUp` is non-empty.

### D9 — Checkbox write-back: OUT (explicit non-goal)

Interactive checkbox write-back on doc pages is a FEATURE, not a design
concern — explicitly out of this card. If ever requested: a separate
follow-up card. Do not sneak write-back interactivity into the doc
checkboxes.

### D10 — Theme toggle mechanics unchanged

`data-theme` flip on `<html>` + localStorage + no-flash inline script in
`<head>` (per the earlier checklist). Landed: the toggle button +
persistence (`web/main.js`), the light switch css, the light remap.
Still to add: the tiny pre-paint inline boot script in the shell head
(`src/render.ts`) — today `web/main.js` is `defer`, so the stored theme
applies post-parse and a light flash is possible against the dark
default. `data-theme="dark"` stays the default attribute (pinned by
`test/web-tokens.test.ts`); light tokens = neutral per D1.


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
- Design decisions finalized 2026-11-19 (operator + parent session):
  neutral light palette, no cream, no serif (D1, D2); marginnotes from
  the zola-harmless aside pattern (D3); title full-width, gutter lists,
  pre breakout, permalinks, next-link (D4-D8); checkbox write-back OUT
  (D9); toggle mechanics confirmed, no-flash boot script still to add
  (D10). Wave C (server-rendered pages) landed between the review and
  these rulings — the checklist is re-based on post-wave-C files.
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
