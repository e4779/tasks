import { expect, test } from "bun:test";
import { join } from "node:path";
import { discover } from "../src/discover";
import { buildGraph } from "../src/graph";
import { nextUp } from "../src/next";
import { parseFile } from "../src/parse";

const fx = (name: string) => join(import.meta.dir, "fixtures", "tasks", name);

const tasks = (await discover([join(import.meta.dir, "fixtures")])).flatMap((f) => {
  const r = parseFile(f, []);
  return r.ok ? [r.v] : [];
});
const next = nextUp(buildGraph(tasks));

test("blocked and non-actionable cards are filtered out", () => {
  const paths = next.map((t) => t.path);
  expect(paths).not.toContain(fx("blocked-card.md")); // hard-blocked by pending normal-card + ghost
  expect(paths).not.toContain(fx("cyclic-a.md")); // mutual hard-block
  expect(paths).not.toContain(fx("cyclic-b.md"));
  expect(paths).not.toContain(fx("broken-link.md")); // status "blocked" is not actionable
  expect(paths).not.toContain(fx("completed-card.md")); // done
  expect(paths).not.toContain(fx("missing-dep.md")); // ghosts never surface
});

test("eligible cards sorted by path", () => {
  expect(next.map((t) => t.path)).toEqual([fx("no-h1.md"), fx("normal-card.md")]);
  expect(next.map((t) => t.title)).toEqual(["no-h1", "Normal Card"]);
});
