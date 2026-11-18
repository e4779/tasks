---
status: done
---

# Render the doc view body as markdown → HTML

## Objective

`/#/doc?path=` today dumps the raw file — frontmatter included — into one
`<pre>` (`web/doc.js`: `el("pre", {}, doc.source)` under the `h2` title).
The page must render the body as HTML instead: headings, links as real
anchors, styled lists and checkboxes. Read-only scope, nothing more: no
editing, no write-back, no click-through navigation wiring (hrefs are
emitted as the source wrote them; in-corpus `.md` → `#/doc?path=` rewrite
is follow-up material, not this card). Checkboxes render STATIC —
checked/unchecked styling only, the viewer never mutates the corpus.

Renderer — ruled by operator 2026-11-19 (READY-MADE only; the
hand-rolled `web/dom.js` option is DELETED):

- Pick: `markdown-it` — 11ty's own parser (verified 2026-11-19: 11ty
  deps `markdown-it ^15.0.3`; lib at 15.0.3, active 2026-10) — vendored
  UMD via `/vendor/`, d3/elk precedent (dep in package.json + `VENDOR`
  entry in `src/serve.ts` + script tag in `web/index.html`; the web
  layer is plain JS, no typings ceremony). `marked.min.js` is demoted
  to a named alternative, not the pick.
- Raw source (executor-owned call): keep it reachable via a small toggle
  or `<details>` around the current pre — minimal either way.

Non-negotiable — trust boundary:

- Escape-by-default: `markdown-it` ships `html: false` by default — raw
  HTML embedded in the source is escaped to inert text, the trust
  boundary is closed by config; keep the default. Task-derived strings
  still never hit `innerHTML` unescaped, and a defensive DOM scrub
  (drop `script`/`style`/`iframe`/`object`/`embed` nodes and every
  `on*` attribute) stays cheap insurance should the config ever be
  loosened.
- Link href allowlist: http/https/relative schemes only. `javascript:`,
  `data:` (and any other scheme) never become hrefs — such targets render
  as inert text, not anchors.

Body composition rules:

- Title dedup: the `h2` above already shows the title, so render the body
  MINUS its first h1 line — the same `^# ` line `src/parse.ts` picks as
  title (`/^# (.+)$/m`); the skipped line and the displayed title must be
  one and the same line. No h1 in the body (fallback-title cards, cf.
  `test/fixtures/tasks/no-h1.md`) → render the whole body.
- Frontmatter never appears in rendered mode. `/api/doc` ships only raw
  `source` today; where the split happens is executor's pick — lean
  server-side (gray-matter already runs in parse; add the body to the
  `/api/doc` JSON) so the client and the parser cannot disagree about
  the split.
- Wikilinks are links too: `[[x]]` → anchor to `x.md` (one preprocessing
  regex mirroring `WIKI_LINK` in `src/parse.ts`) — the `normal-card.md`
  fixture carries one and the AC link check counts it.

## Checklist

- [ ] Renderer wired (markdown-it vendored UMD), `html: false` default
      kept.
- [ ] `/api/doc` body split (or client-side strip): rendered mode shows
      body only, frontmatter nowhere.
- [ ] First-h1 skip implemented; fallback-title cards render whole body.
- [ ] Link policy enforced: http/https/relative only; `javascript:` /
      `data:` inert; raw-html scrubbed (no `script` / `iframe` / `on*`).
- [ ] Wikilink → `.md` anchor preprocessing.
- [ ] Checkboxes static (`disabled` input or non-interactive span;
      markdown-it core is CommonMark — task lists need a plugin or a
      small preprocessing pass, executor's pick); headings, lists, code
      styled with Open Props vars — the AC8 hex ban holds for `web/`.
- [ ] Raw source behind a toggle or `<details>`.
- [ ] Tests updated (`test/serve.test.ts`: new payload field / vendor
      route if added); `bun test` + `bun run check:full` green.

## Acceptance criteria

Machine gate — `bun bin/tsk.ts serve .`, then for EVERY fixture in
`test/fixtures/tasks/` probe
`bun tools/probe.mjs 'http://127.0.0.1:8931/#/doc?path=<enc-abs-path>' --eval '…'`:

- Zero `<pre>` as primary content of `tsk-doc` (a raw-source pre inside
  a collapsed toggle/`<details>` is fine; fenced code blocks inside the
  body are fine — the rendered body itself is not one big pre).
- Every body link is an `<a>` whose href is the source's target (md links
  verbatim: `normal-card.md` → `./cyclic-a.md`, `broken-link.md` →
  `./nowhere.md` — a broken target stays a link, that is `tsk check`'s
  concern, not the viewer's; wikilink → `completed-card.md`).
- The title appears exactly once: exactly one heading node in `tsk-doc`
  matches the title text (the `h2`); the body's leading h1 is not
  rendered; `no-h1.md` renders its whole body.
- Zero console errors / exceptions (probe exit 0).

Security probe — scratch corpus (temp dir, one card whose body packs
`[x](javascript:alert(1))`, `[y](data:text/html,hi)`, raw `<img onerror>`
and `<script>` tags), served and probed the same way: no anchor carries a
`javascript:`/`data:` href; the raw html renders inert (escaped text or
dropped elements); zero console errors.

Vision spot — `--canvas` capture of one real card's doc page: readable
(headings stand out, lists/checkboxes align, no raw `---` frontmatter
blob, no doubled title).

## Source

- Operator intent this session: the doc page must render markdown, not
  `<pre>` source; h1 IS the title (never duplicated); checkboxes static;
  the viewer never mutates the corpus.
- Renderer ruling (operator 2026-11-19): READY-MADE only — hand-rolled
  option deleted; `markdown-it` picked (11ty's parser, lib 15.0.3),
  vendored UMD via `/vendor/`; `marked` demoted to a named alternative.
- Code: `web/doc.js` (the pre dump), `web/dom.js` (`el` — strings become
  text nodes), `web/app.js` (`#/doc` route), `src/serve.ts` (`/api/doc`
  payload, `VENDOR` map, trust-boundary comments), `src/parse.ts` (title
  regex, filename fallback, `MD_LINK`/`WIKI_LINK`), `web/index.html`
  (`tsk-doc` styles, vendor script tags).
- Fixtures: `test/fixtures/tasks/` — `normal-card.md` (md link + wikilink
  + checkboxes), `no-h1.md` (fallback title), `broken-link.md` (dangling
  href).
- Probe surface: `tools/probe.mjs` (`--eval`, `--canvas`, console-error
  gate — cf. [fix-svg-title-truncation](./fix-svg-title-truncation.md)
  for the probe-as-evidence pattern); AC8 hex gate lives in
  `test/web-tokens.test.ts`.

## Resolution

Implemented (commit follows): markdown-it 15.0.3 vendored UMD (dist/browser/), html:false + DOM scrub + href allowlist; server-side body split mirrors parse regex; wikilinks preprocessed; static checkboxes; raw behind details. Security probed with evil corpus: 0 live vectors.
