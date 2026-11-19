---
status: pending
---

# Runtime-neutral ship — node-compatible CLI and server, bun stays the dev runtime

## Objective

Operator decision (2026-11-19, verbatim): «Полный масштаб. Bun хочется
использовать для разработки точно. Но шипить то, что можно использовать из
tsk — надо runtime-нейтрально.» Full port: every `Bun.*` API leaves the
SHIPPED surface (`bin/` + `src/`); bun remains the dev runtime (test runner,
devDeps, biome/tsc gates). The shipped CLI runs under node AND bun; `serve`
too — full scale means no bun-only serve.

## Baked scope/decisions

- **Ship surface = `bin/` + `src/`.** `tools/` are dev tools and stay Bun
  (`probe.mjs`, `migrate-taskmd.mjs`) — exempt from the census gate.
- **bun = dev runtime forever**: `bun test`, `bun run check:full`, `@types/bun`
  devDep — all unchanged.
- **Runtime matrix**: node ≥23.6 is the primary ship target (native type
  stripping, unflagged; erasable-only TS syntax required); bun unchanged as
  dev path; no other runtimes promised.
- **Shebang**: `bin/tsk.ts` becomes `#!/usr/bin/env node`. bun ignores
  shebangs when invoked directly (`bun bin/tsk.ts …` runs the file itself),
  so bun invocation keeps working unchanged post-port.
- **Dev-side bun forcing**: `bun run --bun` / `bunx --bun` are the sanctioned
  mechanism (node→bun PATH shim for the process tree; flips env-node shebangs
  and `spawn('node')` children). Global PATH-shim dir REJECTED — flips
  everything silently, native-addon risk. Wrappers/flags are the way.
- **serve port shape**: prefer a THIN `node:http` driver (~60 lines: node req
  → `Request`, call the existing fetch handler, `Response` → res; node 18+
  has native Request/Response) over rewriting server logic. The Bun driver
  (`Bun.serve(fetch)`) may stay as a dev path selected by runtime detection
  (`typeof Bun !== "undefined"`) — or collapse to a node-only driver if
  simpler. Executor decides; the trade-off is dual-driver keeps a bun-native
  dev path at the cost of two code paths to keep honest, node-only is less
  code. Do not relitigate in review.
- **Packaging completes the ship story** (absorbs the earlier bin-card
  discussion — no card file existed for it): `package.json` `bin` + `files`
  so global installs (`bun install -g github:e4779/tasks` post-push, npm
  later per [package-publication](./package-publication.md)) get a working
  `tsk` on PATH under node.
- **Docs follow the port**: README usage lines and
  `skills/tsk-workflow/SKILL.md` say `bun bin/tsk.ts …` today — move to the
  runtime-neutral form (`tsk …` via bin, or `node bin/tsk.ts`), keep bun
  mentioned as the dev path.

## Current state (verified in code)

Census of `Bun.*` call sites in shipped code, 2026-11-19 (baked; re-verified
by spot check same day — two amendments, marked):

- `bin/tsk.ts:11` — `Bun.argv` (CLI entry, slice(2)).
- `src/serve.ts:69` — `Bun.file` (static file serve).
- `src/serve.ts:101` — `Bun.serve` (the whole server is a fetch handler,
  ~200 lines).
- `src/serve.ts:205` — `Bun.file` (vendor map: node_modules assets).
- AMENDMENT (spot check, missed by the original census): `src/serve.ts:52`
  and `:205` also use `import.meta.dir` — a Bun-only property. Node
  equivalent is `import.meta.dirname` (node ≥20.11); both sites sit on lines
  this card already touches.
- AMENDMENT (spot check): `tools/migrate-taskmd.mjs:229` also uses
  `Bun.argv` — same exemption class as `tools/probe.mjs:734` (dev tool, out
  of scope, stays Bun).
- All other imports are already `node:` (census: serve 2, parse 2, check 2,
  graph 1, config 2, bin 1) — the code is otherwise portable.
- Shebang today: `#!/usr/bin/env bun` in `bin/tsk.ts` (file is executable).
- node on hlab: v24.21.0. Node runs `.ts` natively since 23.6 (unflagged type
  stripping); requirement: erasable-only syntax (no enums / namespaces /
  parameter-properties). If tsc flags a non-erasable construct, that file
  needs a note in this card's Resolution — verify during execution, gate:
  `node bin/tsk.ts list .` exits 0.
