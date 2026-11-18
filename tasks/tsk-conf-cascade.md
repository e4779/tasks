---
status: pending
---

# `.tsk.conf` config cascade (INI, per-directory override)

## Objective

Discovery knobs and status handling are all hardcoded today:
`src/discover.ts` owns the pattern default (`**/{tasks,todos}/**/*.md`) and
has no exclusion mechanism at all; `src/parse.ts` owns the status vocabulary
(`KNOWN_STATUS`) and a single baked-in alias (`completed → done`);
`src/next.ts` owns the terminal set (`!== "done" && !== "cancelled"`).
Introduce `.tsk.conf` — an INI-format, zero-dependency config that cascades down
the directory chain of each corpus root (editorconfig model):
`~/.tsk.conf → ~/projects/.tsk.conf → <corpus>/.tsk.conf`. A key redefined in a deeper
file overrides; a key absent deeper is inherited from above.

Format decision is RECORDED (operator session 2026-11-18): INI over
JSON/TOML/YAML — supports comments (`#` and `;`), zero deps (hand parser,
~30 lines — no new dependency in `package.json`), and rides the
gitconfig/editorconfig lineage. Do not relitigate in code comments.

v0 keys (closed set, unknown keys warn-and-ignore):

- `discover` — comma-separated LIST of glob patterns, micromatch negations
  allowed. Canonical example (also the homelab fix):
  `discover = **/{tasks,todos}/**/*.md, !**/{tasks,todos}/AGENTS.md, !**/{tasks,todos}/README.md, !**/{tasks,todos}/TASKMD_SPEC.md`.
  Discover accepts the whole list; `!`-negations subtract from the positive
  matches (in-order micromatch semantics — `tinyglobby` `glob()` already
  takes a patterns array, negations included; no separate `ignore` wiring).
  The list replaces the pattern DEFAULT when the caller passed none (an
  explicit `discover(roots, pattern)` argument still wins — tests and CLI
  overrides are not silently reconfigured).
  NOTE the parsing trap: glob patterns contain commas of their own inside
  braces (`{tasks,todos}`), so the INI value must be split on commas at
  brace depth zero, with per-piece trim — a naive split shreds the default
  pattern itself.
- `statuses` — comma list; the soft-validation vocabulary for `status`
  frontmatter values (today hardcoded as `KNOWN_STATUS` in `src/parse.ts`).
  An unknown status stays SOFT: parse never fails on it, `tsk check`
  reports it as a warning only.
- `status.terminals` — comma list; statuses that count as finished. One
  source of truth driving derived blocked, the `next` filter, and
  list/graph dimming. Default `done,cancelled` (today hardcoded in
  `src/next.ts` `hardBlocked`).
- `status.aliases` — comma list of `from:to` pairs applied at parse time,
  e.g. `completed:done`. That pair is also the only DEFAULT alias — it
  replaces the hardcoded ternary in `src/parse.ts`.

## Discovery membership: glob, and only glob (folded card)

Fold of `exclude-meta-files-from-discovery.md` (file deleted; content lives
here) per operator ruling «glob, и только glob». The evidence that motivated
the fold: on the real homelab corpus `discover` returns **82** files where
**80** are real cards — `tasks/AGENTS.md` and `tasks/TASKMD_SPEC.md` are
taskmd-era meta artifacts, not cards (live probes: full discover listing +
`head -1` of both → bare `# H1`, no frontmatter). Discovery defines corpus
membership, and the fix sits at the one choke point `src/discover.ts` —
which covers all three consumers: `bin/tsk.ts` `corpus()` and both
`src/serve.ts` endpoints (`src/serve.ts:72`, `src/serve.ts:82`).

