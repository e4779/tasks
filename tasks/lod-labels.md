---
status: pending
---

# LOD labels — card text fades at far zoom

## Objective (operator, 2026-11-20)

Canonical large-graph behavior: at fit-view zoom on a big corpus the
card text is sub-readable noise (80 cards = 80 grey smears). Fade card
<text> opacity as the zoom scale drops below a readability threshold;
restore on zoom-in. Boxes/edges stay — structure reads, labels appear
when they become readable.

## Design (baked)

- Hook the existing d3-zoom handler (web/main.js bindZoom): on zoom
  event, compute k = transform.k; svg text opacity =
  clamp((k − 0.45) / 0.2, 0, 1) — fade band 0.45..0.65 (tune on
  homelab fit view; 80-card corpus is the tuning target).
- CSS transition (opacity .2s) so zooming feels smooth; no per-text
  js churn beyond one attribute on the svg root (e.g. data-lod="0..1"
  + css `svg[data-lod] text { opacity: ... }` — pick the cheapest).
- Legend and marginnote are NOT affected (they're html, outside the
  zoomed svg).

## Checklist

- [ ] Opacity driven by zoom scale in bindZoom
- [ ] Tune fade band on homelab fit view (80 cards)
- [ ] Both themes; legend unaffected
- [ ] Visual: homelab fit view (labels faded), zoom-in twice (labels
      back), zoom-out (faded again)

## Acceptance criteria

- Machine: data-lod / text opacity changes as scale crosses the band
  (probe via tools or CDP eval)
- Visual: fit view readable structure without text noise; labels
  return on zoom-in; both themes
- bun test green, check:full PASS
- Local only: no tag, no npm publish

## Source

- Operator 2026-11-20 «что ещё каноничного взять» — LOD labels,
  canonical big-graph behavior.