- DRIFT (spot check): the original packaging note said package.json "gains
  `bin`" — the `bin` field is ALREADY present
  (`"bin": { "tsk": "bin/tsk.ts" }`). Only `files` is new.

## Checklist

- [ ] `bin/tsk.ts`: shebang → `#!/usr/bin/env node`; `Bun.argv` →
      `process.argv` (same `slice(2)` shape).
- [ ] `src/serve.ts`: `Bun.file` → `node:fs` (`readFile` is sufficient;
      vendor files are small) ×2; `import.meta.dir` → `import.meta.dirname`
      (or `fileURLToPath(import.meta.url)` if wider compat is wanted) ×2.
- [ ] `src/serve.ts`: server port — thin `node:http` driver over the existing
      fetch handler, runtime detection `typeof Bun !== "undefined"` if the
      Bun dev driver is kept, or node-only collapse; executor's call per
      Baked scope.
- [ ] Gates stay bun: `bun test`, `bun run check:full` unchanged.
- [ ] NEW gate — node smoke: `node bin/tsk.ts list .` exits 0,
      `node bin/tsk.ts check .` exits 0, serve booted under node answers
      `curl /` with 200/303.
- [ ] Verify erasable-only syntax under node type stripping (no enums /
      namespaces / parameter-properties); `tsc --noEmit` green; any
      non-erasable file surfaced → note it in Resolution.
- [ ] `package.json`: keep the existing `bin` field; add `"files"` —
      `bin/`, `src/`, `web/`, `README.md`, `package.json`, plus `skills/`
      (NOT in the original sketch — `pi.skills` points at
      `./skills/tsk-workflow`; omitting it breaks the pi manifest on
      packaged installs; git-channel installs carry the whole tree and are
      unaffected). NOT `tasks/`, `test/`, `tools/`.
- [ ] README usage lines + `skills/tsk-workflow/SKILL.md`: runtime-neutral
      invocation (`tsk …` via bin, or `node bin/tsk.ts`), bun kept as the
      named dev path.

## Acceptance criteria

- `rg 'Bun\.' bin/ src/` → zero hits (`tools/` exempt).
- `node bin/tsk.ts list .` and `node bin/tsk.ts check .` exit 0 on node
  v24; serve booted under node answers `curl /` with 200/303.
- bun paths unchanged: `bun bin/tsk.ts list .` works, `bun test` green,
  `bun run check:full` (biome + tsc) green.
- Shebang is `#!/usr/bin/env node`; `package.json` has `bin` + `files`
  (with `skills/` included); no `import.meta.dir` remains in `bin/`+`src/`.
- This card does NOT touch `tasks/*.md` statuses; `blocked-by`: none
  (queue is empty).

## Interplay (flagged, not silently resolved)

- [package-publication](./package-publication.md): both cards edit
  `package.json`. No contradiction on `bin` (already landed); the `files`
  addition here exceeds that card's pi-section sketch by including
  `skills/` — flagged so its npm-later checklist inherits the same list.
  npm publishing itself stays deferred there.
- The earlier bin-card discussion (chat-only, no card file) is absorbed by
  this card's packaging checklist — no merge traffic left to expect.

## Source

- Operator session 2026-11-19: «Полный масштаб…» decision (runtime-neutral
  ship, bun stays dev runtime, full-scale serve).
- Census of `Bun.*` call sites 2026-11-19 (baked facts), plus same-day spot
  check with two amendments (`import.meta.dir` at serve.ts:52/205;
  `tools/migrate-taskmd.mjs:229`) and one drift (package.json `bin` already
  present).
- Cross-session research 2026-11-16 (session 01a1e539, empirically proven):
  `bun run --bun` / `bunx --bun` shim mechanics; `bun install -g` does NOT
  rewrite shebangs (verified on `~/.bun/bin/pi`); global PATH-shim dir
  rejected.
- Code: `bin/tsk.ts`, `src/serve.ts`, `package.json`, `README.md`,
  `skills/tsk-workflow/SKILL.md`.
