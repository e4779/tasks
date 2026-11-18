---
status: pending
---

# `tskrc` config cascade (INI, per-directory override)

## Objective

Discovery knobs and status handling are all hardcoded today:
`src/discover.ts` owns the pattern default (`**/{tasks,todos}/**/*.md`) and
has no exclusion mechanism at all; `src/parse.ts` owns the status vocabulary
(`KNOWN_STATUS`) and a single baked-in alias (`completed → done`);
`src/next.ts` owns the terminal set (`!== "done" && !== "cancelled"`).
Introduce `.tskrc` — an INI-format, zero-dependency config that cascades down
the directory chain of each corpus root (editorconfig model):
`~/.tskrc → ~/projects/.tskrc → <corpus>/.tskrc`. A key redefined in a deeper
file overrides; a key absent deeper is inherited from above.

Format decision is RECORDED (operator session 2026-11-18): INI over
JSON/TOML/YAML — supports comments (`#` and `;`), zero deps (hand parser,
~30 lines — no new dependency in `package.json`), and rides the
gitconfig/editorconfig lineage. Do not relitigate in code comments.

v0 keys (closed set, unknown keys warn-and-ignore):

- `discover` — glob pattern; replaces the pattern DEFAULT when the caller
  passed none (an explicit `discover(roots, pattern)` argument still wins —
  tests and CLI overrides are not silently reconfigured).
- `exclude` — comma-separated list of file basenames dropped from discovery
  results (post-glob filter).
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

- Transition graphs / status-lifecycle validation: a stateless file
  scanner cannot validate transitions — previous statuses live only in git
  history. Revisit only as a hypothetical future `tsk check --git`.

## Checklist

- [ ] New `src/config.ts`, pure and fs-thin: `parseIni(text)` (~30 lines:
      `key = value`, `#`/`;` comments, trim, blank-skip, in-file duplicate →
      later wins), `collectRcFiles(root)` (ancestor dirs of the corpus root,
      filesystem root down to the root itself, shallow→deep; `~/.tskrc` and
      `~/projects/.tskrc` are just chain members, not special cases),
      `loadConfig(roots)` → merged plain object.
- [ ] Wire into `src/discover.ts`: per-root resolved config supplies the
      pattern when the param is absent; `exclude` filters basenames after
      the glob, before dedupe/sort. Public signature stays backward
      compatible — with no `.tskrc` anywhere, behavior is byte-identical to
      today (zero-config = zero change).
- [ ] Three-level fixture `test/fixtures/config/l1/l2/l3/` with `.tskrc` at
      each level (fixtures carry md files too where the pattern needs them).
- [ ] `test/config.test.ts`: parseIni edge cases (comments, `;`, spaces,
      duplicate key); cascade proves OVERRIDE (key redefined at l3 → l3
      value) and INHERIT (key only at l1 → present in merged l3 view).
- [ ] Discover integration test: fixture corpus whose `.tskrc` sets a custom
      `discover` pattern (e.g. `**/cards/**/*.md`) and `exclude` — discovered
      set changes accordingly; explicit-pattern call ignores the config key.
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
- `exclude` works on the homelab meta files, live: write
  `~/projects/homelab/.tskrc` with `exclude = AGENTS.md,TASKMD_SPEC.md` →
  `bun bin/tsk.ts graph ~/projects/homelab` yields exactly **80** nodes.
- `discover` pattern override live-probed: serve a fixture corpus whose
  `.tskrc` narrows the pattern, `bun tools/probe.mjs` eval reports the
  custom node set (and zero nodes from the default pattern's extra dirs).
- Zero-config regression: repo's own `bun bin/tsk.ts graph .` unchanged
  (same node count as before this card) — no `.tskrc` in the chain, no
  behavior change. Same for status keys: `next .` output byte-identical
  (defaults reproduce `KNOWN_STATUS` + `completed → done` +
  done/cancelled terminals exactly).
- Status keys live-probed on a fixture corpus whose `.tskrc` sets all three:
  `status.aliases = finished:done` → a `status: finished` card parses as
  `done` (no `unknown status` warning); `statuses` omitting `in-progress` →
  an `in-progress` card warns (and nothing else changes);
  `status.terminals = done` → the card hard-blocked only by a `cancelled`
  card appears in `next` output.

## Interplay (flagged, not silently resolved)

- Same FILE as [exclude-meta-files-from-discovery](./exclude-meta-files-from-discovery.md):
  that card adds a frontmatter gate in `src/discover.ts`; this card adds the
  config layer in the same choke point. Expect merge traffic, no conflict of
  intent: the gate is the structural DEFAULT (format invariant), `exclude`
  is per-corpus opt-in config.
- Same OBSERVABLE: the homelab 80-nodes probe is the AC of both cards —
  whichever lands first makes the other's probe vacuously green. Neither
  gates the other (no `blocked-by`); verify the surviving mechanism on close.
- CONTRADICTION FLAGGED with
  [add-tsk-check-validator](./add-tsk-check-validator.md): its severity map
  lists ghost `blocked-by` as ERROR (exit 1); the session 2026-11-18 ruling
  above makes ghost AND non-task blockers WARNINGS, and adds the
  unblocked-by-cancellation notice — a finding class that card does not
  know yet. That card's severity map needs the same amendment; flagged
  here, not silently resolved.

## Source

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
