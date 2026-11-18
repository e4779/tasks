import { expect, test } from "bun:test";
import { join } from "node:path";
import { discover } from "../src/discover";
import { buildGraph } from "../src/graph";
import { parseFile } from "../src/parse";
import { snapshot } from "../src/serve";
import { breakCycles } from "../web/graph-cycles.js";

const fx = (name: string) => join(import.meta.dir, "fixtures", "tasks", name);

const tasks = (await discover([join(import.meta.dir, "fixtures")])).flatMap((f) => {
  const r = parseFile(f, []);
  return r.ok ? [r.v] : [];
});
const snap = snapshot(buildGraph(tasks));

// independent oracle: Kahn's algorithm — acyclic iff every node leaves the queue
const isAcyclic = (
  nodes: readonly { path: string }[],
  edges: readonly { from: string; to: string }[],
) => {
  const indeg = new Map(nodes.map((n) => [n.path, 0]));
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  const queue = [...indeg.entries()].filter(([, d]) => d === 0).map(([p]) => p);
  let seen = 0;
  for (; queue.length > 0; ) {
    const n = queue.shift() ?? "";
    seen++;
    for (const t of adj.get(n) ?? []) {
      const d = (indeg.get(t) ?? 0) - 1;
      indeg.set(t, d);
      if (d === 0) queue.push(t);
    }
  }
  return seen === nodes.length;
};

test("fixture corpus: cycle broken deterministically, remaining edges acyclic", () => {
  const { edges, broken } = breakCycles(snap.nodes, snap.edges);
  // the cyclic pair has parallel soft+hard edges in both directions; the
  // deterministic max key (from+to+kind) breaks both cyclic-b→cyclic-a edges
  expect(broken).toHaveLength(2);
  for (const e of broken) {
    expect(e.from).toBe(fx("cyclic-b.md"));
    expect(e.to).toBe(fx("cyclic-a.md"));
  }
  expect(edges).toHaveLength(snap.edges.length - broken.length);
  expect(isAcyclic(snap.nodes, edges)).toBeTrue();
  // the a→b direction survives so the relation stays in the graph
  expect(edges.some((e) => e.from === fx("cyclic-a.md") && e.to === fx("cyclic-b.md"))).toBeTrue();
  // deterministic: same input, same removal
  expect(breakCycles(snap.nodes, snap.edges).broken).toEqual(broken);
});

test("acyclic input passes through untouched", () => {
  const nodes = [{ path: "a" }, { path: "b" }];
  const edges = [{ from: "a", to: "b", kind: "hard" }];
  expect(breakCycles(nodes, edges)).toEqual({ edges, broken: [] });
});

test("self-loop is broken", () => {
  const edge = { from: "a", to: "a", kind: "soft" };
  expect(breakCycles([{ path: "a" }], [edge])).toEqual({ edges: [], broken: [edge] });
});
