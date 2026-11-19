---
status: pending
blocked-by:
  - ./real-routes-kill-hash.md
---

# Filter forms swap fragments, no full reload (htmx-style, hand-rolled)

## Objective

Wave C makes the viewer classic server-rendered pages where filters are GET
forms → query params (`/list?status=pending&q=therm`, `/graph?…`) → a full
page reload per filter change. This card adds the OPTIONAL progressive
enhancement AFTER wave C: intercept the filter form submit, fetch the same
URL, swap only the content fragment. ~10 lines of client glue with htmx-style
semantics — hand-rolled `fetch` + swap, NOT the htmx dependency (no new npm
dep; `package.json` unchanged).

Measurement-first ruling: if wave C's SSR is already imperceptible, this card
may close "not needed" — but only with measurement evidence (serve timing on
the homelab corpus: full reload vs fetch-swap delta, checklist item 1). No
numbers, no closure.

## Baked rulings (operator, 2026-11-19 — not the executor's to redesign)

1. **Progressive enhancement**: without JS — or when the fetch fails — the
   form submits naturally; the full page works as wave C shipped it. With
   JS: no reload, instant swap.
2. **Swap target = `<main>` only.** Header/nav and the filter form persist,
   so form state (focus, caret, q value) survives the swap — the form must
   therefore live OUTSIDE `<main>` in wave C's `page()` layout.
3. **History**: `pushState` the new URL after each swap; `popstate` →
   fetch+swap again (no pushState on popstate). Back/forward walks filter
   history without reloads.
4. **Scope**: `/list` and `/graph` filter forms (+ the `q` input) only. Doc
   pages carry no form post-design-pass and get no swap marker. The glue
   keys off a server-set opt-in attribute on the form (e.g.
   `data-swap="main"`), never off route sniffing.
5. **Trust boundary (document in an explicit code comment at the swap
   site)**: the glue fetches a same-origin relative URL taken from the form's
   own action; the response is OUR server-rendered sanitized HTML that WE
   generated. Swapping it via `innerHTML` is within the trust boundary —
   this is the documented reasoning. The glue itself never interpolates
   task-derived strings into HTML (any per-node reads go through DOM APIs,
   e.g. `textContent` for `<title>`). This covers only our own SSR output —
   it is NOT a license to relax the wave C `/doc` resolution/sanitization
   rules.
6. **No cookies, no localStorage on this path** — the URL is the only state.
7. **Not htmx**: zero new dependencies; if the glue grows past ~30 lines,
   stop and flag instead of growing a framework.

Known sub-point (executor resolves, documents the choice): controls whose
rendered state depends on the query (active-chip highlight, `aria-pressed` on
submit-button chips) sit outside the swap target and would go stale after a
swap. Cheap fixes: re-sync those attrs from the fetched document's form
before/after the swap, or redesign the chips as stateless submit buttons.
Either is fine; keep the glue tiny; note the choice in the honest tail.

## Checklist

- [ ] Measure FIRST (decision gate): on the homelab corpus (~80 nodes),
      time full reload vs fetch+swap for `/list` and `/graph` (graph is the
      interesting one: elk layout ~87–118ms server-side per wave C
      measurements). Record the numbers in the honest tail. If the
      end-to-end delta is imperceptible (< ~100ms), close the card
      "not needed" citing these numbers — legitimate closure, done here.
      Otherwise proceed.
- [ ] `page()` layout (wave C's `src/render.ts` or wherever it landed):
      `<main>` gets a stable hook (id or data attribute); the filter form
      moves outside `<main>`; forms on `/list` and `/graph` carry the
      `data-swap` opt-in marker; doc route carries neither.
- [ ] Client glue (one small file in `web/`, name executor's call):
      `submit` listener on `form[data-swap]` — `preventDefault`;
      `fetch(action + '?' + new URLSearchParams(new FormData(form,
      event.submitter)))` (submitter so chip-button values ride along);
      on 2xx → parse the response as a document, swap `<main>` from it,
      update `document.title` via `textContent`, `pushState`; on network
      error or non-2xx → `form.submit()` (native, bypasses the listener —
      no recursion). `popstate` → the same swap for `location.href`.
- [ ] Trust-boundary comment at the swap site (explicit reasoning per
      ruling 5).
- [ ] Form-state handling per the sub-point above, documented in code or
      the honest tail.
- [ ] Gates: `bun test` + `bun run check:full` green; probe `--ac` green on
      the fixtures corpus; on the homelab corpus, cross-check that the
      fetched fragment's row/card set equals the server's answer for the
      same URL (`curl` both, diff) — server-side filter evidence.

## Acceptance criteria

- JS on, filters on: changing `q` or status on `/list` and `/graph` updates
  the URL (query params present, pushState) and swaps the content region
  with NO full navigation — a marker set on `window` before the change
  survives it — and the swapped fragment actually filters: its row/card set
  matches the server's response for the same URL.
- JS off: the same forms submit naturally as GET — full page loads, query
  params in the URL, filtered content, everything works as wave C shipped.
- Fetch failure (500 or forced offline in a test): the fallback native
  submit fires — full page loads, filtered; no dead UI, no stuck form.
- Back/forward after several filter changes walks the filter history:
  popstate swaps the content to match the restored URL, still no reloads.
- Doc pages are untouched: no swap marker, no glue behavior on `/doc`;
  `package.json` unchanged (no htmx, no new deps).
- No cookie or localStorage writes happen on the filter path.
- `bun test` green, `bun run check:full` green, probe `--ac` green on the
  fixtures corpus; homelab timing numbers recorded either way (closure
  evidence or enhancement justification).

## Source

- Operator intent 2026-11-19 (card assignment, essence): progressive
  enhancement — htmx-style fragment swap for filters, no full page reload;
  hand-rolled fetch+swap, NOT the htmx dependency; swap target is our
  same-origin server HTML — trust boundary holds, document the reasoning
  explicitly in a code comment; pushState/popstate history; scope = /list
  and /graph filter forms; measurement-first "not needed" closure allowed
  with serve-timing evidence on the homelab corpus.
- Hard edge rationale: [real-routes-kill-hash](./real-routes-kill-hash.md)
  (pending) — wave C creates the SSR pages, the GET filter forms and the
  `page()` layout this glue enhances; before it lands there is no fragment
  to swap and nothing to intercept, hence `blocked-by`, not a soft edge.
- Related (soft): [design-pass-doc-and-theme](./design-pass-doc-and-theme.md)
  — post-wave-C the client JS inventory is "d3-zoom + theme toggle"; this
  glue joins that inventory and must stay as small as the toggle.
