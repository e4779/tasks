import { expect, test } from "bun:test";
import { join } from "node:path";
import { discover } from "../src/discover";
import { buildGraph } from "../src/graph";
import { parseFile } from "../src/parse";
import { snapshot } from "../src/serve";
import { mergeEdges } from "../web/edges.js";

const fx = (name: string) => join(import.meta.dir, "fixtures", "tasks", name);
const e = (from: string, to: string, kind: "soft" | "hard") => ({ from, to, kind });

test("mutual pair collapses 4→1 undirected cycle edge", () => {
  const edges = [
    e("a", "b", "hard"),
    e("a", "b", "soft"),
    e("b", "a", "hard"),
    e("b", "a", "soft"),
  ];
  expect(mergeEdges(edges)).toEqual([{ from: "a", to: "b", kind: "cycle" }]);
});

test("mutual pair with reversed input order still yields the canonical cycle edge", () => {
  const edges = [e("b", "a", "soft"), e("b", "a", "hard"), e("a", "b", "soft")];
  expect(mergeEdges(edges)).toEqual([{ from: "a", to: "b", kind: "cycle" }]);
});

test("same-direction parallels collapse to the strongest kind (hard > soft)", () => {
  expect(mergeEdges([e("a", "b", "soft"), e("a", "b", "hard")])).toEqual([e("a", "b", "hard")]);
  expect(mergeEdges([e("a", "b", "hard"), e("a", "b", "soft")])).toEqual([e("a", "b", "hard")]);
  expect(mergeEdges([e("a", "b", "soft"), e("a", "b", "soft")])).toEqual([e("a", "b", "soft")]);
});

test("single edges pass through untouched", () => {
  const edges = [e("a", "b", "hard"), e("b", "c", "soft")];
  expect(mergeEdges(edges)).toEqual(edges);
});

test("self-loop passes through (its reverse key is itself)", () => {
  const self = e("a", "a", "hard");
  expect(mergeEdges([self])).toEqual([self]);
});

test("stable order: survivors keep first-occurrence slots, cycle emits once", () => {
  const edges = [
    e("c", "d", "hard"),
    e("a", "b", "soft"),
    e("b", "a", "hard"),
    e("d", "c", "soft"),
    e("x", "y", "hard"),
  ];
  expect(mergeEdges(edges)).toEqual([
    { from: "c", to: "d", kind: "cycle" }, // c→d slot (c<d canonical)
    { from: "a", to: "b", kind: "cycle" }, // a→b slot
    e("x", "y", "hard"),
  ]);
});

test("fixture corpus: exactly one cycle edge between the cyclic pair, nothing else", async () => {
  const tasks = (await discover([join(import.meta.dir, "fixtures")])).flatMap((f) => {
    const r = parseFile(f, []);
    return r.ok ? [r.v] : [];
  });
  const merged = mergeEdges([...snapshot(buildGraph(tasks)).edges]);
  const a = fx("cyclic-a.md");
  const b = fx("cyclic-b.md");
  const between = merged.filter(
    (m) => (m.from === a && m.to === b) || (m.from === b && m.to === a),
  );
  expect(between).toEqual([{ from: a, to: b, kind: "cycle" }]); // a<b: canonical direction
  expect(merged).toHaveLength(5); // 4 pair lines → 1, plus the 4 unrelated edges
});
