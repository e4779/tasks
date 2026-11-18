---
status: pending
---

# `tskrc` config cascade (INI, per-directory override)

## Objective

Discovery knobs are hardcoded today: `src/discover.ts` owns the pattern
default (`**/{tasks,todos}/**/*.md`) and has no exclusion mechanism at all.
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
  behavior change.

## Interplay (flagged, not silently resolved)

- Same FILE as [exclude-meta-files-from-discovery](./exclude-meta-files-from-discovery.md):
  that card adds a frontmatter gate in `src/discover.ts`; this card adds the
  config layer in the same choke point. Expect merge traffic, no conflict of
  intent: the gate is the structural DEFAULT (format invariant), `exclude`
  is per-corpus opt-in config.
- Same OBSERVABLE: the homelab 80-nodes probe is the AC of both cards —
  whichever lands first makes the other's probe vacuously green. Neither
  gates the other (no `blocked-by`); verify the surviving mechanism on close.

## Source

- Config decision recorded in operator session 2026-11-18 (INI over
  JSON/TOML/YAML: comments, zero deps, gitconfig/editorconfig lineage).
- Code: `src/discover.ts` (glob-only today, pattern default hardcoded),
  `bin/tsk.ts:12` (the `discover(args)` call with no pattern), fixtures
  under `test/fixtures/`.
