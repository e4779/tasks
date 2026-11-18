import { expect, test } from "bun:test";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import matter from "gray-matter";
import {
  buildIdTable,
  convertCard,
  mapStatus,
  migrateCorpus,
  planCorpus,
  resolveRef,
} from "../tools/migrate-taskmd.mjs";

const DIR = "/corpus/tasks";
const table = new Map<string, string>([
  ["f001", `${DIR}/f001-umbrella.md`],
  ["f002", `${DIR}/f002-blocked.md`],
  ["f003", `${DIR}/f003-multi.md`],
]);

test("mapStatus: completed→done, blocked→pending, rest identity", () => {
  expect(mapStatus("completed")).toBe("done");
  expect(mapStatus("blocked")).toBe("pending");
  expect(mapStatus("pending")).toBe("pending");
  expect(mapStatus("in-progress")).toBe("in-progress");
  expect(mapStatus("cancelled")).toBe("cancelled");
});

test("resolveRef: full id direct hit", () => {
  const r = resolveRef("f001", "f002", table);
  expect(r.ok && r.v).toBe(`${DIR}/f001-umbrella.md`);
});

test("resolveRef: bare numeric = same-prefix shorthand (002 in f003 → f002)", () => {
  const r = resolveRef("002", "f003", table);
  expect(r.ok && r.v).toBe(`${DIR}/f002-blocked.md`);
});

test("resolveRef: numeric ref with no same-prefix match is unresolved", () => {
  expect(resolveRef("002", "g001", table).ok).toBeFalse();
  expect(resolveRef("zzz", "f002", table).ok).toBeFalse();
});

test("resolveRef: numeric ref matching two ids is an ambiguity error naming both", () => {
  const wide = new Map([
    ["f001", `${DIR}/f001-umbrella.md`],
    ["f1001", `${DIR}/f1001-late.md`],
  ]);
  const r = resolveRef("001", "f002", wide);
  expect(r.ok).toBeFalse();
  expect(!r.ok && r.e).toContain("f001");
  expect(!r.ok && r.e).toContain("f1001");
});

test("buildIdTable: duplicate id among real cards is a hard error with both paths", () => {
  const r = buildIdTable([
    { path: `${DIR}/f001-a.md`, data: { id: "f001" } },
    { path: `${DIR}/f001-b.md`, data: { id: "f001" } },
  ]);
  expect(r.ok).toBeFalse();
  expect(!r.ok && r.e).toContain("f001-a.md");
  expect(!r.ok && r.e).toContain("f001-b.md");
});

const convert = (text: string, path = `${DIR}/f001-umbrella.md`) =>
  convertCard({ path, text, data: matter(text).data, table });

const F001 = `---
id: "f001"
title: "Umbrella — longer frontmatter title that the h1 wins over"
status: completed
priority: medium
created_at: 2026-11-13
dependencies: []
---

# Umbrella

Body one.
`;

const F002 = `---
id: "f002"
title: "Blocked card"
status: blocked
tags: [fixture]
dependencies: [f003]
created_at: 2026-11-13
---

# Blocked card

Body two.
`;

const F003 = `---
id: "f003"
title: "Multi dep"
status: pending
parent: "f001"
dependencies: ["f001", "002"]
context: [docs/some-note.md]
created_at: 2026-11-13
---

# Multi dep

Body three.
`;

const F004 = `---
id: "f004"
title: "Materialized head"
status: cancelled
dependencies: ["f002"]
---

Body without heading.
`;

test("convertCard: title consumed by existing h1 (h1 wins), id dropped, completed→done, empty deps dropped, other keys byte-exact", () => {
  const r = convert(F001);
  expect(r.ok).toBeTrue();
  expect(r.ok && r.v.text).toBe(`---
status: done
priority: medium
created_at: 2026-11-13
---

# Umbrella

Body one.
`);
});

test("convertCard: blocked stripped to pending, bare unquoted dep resolves to ./path", () => {
  const r = convert(F002, `${DIR}/f002-blocked.md`);
  expect(r.ok && r.v.text).toBe(`---
status: pending
tags: [fixture]
blocked-by: [./f003-multi.md]
created_at: 2026-11-13
---

# Blocked card

Body two.
`);
});

test("convertCard: multi-dep with numeric shorthand + parent id→path rewrite", () => {
  const r = convert(F003, `${DIR}/f003-multi.md`);
  expect(r.ok && r.v.text).toBe(`---
status: pending
parent: ./f001-umbrella.md
blocked-by: [./f001-umbrella.md, ./f002-blocked.md]
context: [docs/some-note.md]
created_at: 2026-11-13
---

# Multi dep

Body three.
`);
});

test("convertCard: card without h1 gets one materialized from title", () => {
  const r = convert(F004, `${DIR}/f004-no-h1.md`);
  expect(r.ok && r.v.text).toBe(`---
status: cancelled
blocked-by: [./f002-blocked.md]
---

# Materialized head

Body without heading.
`);
  expect(r.ok && r.v.stats.h1Materialized).toBeTrue();
});

test("planCorpus: unresolved dep fails the whole run before any write", () => {
  const r = planCorpus([
    {
      path: `${DIR}/f009-orphan.md`,
      text: `---\nid: "f009"\ntitle: "Orphan"\nstatus: pending\ndependencies: ["f777"]\n---\n\n# Orphan\n`,
    },
  ]);
  expect(r.ok).toBeFalse();
  expect(!r.ok && r.e).toContain('unresolved ref "f777"');
});

test("migrateCorpus: fixture corpus converts, meta file untouched, rerun is zero-diff", async () => {
  const fixture = resolve(import.meta.dir, "taskmd-fixture");
  const tmp = mkdtempSync(join(tmpdir(), "tsk-migrate-"));
  cpSync(fixture, tmp, { recursive: true });
  const metaBefore = readFileSync(join(tmp, "tasks/AGENTS.md"), "utf8");
  const snap = () =>
    Object.fromEntries(
      readdirSync(join(tmp, "tasks"))
        .sort()
        .map((f) => [f, readFileSync(join(tmp, "tasks", f), "utf8")]),
    );

  const r1 = await migrateCorpus(tmp);
  expect(r1.ok).toBeTrue();
  if (!r1.ok) return;
  expect(r1.v).toEqual({
    root: tmp,
    discovered: 5,
    rewritten: 4,
    noId: 0,
    stemMismatch: 1,
    edges: 4,
    titlesDropped: 4,
    blockedStripped: 1,
    completedToDone: 1,
    parentsRewritten: 1,
    h1Materialized: 1,
  });
  expect(readFileSync(join(tmp, "tasks/AGENTS.md"), "utf8")).toBe(metaBefore);
  const after1 = snap();
  expect(after1["f002-blocked.md"]).toContain("blocked-by: [./f003-multi.md]");
  expect(after1["f003-multi.md"]).toContain("blocked-by: [./f001-umbrella.md, ./f002-blocked.md]");

  const r2 = await migrateCorpus(tmp);
  expect(r2.ok && r2.v.rewritten).toBe(0);
  expect(snap()).toEqual(after1);
  rmSync(tmp, { recursive: true, force: true });
});
