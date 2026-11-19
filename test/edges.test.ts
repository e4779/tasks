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

test("reversed input order: hard direction wins regardless of order", () => {
  const edges = [e("b", "a", "soft"), e("b", "a", "hard"), e("a", "b", "soft")];
  // one hard (b→a) + opposite soft mention (a→b): the hard wins; soft
  // parallel (b→a soft) collapses into it. Deterministic for any order.
  expect(mergeEdges(edges)).toEqual([e("b", "a", "hard")]);
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

test("stable order: hard wins over opposite soft, hard+hard mutual → cycle once", () => {
  const edges = [
    e("c", "d", "hard"),
    e("a", "b", "soft"),
    e("b", "a", "hard"),
    e("d", "c", "soft"),
    e("x", "y", "hard"),
  ];
  // c→d hard + d→c soft: the hard direction wins (soft absorbed — mention,
  // not gate). a→b soft + b→a hard: b→a hard wins outright. No cycles are
  // born from soft mentions (operator 2026-11-19).
  expect(mergeEdges(edges)).toEqual([
    e("c", "d", "hard"),
    e("b", "a", "hard"),
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

test("mutual soft pairs are mentions, not cycles (operator 2026-11-19)", () => {
  const pk = "package-publication.md";
  const pu = "ponytail-user-level.md";
  const merged = mergeEdges([
    { from: pk, to: pu, kind: "soft" },
    { from: pu, to: pk, kind: "soft" },
  ]);
  expect(merged).toHaveLength(1);
  expect(merged[0]?.kind).toBe("soft");
});
test("hard mutual still yields exactly one cycle (ac7 contract)", () => {
  const merged = mergeEdges([
    { from: "a.md", to: "b.md", kind: "hard" },
    { from: "b.md", to: "a.md", kind: "hard" },
  ]);
  expect(merged).toHaveLength(1);
  expect(merged[0]?.kind).toBe("cycle");
});
test("hard + opposite soft: the hard direction wins outright", () => {
  const merged = mergeEdges([
    { from: "a.md", to: "b.md", kind: "hard" },
    { from: "b.md", to: "a.md", kind: "soft" },
  ]);
  expect(merged).toHaveLength(1);
  expect(merged[0]?.from).toBe("a.md");
  expect(merged[0]?.to).toBe("b.md");
  expect(merged[0]?.kind).toBe("hard");
});
test("plain single edges still pass through untouched", () => {
  const merged = mergeEdges([{ from: "x.md", to: "y.md", kind: "soft" }]);
  expect(merged).toHaveLength(1);
  expect(merged[0]?.kind).toBe("soft");
});
