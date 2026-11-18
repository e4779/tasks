---
status: pending
---

# Decide: adapter or one-time migration for taskmd dependencies

## Objective — DECISION FIRST

homelab cards encode dependencies in taskmd style: frontmatter
`dependencies: ["002"]` referencing sibling `id:` values. tsk's edge model
(soft = prose md-links, hard = `blocked-by` paths) sees none of them → homelab
renders as an edgeless graph and `tsk next` misses blockers. Two paths exist;
the operator (corpus owner) picks. This card is the decision packet — **no
code under this card** until the decision is recorded.

## Option A — adapter (map numeric id → sibling card path at parse time)

Build an `id → path` table from the corpus itself (id lives in frontmatter,
filename carries the slug); surface `dependencies` as hard edges in
`src/graph.ts`.

- Pro: corpus untouched; reversible; any future taskmd corpus just works.
- Con: permanent legacy-compat surface in core (parse/graph, and any future
  `tsk check` must validate it); the normalizer must handle BOTH dep shapes
  already in the wild (verified: `["002"]` and `["hmlb002"]` coexist);
  "path is identity" grows a shadow id-keyed alias.

## Option B — one-time migration (rewrite the corpus to tsk conventions)

Rewrite once: `dependencies: ["hmlb002"]` → `blocked-by:
[./hmlb002-keenetic-prune-port-forwards.md]` (the rewrite needs the same
`id → path` table anyway), normalize the remaining taskmd attrs
(`id`, `title`, `effort`, `type`, `tags`, …) per the tsk format.

- Pro: format purity; zero compat code forever; downstream tools (check,
  viewer, next) work unmodified.
- Con: touches ~66 files in a corpus that was migrated TO taskmd about a week
  ago — a second rewrite within the week (churn, muscle memory, any external
  taskmd tooling pointed at that corpus breaks); history noise in git.

## Evidence (verified on the live corpus, 2026-11 week)

- `~/projects/homelab/tasks/`: 67 files, 66 carry taskmd `id:` frontmatter.
- Dep shapes in the wild: `dependencies: ["002"]`, `["012", "013"]`,
  `["hmlb002", "hmlb054"]` — bare numeric AND `hmlb`-prefixed forms coexist;
  any adapter or migration script must normalize both.
- Effect today: homelab graph = 0 edges (probe eval `links: 0`) — the direct
  cause of the edgeless-wall failure tracked by `rectpack-edgeless-corpora.md`
  (sibling card; one-directional mention, no back-link → no soft cycle).

## Escalation (explicit — operator decision)

GO/NO-GO is escalated to the operator via the supervisor. This card does NOT
close on verifier output. Close = decision recorded below + the follow-up
implementation card written and linked.

- Decision (recorded on close): ______
- Follow-up card: ______ (adapter: extend hard-edge extraction in
  `src/graph.ts`; migration: one-shot rewrite script + corpus run + AGENTS.md
  update in the homelab repo)

## Acceptance criteria

- Both options are stated with live-corpus evidence (this body) — the packet
  is complete enough to decide from without re-probing.
- The operator decision is recorded verbatim in this file on close, together
  with the follow-up card path.
- No code merged under this card.

## Source

- Operator session this week (intent #3: "DECISION task first … do not pick
  silently").
- Edge model: `src/graph.ts` (`hardTargets` — blocked-by only), `src/parse.ts`
  (frontmatter via gray-matter; `dependencies` currently lands in untyped
  `attrs`).
- Live corpus probes: grep over `~/projects/homelab/tasks/*.md` for
  `id:` / `dependencies:` shapes.