Ruling consequences (recorded, don't relitigate):

- ONE mechanism. The `exclude` key (basename blacklist, post-glob filter) is
  REMOVED from the v0 spec — a second filtering language for the same job;
  negations inside `discover` cover it.
- OUR conventions never place `AGENTS.md` inside `tasks/` — the default
  pattern stays clean, and homelab carries its negations in its own
  `~/projects/homelab/.tsk.conf` (the cascade doing its job).
- Honest cost: negation is filename-based, not content-based. A `notes.md`
  dropped into `tasks/` IS a card by the standard — move it or negate it.

## Blocked semantics (normative ruling, session 2026-11-18)

**blocked = ∃ blocked-by (hard) edge whose target's status ∉
`status.terminals`.** Nothing else blocks. Ghost and non-task targets carry
no status, hence ∉ terminals — they DO block (a ghost blocks forever);
this is exactly what `src/next.ts` `hardBlocked` does today ("ghosts
included").

Three edge cases are OWNED BY `tsk check` as WARNINGS — never errors, and
never part of the blocked derivation itself (the derivation stays pure:
status ∉ terminals):

- ghost blocker — `blocked-by` target missing on disk: blocks forever;
  warn so the forever-block is visible, not silent.
- non-task blocker — target file exists but lives outside the corpus
  (not discovered): warn `blocker is not a task`.
- unblocked-by-cancellation — a task whose only hard blocker reached a
  terminal status via cancellation: optional soft notice (INFO-grade hint
  to re-review), NOT a status change and not an error.

## Ruled out (recorded, don't relitigate)

- Frontmatter gate for discovery (file under `tasks/` counts as a card only
  if it carries YAML frontmatter): REJECTED by «glob, и только glob» —
  contradicts the standard, where frontmatter is OPTIONAL (corpus research
  into taskmd and the file+frontmatter landscape). Membership is decided by
  PATH, and glob is the language of paths; a content sniff would make a
  path question read file heads.
- `exclude` config key: folded away into `discover` negations — one
  mechanism, not two filter languages. Was briefly specced in the v0 key
  list; removed before any implementation landed.
- Transition graphs / status-lifecycle validation: a stateless file
  scanner cannot validate transitions — previous statuses live only in git
  history. Revisit only as a hypothetical future `tsk check --git`.

## Checklist

- [ ] New `src/config.ts`, pure and fs-thin: `parseIni(text)` (~30 lines:
      `key = value`, `#`/`;` comments, trim, blank-skip, in-file duplicate →
      later wins), `collectRcFiles(root)` (ancestor dirs of the corpus root,
      filesystem root down to the root itself, shallow→deep; `~/.tsk.conf` and
      `~/projects/.tsk.conf` are just chain members, not special cases),
      `loadConfig(roots)` → merged plain object.
- [ ] Wire into `src/discover.ts`: per-root resolved config supplies the
      pattern LIST when the param is absent. Parse the INI value with a
      brace-aware comma split (depth-zero commas only, trim each piece):
      `**/{tasks,todos}/**/*.md, !**/{tasks,todos}/AGENTS.md` is TWO
      patterns, not four. Hand the array to `glob()` unchanged — tinyglobby
      applies `!` negations itself. No `exclude` code path (key is gone).
      Public signature stays backward compatible — with no `.tsk.conf`
      anywhere, behavior is byte-identical to today (zero-config = zero
      change).
- [ ] Three-level fixture `test/fixtures/config/l1/l2/l3/` with `.tsk.conf` at
      each level (fixtures carry md files too where the pattern needs them).
- [ ] `test/config.test.ts`: parseIni edge cases (comments, `;`, spaces,
      duplicate key) + discover-LIST semantics (brace-aware split — the
      default pattern's `{tasks,todos}` commas survive: two patterns, not
      four; per-piece trim after a comma+space; negation subtraction order:
      positive match minus later `!` pattern); cascade proves OVERRIDE
      (key redefined at l3 → l3 value) and INHERIT (key only at l1 →
      present in merged l3 view).
- [ ] Discover integration test: fixture corpus whose `.tsk.conf` sets a
      custom `discover` list — positive pattern plus a negation, e.g.
      `discover = **/cards/**/*.md, !**/cards/AGENTS.md` — discovered set
      contains the positives, excludes the negated file; explicit-pattern
      call ignores the config key entirely.
- [ ] `statuses` + `status.aliases` wiring in `src/parse.ts`: `KNOWN_STATUS`
      becomes config-supplied (default `pending,in-progress,done,cancelled`);
      aliases apply at parse time BEFORE validation, replacing the hardcoded
      `completed → done` ternary. Zero-config must be byte-identical to today
      (a `completed` card still normalizes to `done`; an unknown status still
      yields the same `unknown status:` warning).
- [ ] `status.terminals` wiring in `src/next.ts`: `hardBlocked`/`nextUp` read
      the config terminals (default `done,cancelled`) instead of the two
      hardcoded comparisons; any consumer branching on terminal statuses
      (the `next` filter today, list/graph dimming when it lands) reads this
      one source — no second hardcoded copy anywhere.
- [ ] Status-key tests extend `test/config.test.ts` + fixtures: alias mapped
      at parse, unknown status stays warning-only, and a discriminating
      terminals case (`status.terminals = done` → a card hard-blocked only by
      a `cancelled` card becomes `next`-eligible).
- [ ] `bun test` + `bun run check:full` green.

## Acceptance criteria

- Three-level fixture test (unit): override AND inherit both proven — the
  cascade is not "deepest file wins wholesale", it is per-key.
- Negations work on the homelab meta files, live: write
  `~/projects/homelab/.tsk.conf` with
  `discover = **/{tasks,todos}/**/*.md, !**/{tasks,todos}/AGENTS.md, !**/{tasks,todos}/TASKMD_SPEC.md` →
  `bun bin/tsk.ts graph ~/projects/homelab` yields exactly **80** nodes; no
  node path ends with `AGENTS.md` or `TASKMD_SPEC.md`. (If the serve/probe
  variant of this check ever runs: the `--ac` overlap gate may still fail
  from the edgeless-layout wall — tracked in
  [rectpack-edgeless-corpora](./rectpack-edgeless-corpora.md), does NOT gate
  this card.)
- `discover` override live-probed: serve a fixture corpus whose `.tsk.conf`
  narrows the pattern list, `bun tools/probe.mjs` eval reports the custom
  node set (and zero nodes from the default pattern's extra dirs).
- Zero-config regression: repo's own `bun bin/tsk.ts graph .` unchanged
  (same node count as before this card) — no `.tsk.conf` in the chain, no
  behavior change. Same for status keys: `next .` output byte-identical
  (defaults reproduce `KNOWN_STATUS` + `completed → done` +
  done/cancelled terminals exactly).
- Status keys live-probed on a fixture corpus whose `.tsk.conf` sets all three:
  `status.aliases = finished:done` → a `status: finished` card parses as
  `done` (no `unknown status` warning); `statuses` omitting `in-progress` →
  an `in-progress` card warns (and nothing else changes);
  `status.terminals = done` → the card hard-blocked only by a `cancelled`
  card appears in `next` output.

## Interplay (flagged, not silently resolved)

- Folded: `exclude-meta-files-from-discovery.md` used to be a separate card
  sharing this choke point (`src/discover.ts`) and this observable (the
  homelab 80-nodes probe). Ruling «glob, и только glob» merged its subject
  into the `discover` key; the file is deleted, its evidence lives in the
  Discovery-membership section above, and the 80-nodes probe is now solely
  THIS card's AC. No merge traffic left to expect.
- CONTRADICTION FLAGGED with
  [add-tsk-check-validator](./add-tsk-check-validator.md): its severity map
  lists ghost `blocked-by` as ERROR (exit 1); the session 2026-11-18 ruling
  above makes ghost AND non-task blockers WARNINGS, and adds the
  unblocked-by-cancellation notice — a finding class that card does not
  know yet. That card's severity map needs the same amendment; flagged
  here, not silently resolved.

## Source

- Fold + ruling «glob, и только glob» (operator session 2026-11-18):
  `discover` becomes a comma-separated pattern list with micromatch
  negations; the `exclude` key is removed from v0; the frontmatter-gate
  idea is rejected (see Ruled out). Card `exclude-meta-files-from-discovery.md`
  deleted — folded here; its live-probe evidence (82 files incl. both meta
  files; both meta files start with a bare `# H1`) is baked into the
  Discovery-membership section.
- Config decision recorded in operator session 2026-11-18 (INI over
  JSON/TOML/YAML: comments, zero deps, gitconfig/editorconfig lineage).
- Status-key set + blocked-semantics ruling recorded in operator session
  2026-11-18 (`statuses`/`status.terminals`/`status.aliases`; warn-only edge
  cases owned by `tsk check`; transition graphs ruled out).
- Code: `src/discover.ts` (glob-only today, pattern default hardcoded),
  `bin/tsk.ts:12` (the `discover(args)` call with no pattern), fixtures
  under `test/fixtures/`.
- Code (status keys): `src/parse.ts` (`KNOWN_STATUS`, the `completed`
  ternary, `unknown status` warnings), `src/next.ts` (`hardBlocked` with
  hardcoded terminals, "ghosts included").
