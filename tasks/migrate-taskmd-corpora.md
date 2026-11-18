---
status: pending
---

# Migrate taskmd corpora to tsk (one-time conversion)

## Objective

One-time rewrite of the two live taskmd corpora to tsk conventions:
`~/projects/homelab` (65 hmlb cards in `tasks/` + 15 thm cards in
`therm/tasks/`) and `~/projects/bcachefs-freebsd` (40 bcf cards in
`tasks/`) — 120 cards total. Ruling recorded in
[decide-taskmd-deps-adapter-or-migration](./decide-taskmd-deps-adapter-or-migration.md)
(operator 2026-11-19: MIGRATION; adapter rejected as a permanent
compatibility tax against format-is-the-interface). This card converts
files INSIDE foreign repos: it ends at a converted working tree + green
checks; commits in homelab / bcachefs-freebsd are SEPARATE operator words.

## Conversion mapping (baked spec — verified against live files 2026-11-19)

Live frontmatter key inventory across the 120 cards: `title`, `status`,
`id`, `tags`, `priority`, `created_at`, `type`, `effort`, `context`,
`touches`, `dependencies`, `completed_at`, `cancelled_at`, `parent`,
`verify`. Key-by-key:

- `dependencies: [ids]` → `blocked-by: [relative paths]`. Build an
  id → path table per corpus from the discovered cards' own `id:` fields.
  Integrity binding: id ↔ filename stem (`hmlb002` lives in
  `hmlb002-*.md`). The meta files `tasks/AGENTS.md` and
  `tasks/TASKMD_SPEC.md` in BOTH repos carry stray template ids (live
  probe: duplicate `hmlb001` and `bcf001`) — they are not cards and MUST
  NOT enter the table; duplicate id among real cards = hard error, both
  paths printed. Bare numeric refs (`["002"]`, `["012", "013"]`) are
  same-corpus shorthand — resolve by id-suffix match (`hmlb002`,
  `bcf013`). Both quoted and bare YAML scalar forms exist in the wild.
  All live refs resolve (probe 2026-11-19: 25 hmlb + 11 thm + 35 bcf
  refs, zero unresolved). Path form: `./<file>` relative to the
  referencing card — every live dep is same-directory; no cross-dir case
  exists today. Empty `dependencies: []` (51 cards live) → drop the key.
- `id:` → dropped. Path is identity.
- `title` → consumed by the h1 guarantee: card already has h1 → h1 WINS,
  frontmatter `title` dropped (all 120 live cards have h1; in 17 of them
  title ≠ h1 — the title variant is usually longer; discarded text stays
  recoverable in the corpus repos' git history). Card without h1 (no
  live case): materialize `# ` from title, else from filename.
- `status` map: `pending`→`pending`, `in-progress`→`in-progress`,
  `completed`→`done`, `cancelled`→`cancelled`; `blocked` (9 cards live)
  → STRIPPED, base status becomes `pending` — blocked is derived in tsk
  from edges and is never written. Card-level census (probe 2026-11-19):
  completed 48, cancelled 22, blocked 9, pending 38, in-progress 3.
- KEEP as free fields, value-untouched: `tags`, `effort`, `priority`,
  `created_at`, `completed_at`, `cancelled_at`, `type`, `context`,
  `touches`, `verify`. (`priority` stays as data — tsk ignores it,
  demoted 2026-11-18.)
- DROP as taskmd machinery: `group`, `phase` — ABSENT in all live corpora
  (verified); the drop rule exists only in case one surfaces mid-run.
- `parent: <id>` (22 cards live: 8 hmlb + 14 thm, e.g. `parent: "thm001"`)
  — FLAGGED AMENDMENT, discovered by live probe after the mapping was
  ruled: keep the key as a free field but REWRITE the value from id to
  the resolved relative path (`parent: ./thm001-therm-umbrella.md`) —
  once `id:` is gone, a bare id value would dangle forever. No edge
  semantics attached in v0.

Body: UNTOUCHED wherever h1 is present (all 120 live cards) — the
rewrite touches frontmatter only; corpus-repo git diffs must show zero
body changes.

## Tool shape

