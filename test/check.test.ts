import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { check } from "../src/check";

const REPO = join(import.meta.dir, "..");
// root semantics: discovery takes SEARCH roots — the tasks/ dir must live inside
// them, so the fixture root is test/fixtures (pointing at tasks/ itself is vacuous)
const FX = join(import.meta.dir, "fixtures");

test("fixtures: the semantic taxonomy by name; semantic findings are never ERROR", async () => {
  const f = await check([FX], {});
  expect(f.filter((x) => x.level === "ERROR")).toEqual([]);
  const lines = f.map((x) => `${x.path} ${x.detail}`);
  expect(lines.some((l) => l.includes("broken prose link: ./nowhere.md"))).toBeTrue();
  expect(lines.some((l) => l.includes("unknown status: blocked"))).toBeTrue();
  expect(lines.some((l) => l.includes("ghost blocker") && l.includes("missing-dep"))).toBeTrue();
  expect(lines.some((l) => l.includes("cycle: cyclic-a -> cyclic-b -> cyclic-a"))).toBeTrue();
  expect(f.some((x) => x.level === "INFO" && x.path.endsWith("no-h1.md"))).toBeTrue();
});

test("unblocked-by-cancellation is a dead-weight warning, not an error", async () => {
  const f = await check([join(import.meta.dir, "fixtures-conf")], {});
  expect(f.some((x) => x.detail.startsWith("blocker cancelled"))).toBeTrue();
  expect(f.filter((x) => x.level === "ERROR")).toEqual([]);
});

test("machine-of-format is the only ERROR: unparsable frontmatter fails the run", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "tsk-check-"));
  try {
    mkdirSync(join(tmp, "tasks"));
    writeFileSync(join(tmp, "tasks", "bad-yaml.md"), "---\nstatus: [unclosed\n---\n\n# Bad\n");
    const f = await check([tmp], {});
    expect(f.some((x) => x.level === "ERROR" && x.path.endsWith("bad-yaml.md"))).toBeTrue();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("dogfood: repo-wide check keeps every ERROR out of the real tasks/", async () => {
  const f = await check([REPO], {});
  const realTasks = `${join(REPO, "tasks")}${sep}`;
  expect(f.filter((x) => x.level === "ERROR" && x.path.startsWith(realTasks))).toEqual([]);
});
