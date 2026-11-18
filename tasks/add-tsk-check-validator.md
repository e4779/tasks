---
status: pending
---

# Add `tsk check` — corpus validator

## Objective

The original tsk vision: a validator before a viewer. `bin/tsk.ts` gains
`check [roots...]`: lint a corpus per the format — every prose link and every
`blocked-by` entry resolves to an existing file, statuses are in the known
vocab, h1 present, cycles listed. Exit 0/1. This becomes the lint of the
format (CI-able, pre-commit-able).

## Severity map (the exit 0/1 contract)

- ERROR (exit 1): prose-link target missing on disk; `blocked-by` target
  missing (`graph.ghosts` already computes the latter).
- WARNING (exit 0): unknown status value (`parse.ts` already emits
  `unknown status: …` warnings); cycles (the format tolerates them, the
  viewer paints them as cycle edges — listed, not failed).
- INFO (always logged): missing h1 → filename-fallback title (parse behavior
  already; check logs it).

## Checklist

- [ ] `bin/tsk.ts`: new `check` case — discover + parseFile + buildGraph over
      roots (default `.`); print one line per finding `LEVEL\tpath\tdetail`;
      summary counts; exit 1 iff any ERROR.
- [ ] Prose-link existence: `src/parse.ts` resolves links but
      `src/graph.ts` `buildGraph` silently drops soft links to non-members —
      check must fs-test `link.resolved` existence itself (only hard edges
      surface as ghosts today).
- [ ] Update the usage string; `list|next|graph|parse|serve` untouched.
- [ ] `test/check.test.ts` (or extend `test/cards.test.ts`): run check against
      `test/fixtures/tasks` → exit 1 with the known findings (broken prose
      link from `broken-link.md`, ghost `blocked-by` from `blocked-card.md`,
      cyclic pair listed, `no-h1.md` logged as fallback info).
- [ ] `bun test` + `bun run check:full` green.

## Acceptance criteria

- `bun bin/tsk.ts check test/fixtures/tasks` exits 1; output names the broken
  prose link and the missing blocked-by target; the cyclic pair is listed as a
  cycle warning; `no-h1.md` appears as filename-fallback info.
- Dogfood, repo-wide: `bun bin/tsk.ts check .` — every ERROR finding points
  into `test/fixtures/tasks/` (the deliberately-broken fixtures) and NONE
  into `tasks/` (the real card set is clean).
- Warning-only corpora exit 0: an unknown status alone never fails the run.

## Source

- README.md (the spec-of-a-document vision), operator session this week
  (intent #4).
- Code: `bin/tsk.ts` (command switch), `src/parse.ts` (warnings, links,
  KNOWN_STATUS), `src/graph.ts` (ghosts, cycles), fixtures in
  `test/fixtures/tasks/`.
- Soft edge: check output is only as clean as discovery allows — meta-file
  exclusion is config-owned (`discover` negations, folded into
  [tsk-conf-cascade](./tsk-conf-cascade.md) by ruling «glob, и только glob»).
  Note the root semantics: discovery takes SEARCH roots (the `tasks/` dir must
  live inside them), so `check tasks` sees an empty corpus — a vacuous pass,
  never a gate.
