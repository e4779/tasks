---
status: pending
---

# Render full card titles (drop canvas-era char truncation)

## Objective

Card rects are sized by measured text width — `cardSize()` in `web/cards.js`
uses `ctx.measureText(title).width + 24` — but the title painted into that
rect goes through `trunc(n.title)`: `web/graph.js:10` defines
`const trunc = (s, max = 22) => (s.length > max ? …)`, applied at
`web/graph.js:149` (`text.textContent = trunc(n.title)`). Char-count cutoff is
a canvas-era leftover from before rect sizing moved to `measureText`. The
result is a double defect, vision-verified on the operator screenshot this
week: every title longer than 22 chars renders ellipsized AND sits inside a
rect sized for the full title — wide rects with dead space and cut text (all
4 real cards in this repo's `tasks/` were truncated on the screenshot).

Fix: delete `trunc` and render the full title (`text.textContent = n.title`).
No replacement cap in v0 — `cardSize` already pays 24px of padding and the
text is `text-anchor: middle` at `r.w/2 + BAR/2` (`web/index.html` styles),
so the full title geometrically fits the rect built for it. If a width limit
is ever reintroduced, it must truncate by MEASURED width (same measure
context / font as `cardSize`), never by char count.

## Checklist

- [ ] `web/graph.js`: remove the `trunc` helper (line 10) and render
      `n.title` verbatim at the `text.textContent` site (line 149).
- [ ] No dead code left behind (biome flags the unused helper if you forget
      to delete it — that is the check, not an excuse to keep it).
- [ ] Probe the rendered repo (checklist for the run below; the eval payload
      is the evidence for AC).
- [ ] `bun test` + `bun run check:full` green.

## Acceptance criteria

- At 1920x1080 on THIS repo — `bun bin/tsk.ts serve .` (corpus = 4 real cards
  in `tasks/` + 7 fixtures in `test/fixtures/tasks/`) probed with
  `bun tools/probe.mjs 'http://127.0.0.1:8931/' --viewport 1920x1080 --eval '…'`:
  over every `tsk-graph .card text` node — (a) ZERO textContent values
  contain the `…` ellipsis char; (b) every `getBBox().width` ≤ its card's
  `data-w − 4` (the BAR allowance — text fits its rect on both sides).
  Exit 0, zero console errors.
- Vision check (`--canvas` capture at the same viewport): all 4 real cards
  from `tasks/` — the exact cards on the operator screenshot — show full,
  uncut titles.

## Source

- Operator screenshot this week, vision-verified: all 4 real cards truncated.
- Code: `web/graph.js:10` (`trunc`, canvas-era), `web/graph.js:149` (the only
  call site), `web/cards.js` (`cardSize` — measureText + 24 padding, min 40),
  `web/index.html` (`.card text`: 12px, `text-anchor: middle`).
- Probe surface: `tools/probe.mjs` (`--viewport WxH`, `--eval`, `--canvas`).
