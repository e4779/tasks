import { expect, test } from "bun:test";
import { join } from "node:path";
import { discover } from "../src/discover";
import { buildGraph } from "../src/graph";
import { parseFile } from "../src/parse";

const fx = (name: string) => join(import.meta.dir, "fixtures", "tasks", name);

const tasks = (await discover([join(import.meta.dir, "fixtures")])).flatMap((f) => {
  const r = parseFile(f, []);
  return r.ok ? [r.v] : [];
});
const g = buildGraph(tasks);

test("discovery finds the whole fixture corpus", () => {
  expect(tasks.length).toBe(7);
});

test("soft edges: prose links between corpus files", () => {
  expect(
    g.edges.some(
      (e) => e.kind === "soft" && e.from === fx("normal-card.md") && e.to === fx("cyclic-a.md"),
    ),
  ).toBeTrue();
  expect(
    g.edges.some(
      (e) =>
        e.kind === "soft" && e.from === fx("normal-card.md") && e.to === fx("completed-card.md"),
    ),
  ).toBeTrue();
});

test("broken soft link: no edge, no ghost", () => {
  expect(g.edges.some((e) => e.to === fx("nowhere.md"))).toBeFalse();
  expect(g.ghosts).not.toContain(fx("nowhere.md"));
});

test("hard edges: blocked-by becomes an edge; missing target becomes a ghost node", () => {
  expect(
    g.edges.some(
      (e) => e.kind === "hard" && e.from === fx("blocked-card.md") && e.to === fx("normal-card.md"),
    ),
  ).toBeTrue();
  expect(g.ghosts).toContain(fx("missing-dep.md"));
  expect(g.edges.some((e) => e.kind === "hard" && e.to === fx("missing-dep.md"))).toBeTrue();
  expect(g.nodes.some((n) => n.path === fx("missing-dep.md") && n.status === null)).toBeTrue();
});

test("cycle: the cyclic pair is reported exactly once", () => {
  expect(g.cycles.length).toBe(1);
  expect(g.cycles[0]).toContain(fx("cyclic-a.md"));
  expect(g.cycles[0]).toContain(fx("cyclic-b.md"));
});
