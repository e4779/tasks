---
name: tsk-workflow
description: "Work loop for tsk: markdown-file-per-task discipline plus the list/next/graph/check CLI. Use when picking up, planning, or verifying work tracked in tasks/ or todos/ cards."
---

# tsk workflow

A document IS a task: plain markdown under `**/{tasks,todos}/**/*.md`; nothing else
exists. Run the CLI from the tsk checkout (`bun bin/tsk.ts …`).

## Model (fixed — do not re-decide)

- Path = identity: no id fields, no renames; `tasks/` is append-only.
- Frontmatter = pure attributes. Lifecycle is `status` only:
  `pending | in-progress | done | cancelled`. `blocked` is derived from the graph,
  never written.
- Edges are layered and additive: prose md-links = soft (related); frontmatter
  `blocked-by: []` = hard. They accumulate, never conflict-check.
- Decisions/resolutions = free text in the body. All views are derived on every run,
  never stored.

## Loop

```sh
bun bin/tsk.ts list    # every card: path(status), title
bun bin/tsk.ts next    # actionable now (graph + terminals)
bun bin/tsk.ts graph   # full dependency graph as JSON
bun bin/tsk.ts check   # gate: any ERROR = exit 1
```

- Pick up: `next`, set `status: in-progress` in frontmatter.
- Finish: do the work, set `status: done`, record the resolution as body text. Never
  delete or archive cards.
- Before reporting done: `check` exits 0. ERROR is a hard stop; WARN/INFO are
  judgement calls.
- Every command accepts roots: `bun bin/tsk.ts check tasks/`.
