---
status: pending
---

# Focus mode — click a card, its neighborhood lights up

## Objective (operator, 2026-11-20)

Canonical graph-explorer interaction: click a card → that card, its
direct edges (both directions) and 1-hop neighbor cards highlight;
everything else dims (opacity ~0.15). Click elsewhere / same card /
Esc → unfocus. Pure client-side: nodes already carry data-path, edges
carry data-from/data-to in the SVG.

## Design (baked)

- Click handler on the /graph svg: toggle `data-focus="path"` on the svg
  root; css attribute selectors drive all styling — no per-element class
  churn.
- Highlight set: focused card (accent outline, e.g. 2px --accent),
  edges with data-from or data-to == focus (full opacity), neighbor
  cards (the other end of those edges, normal opacity). Everything
  else: opacity 0.15 (cards + edges).
- Escape and background click clear focus. Clicking another card
  re-focuses. d3-zoom (pan/wheel) must NOT trigger focus changes —
  distinguish drag/wheel from click (movement threshold or
  zoom-started flag).
- Both themes verified.

## Checklist

- [ ] svg data-focus toggle + Esc/background/esc handling
- [ ] css: dimmed vs highlighted selectors, both themes
- [ ] d3-zoom vs click disambiguation (wheel/drag never toggles focus)
- [ ] Visual: pi-etc — focus on a fan-parent (26 children) shows one
      lit card + lit legs; homelab — focus on thm012 shows 5 inbound
      stems; both themes; unfocus restores

## Acceptance criteria

- Machine: data-focus present/absent on simulated clicks (probe)
- Visual both themes: neighborhood lit, rest dimmed, unfocus restores
- bun test green, check:full PASS
- Local only: no tag, no npm publish

## Source

- Operator 2026-11-20 «что ещё каноничного взять» — focus+dimming,
  canonical big-graph-viewer interaction.
