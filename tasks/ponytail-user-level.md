---
status: done
---

# Move ponytail-developer to package agents/ (user-level)

> **AMENDED 2026-11-19, operator ruling (overrides scope (a) below):** the
> persona lives DIRECTLY in `~/.pi/agent/agents/worker-ponytail.md`, next to
> `worker.md` — NOT in the tsk package's `agents/` dir. It is operator
> tooling, not tsk cargo: it must survive tsk uninstall and work where tsk
> is not installed. The tsk package ships only the `tsk-workflow` skill
> (see package-publication amendment). Landed accordingly: moved to `~/`,
> package.json carries skills only, smoke delegation passed from the
> user-level location.

## Objective

The ponytail persona stops being a tsk project-local agent and becomes
user-level via the tsk package's `agents/` dir, as `worker`'s sibling
`worker-ponytail` — so the operator can compare both implementer profiles in
any project. The ponytail doctrine itself is NOT vendored: upstream
(DietrichGebert/ponytail, MIT) is REFERENCED, not absorbed. No upstream
content is copied into this repo or this package.

## Scope decisions baked in

- (a) New file `agents/worker-ponytail.md` in the tsk package (agent name
  `worker-ponytail`, descended from `.pi/agents/ponytail-developer.md`),
  slimmed for user-level duty: drop the tsk-locked conventions block
  (project-specific; already lives in tsk cards), keep the ponytail law
  summary, the quality bar (smallest complete change; one test per
  non-trivial logic; `shortcut:` comments; skip/risk footer), and the tool
  allowlist. Keep `acceptanceRole: writer` explicit — pi-subagents requires
  it for writer-acceptance inference on custom profiles (docs/agents.md:264).
- (b) `~/.pi/agent/agents/worker.md` stays UNTOUCHED — shell-taste ritual
  preserved; `worker-ponytail` is its sibling, not its replacement.
- (c) RETIRE `.pi/agents/ponytail-developer.md` only. FLAG: the steering
  shorthand says ".pi/agents/ retires", but that dir also holds
  `task-writer.md` — a tsk-specific override of the generic user-level
  task-writer (verified diff: the project version carries the locked tsk
  format conventions and the hand-written-files contract; the user-level
  version is taskmd-flavored, `taskmd add` CLI, which does not fit tsk).
  This card therefore retires ONLY ponytail-developer.md; `task-writer.md`
  stays project-level pending an explicit operator decision (follow-up card
  if whole-dir retirement is wanted).

## The upstream-skill reference — verify, don't assume

The persona must point at the upstream ponytail skill. FLAG: "already
installed in the pi contour" does not hold today (verified 2026-11-19: no
ponytail in `settings.json` packages; no ponytail skill in any discovery
root — `~/.pi/agent/skills/`, `~/.agents/skills/`). Only the librarian
checkout exists (`~/.cache/checkouts/github.com/DietrichGebert/ponytail/`,
referenced by absolute path in today's persona). Candidate references:

1. Skill by name (`ponytail`) — default plan; requires installing the
   upstream package: `pi install git:git@github.com/DietrichGebert/ponytail`
   (upstream `package.json` already declares `pi.skills: ["./skills"]` —
   verified; ships `skills/ponytail/SKILL.md`, MIT).
2. The checkout absolute path — works on hlab today, machine-specific.

Executor verifies in a fresh session which reference resolves; plan is (1)
with (2) as documented fallback. If the operator prefers no upstream
install, drop that step and amend the skill-surfacing AC to the
checkout-path reference.

## Checklist

- [ ] Install upstream per default plan: `pi install
      git:git@github.com/DietrichGebert/ponytail`; fresh session sees the
      `ponytail` skill (verify its discovery scope is user-level).
- [ ] Write `agents/worker-ponytail.md` per Scope (a); the ponytail
      reference inside it is the one verified to resolve.
- [ ] Wire the tsk package: with it installed — git channel per
      [package-publication](./package-publication.md), or `pi install ./`
      (local path) if that card has not landed yet — a fresh pi session
      anywhere lists `worker` and `worker-ponytail` among subagents
      (`subagent({action:"list"})` or the picker) and `ponytail` among
      skills.
- [ ] Delete `.pi/agents/ponytail-developer.md` (the persona's new home is
      the package). `.pi/agents/task-writer.md` untouched.
- [ ] Confirm nothing was absorbed: no `skills/ponytail/` in this repo, no
      doctrine text vendored (spot-check `git grep -ri ponytail`).

## Acceptance criteria

- A fresh pi session OUTSIDE the tsk repo sees both `worker` and
  `worker-ponytail` personas and the `ponytail` skill, and the ponytail
  reference inside `worker-ponytail.md` resolves there (skill name per the
  default plan, or the documented checkout-path fallback).
- `agents/worker-ponytail.md` declares `acceptanceRole: writer`, contains no
  tsk-locked conventions block, and no upstream doctrine text is vendored
  into this repo.
- `.pi/agents/ponytail-developer.md` is gone; `.pi/agents/task-writer.md`
  remains; `~/.pi/agent/agents/worker.md` is byte-identical to its pre-task
  state.
- The persona actually RUNS: one smoke delegation
  (`subagent({agent:"worker-ponytail", task:"<trivial>"})`) answers in
  ponytail voice and ends with the skip/risk footer.

## Source

- Operator session 2026-11-19 + steering correction: reference upstream,
  do not vendor; worker/worker-ponytail comparison pair at user level.
- `.pi/agents/ponytail-developer.md` (persona being moved);
  `~/.pi/agent/agents/worker.md` (untouched sibling).
- Upstream checkout: `~/.cache/checkouts/github.com/DietrichGebert/ponytail/`
  (`package.json` `pi` section, `skills/ponytail/SKILL.md`, LICENSE: MIT).
- pi-subagents: `docs/agents.md` (discovery scopes, lines 21–33;
  acceptanceRole note, line 264); `src/agents/agents.js:272–283` (package
  agent manifest keys).
- Soft edge: package structure (`pi.subagents.agents`, install route) comes
  from [package-publication](./package-publication.md) — assumed, not gated;
  `blocked-by` stays empty (local `pi install ./` decouples verification).
