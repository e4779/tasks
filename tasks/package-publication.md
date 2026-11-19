---
status: pending
---

# Publish the tsk package — git-only now, npm later

## Objective — DECISION FIRST

Operator decision, recorded here with a default answer to confirm or
overturn: **git-only NOW**. npm publishing is deferred behind a follow-up
card and happens only if sharing beyond the operator's own machines ever
matters. This card also lands the packaging minimum that makes the chosen
channel real: `package.json` gains a `pi` section and the tsk-workflow skill
exists.

## Options (evidence attached)

- (a) GIT-ONLY now — RECOMMENDED default. `pi install
  git:git@github.com:e4779/tasks` (origin is `git@github.com:e4779/tasks.git`;
  ssh auth to github.com and gitverse.ru both verified on hlab 2026-11-19).
  Zero publish ceremony; works for personal machines + thinkpad; installers
  need ssh keys.
  - WARNING: the `pi install git+ssh://…` form seen in chat does NOT parse
    on pi 1.5.2 — `git+ssh://` matches neither the `git:` prefix nor the
    `^(https?|ssh|git)://` probe in `parseGitUrl`, so it falls through to a
    local-path install and fails. Verified command forms: `pi install
    git:git@github.com:user/repo` or `pi install
    ssh://git@github.com/user/repo` (`pi install --help`, `utils/git.js`).
- (b) npm `@e4779/tasks` LATER — when the format stabilizes: post
  [add-tsk-check-validator](./add-tsk-check-validator.md) (done, 81a80df)
  plus a [render-markdown-doc-view](./render-markdown-doc-view.md) soak,
  README ready for strangers, maybe the repo goes public. Spin a follow-up
  card at that point; not now.

## Checklist

- [ ] Author `skills/tsk-workflow/SKILL.md` — minimal skill for the tsk
      loop: cards live in `**/{tasks,todos}/**/*.md`, path = identity,
      status-only lifecycle; `bun bin/tsk.ts list|next|graph|check`; `check`
      gates (any ERROR = exit 1). No skills dir exists in the repo today.
- [ ] `package.json` gains the `pi` section, skills only:
      `"pi": { "skills": ["./skills/tsk-workflow"] }`.
      AMENDED 2026-11-19 (operator): NO `subagents` key and NO `agents/`
      dir — worker-ponytail is operator tooling and lives directly in
      `~/.pi/agent/agents/` (dot-pi-synced), not in this package. The pi
      core manifest fields are ONLY `extensions|skills|prompts|themes`
      (`dist/core/pi-manifest.js`, `RESOURCE_FIELDS`) — a `pi.agents` key
      would be silently ignored; subagent packaging mechanics
      (`pkg.pi.subagents.agents`, pi-subagents `agents.js:272–283`) stay
      documented here as research, unused.
- [ ] Install check: from a scratch directory, with standard ssh keys,
      `pi install git:git@github.com:e4779/tasks` exits 0; package lands under
      `~/.pi/agent/git/`; `settings.json` records the git source; `pi
      config` lists `tsk-workflow` among the package's skills.
- [ ] Fresh `pi` session (anywhere): the `tsk-workflow` skill surfaces.
- [ ] Record the decision in Resolution: operator confirms git-only or
      overturns toward npm-now.

## Acceptance criteria

- `package.json` parses with the `pi` section, skills only — NO
  `subagents` key (worker-ponytail is not package cargo; it lives in
  `~/.pi/agent/agents/` per the checklist amendment).
- From a scratch dir with ssh keys, `pi install git:git@github.com/e4779/tasks`
  exits 0 and a fresh pi session lists `tsk-workflow` among available
  skills.
- The decision does NOT close on verifier output alone: Resolution names the
  operator's confirm/overturn of git-only-vs-npm (declared escalation — this
  is an operator-decision card).

## Source

- Operator session 2026-11-19: publication dilemma, git-only recommendation.
- pi 1.5.2 references: `dist/core/pi-manifest.js` (RESOURCE_FIELDS);
  `pi-subagents/src/agents/agents.js` (package agent roots);
  `pi-subagents/docs/agents.md:32`; `pi install --help` and
  `dist/utils/git.js` (`parseGitUrl`) for accepted source forms.
- `~/.cache/checkouts/github.com/DietrichGebert/ponytail/package.json` —
  live example of a `pi` section (`"skills": ["./skills"]`).
- Soft edge: the package `agents/` dir gains its persona via
  [ponytail-user-level](./ponytail-user-level.md); this card is not gated on
  it.

## Resolution — NPM-NOW (operator, 2026-11-19)

Operator overturned the git-only default: dual channel. Registry package
`@e4779/tasks` (unscoped `tsk` is taken on the registry, v0.3.2; both
`@e4779/tasks` and `@e4779/tsk` were free — scope requires the npm
username to be `e4779`, confirmed by operator). License ISC — canonical
GitHub Licenses API template, holder `Nikolay Ermakov <e@4779.name>`.
CI publishes on manual `v*` tags (.github/workflows/publish.yml: gates
-> build -> node smoke -> npm publish --access public; NPM_TOKEN secret
is set by the operator, never passes through agents). The dist build
(see runtime-neutral-ship) is what makes the registry channel complete:
the tarball carries compiled JS, consumers need no bun and no prepare.
First release: `git tag v0.1.0 && git push origin v0.1.0` after the
operator sets the NPM_TOKEN secret.