Preferred: `tsk migrate-taskmd` subcommand (new case in `bin/tsk.ts` +
`src/migrate.ts`) — takes corpus roots, runs normal discovery (so
`.tsk.conf` negations apply), rewrites in place, prints a per-corpus
summary (files rewritten, blocked-by edges written, keys dropped,
titles discarded). Idempotent by construction: over an already-converted
corpus there are no `id:` keys left to resolve → second run = zero diff.
Executor's call to fall back to a one-off script under `tools/` if
subcommand plumbing fights back — the mapping above is the contract,
the vehicle is not.

## Checklist

- [ ] id→path table builder: discovered cards only (meta excluded),
      filename-stem binding as integrity check, duplicate id = hard
      error printing both paths.
- [ ] Rewrite pass per the mapping; frontmatter serialization
      round-trips (gray-matter stringify or equivalent — quoting of
      scalar values may normalize, semantics must not change); body
      bytes untouched.
- [ ] Fixture corpus `test/fixtures/taskmd/` (with `tasks/` inside, per
      the discovery pattern) covering: quoted + bare deps, bare-numeric
      shorthand, multi-dep, empty deps, `status: blocked`, `completed`,
      title ≠ h1, `parent` key, one card without h1.
- [ ] Idempotency test: migrate fixture corpus twice → second run
      produces zero changes.
- [ ] Live runs: `tsk migrate-taskmd ~/projects/homelab` (covers hmlb +
  therm) and `tsk migrate-taskmd ~/projects/bcachefs-freebsd`. NO
      commits in those repos — conversion lands in their working trees.

## Acceptance criteria

- Corpus purity: across all 120 converted cards — zero `id:` keys, zero
  `dependencies:` keys, zero `status: blocked` (grep over the discovered
  corpus; meta files are negated out and NOT rewritten by this card).
- Edges resolved: `tsk graph ~/projects/homelab` links 0 → ≥ 36
  (25 hmlb + 11 thm refs); `tsk graph ~/projects/bcachefs-freebsd`
  links ≥ 35; zero ghost blockers (every blocked-by target discovered).
- Corpus shape unchanged: node counts identical before/after (homelab
  82 raw / 80 with negations; bcf 42 raw / 40) — migration neither adds
  nor removes corpus members.
- No card loses h1: h1 count before == after (120 == 120); diffs in the
  corpus repos touch frontmatter blocks only.
- Validation: `tsk check` green on both corpora once
  [add-tsk-check-validator](./add-tsk-check-validator.md) lands — until
  then: parse round-trip over all 120 (`tsk parse` clean, no
  unknown-status warnings) + manual spot-check of 3 cards (one hmlb
  with deps, one thm with `parent`, one bcf with bare-numeric dep)
  confirming blocked-by paths point at existing files.
- Idempotency: rerun `tsk migrate-taskmd` on both live corpora →
  zero changes.

## Interplay (flagged, not silently resolved)

- NOT blocked by [tsk-conf-cascade](./tsk-conf-cascade.md) (operator
  ruling: independent). The 80-node phrasing assumes homelab's
  `.tsk.conf` negations; raw counts (82/42) work equally — the
  conversion itself needs no config machinery.
- Two deviations from the originally ruled mapping, both discovered in
  live probes and left visible above: the `parent` id→path amendment,
  and the 17 title≠h1 discards (h1 wins, titles recoverable from corpus
  git history). Operator may veto either on review.
- Out of scope, flagged at close: stale taskmd docs in the corpus repos
  (`tasks/AGENTS.md`, `tasks/TASKMD_SPEC.md`, repo-level AGENTS.md
  sections) — edits only on the operator's request; commits in those
  repos likewise.

## Source

- Ruling: [decide-taskmd-deps-adapter-or-migration](./decide-taskmd-deps-adapter-or-migration.md)
  (closed 2026-11-19 — MIGRATION, follow-up card declared there).
- Live probes 2026-11-19 (baked into the mapping): key inventory over
  120 cards; dep shapes `[hmlb005]`, `["002"]`, `["012", "013"]`,
  `["thm014", "thm012"]`, `["bcf020", "bcf026", "bcf017"]`; ref counts
  25/11/35, all resolving; status census 48/22/9/38/3; 17 title≠h1;
  22 `parent` keys; meta files carrying stray `hmlb001`/`bcf001`.
- tsk conventions: `src/parse.ts` (frontmatter via gray-matter),
  `src/graph.ts` (`hardTargets` — blocked-by paths only),
  `bin/tsk.ts` (command switch), discovery pattern
  `**/{tasks,todos}/**/*.md`.
