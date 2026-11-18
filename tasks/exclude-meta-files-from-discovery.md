---
status: pending
---

# Exclude meta files from task discovery

## Objective

`src/discover.ts` returns every `.md` under `**/{tasks,todos}/**` — on the real
homelab corpus that includes two taskmd-era meta documents that are not cards:
`tasks/AGENTS.md` and `tasks/TASKMD_SPEC.md` (82 discovered files where 80 are
real cards). Discovery defines corpus membership (path = identity), so the
filter belongs in `src/discover.ts` itself — one choke point covers all three
consumers: `bin/tsk.ts` `corpus()` and both `src/serve.ts` endpoints
(`src/serve.ts:72`, `src/serve.ts:82`).

## Convention decision (documented, not silent)

**Frontmatter gate beats filename blacklist.** A file under a `tasks/`/`todos/`
dir is a card iff it has a YAML frontmatter block.

- Verified live: both meta files carry NO frontmatter (each starts with a
  `# H1` prose line) — the gate excludes exactly them, no names hardcoded.
- tsk format mandates frontmatter on every card (`status` at minimum), so
  "frontmatter present" is a structural invariant of the format itself.
- A blacklist (`AGENTS.md`, `TASKMD_SPEC.md`, `README.md`, …) is unbounded —
  every future meta artifact re-dirties the corpus; the gate is self-maintaining.
- All 7 fixtures in `test/fixtures/tasks/` already carry frontmatter → zero
  fixture churn, existing tests stay green.

## Checklist

- [ ] In `src/discover.ts`: after the glob, keep only files whose head parses
      as having a frontmatter block (reuse `gray-matter`, or sniff the leading
      `---` pair — smallest diff wins; it must NOT require valid/known attrs).
- [ ] Public signature unchanged (`roots`, `pattern` defaults); dedupe + sort
      behavior unchanged.
- [ ] Fixture dir must match the discovery pattern — e.g.
      `test/fixtures/discovery/tasks/` with one frontmatter card + one bare-H1
      doc + one black-list-looking file with frontmatter (kept).
- [ ] Unit test (extend `test/parse.test.ts` or new `test/discover.test.ts`):
      only the frontmatter files are discovered.
- [ ] `bun test` + `bun run check:full` green.

## Acceptance criteria

- `bun bin/tsk.ts graph ~/projects/homelab` yields exactly **80** nodes; no
  node path ends with `AGENTS.md` or `TASKMD_SPEC.md`.
- Probe on the real corpus stays green on real-data facts: serve homelab
  (`bun bin/tsk.ts serve ~/projects/homelab`) then
  `bun tools/probe.mjs 'http://127.0.0.1:8931/'` → exit 0 (readyState complete,
  zero console errors/exceptions) and the eval payload reports `nodes: 80`.
  The `--ac` overlap gate may still fail from the edgeless-layout wall — that
  is tracked in [rectpack-edgeless-corpora](./rectpack-edgeless-corpora.md)
  and does NOT gate this card.

## Source

- Operator session this week: homelab probe run showed 82 nodes where 80 cards
  are real.
- Live probes: `bun -e 'discover(["/home/e4779/projects/homelab"])'` → 82 files
  incl. both meta files; `head -1` of both meta files → bare `# H1`, no `---`.
- Code: `src/discover.ts` (glob-only today), `src/serve.ts`, `bin/tsk.ts`.
