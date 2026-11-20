import { expect, test } from "bun:test";
import { reductionOf } from "../src/config";
import { type Edge, reduceEdges } from "../src/graph";
import { renderGraph } from "../src/graph-view";
import type { SnapshotNode } from "../src/serve";

const hard = (from: string, to: string): Edge => ({ from, to, kind: "hard" });
const soft = (from: string, to: string): Edge => ({ from, to, kind: "soft" });
const keys = (es: readonly Edge[]): string[] => es.map((e) => `${e.from}>${e.to}`).sort();

test("chain: A→B→C implies A→C — the shortcut drops, the chain stays", () => {
  const es = [hard("/a.md", "/c.md"), hard("/a.md", "/b.md"), hard("/b.md", "/c.md")];
  expect(keys(reduceEdges(es))).toEqual(["/a.md>/b.md", "/b.md>/c.md"]);
});

test("cycle + chord: cycle members stay, the chord drops", () => {
  const es = [
    hard("/a.md", "/b.md"),
    hard("/b.md", "/c.md"),
    hard("/c.md", "/a.md"),
    hard("/a.md", "/c.md"), // chord — implied by A→B→C
  ];
  expect(keys(reduceEdges(es))).toEqual(["/a.md>/b.md", "/b.md>/c.md", "/c.md>/a.md"]);
});

test("inter-SCC shortcuts drop; a mutual pair and self-loops survive", () => {
  const es = [
    hard("/a.md", "/b.md"),
    hard("/b.md", "/c.md"),
    hard("/c.md", "/d.md"),
    hard("/a.md", "/c.md"), // implied by A→B→C
    hard("/b.md", "/d.md"), // implied by B→C→D
    hard("/x.md", "/y.md"), // mutual pair: both edges stay (SCC skeleton)
    hard("/y.md", "/x.md"),
    soft("/s.md", "/s.md"), // self-loop: nothing implies it
  ];
  expect(keys(reduceEdges(es))).toEqual([
    "/a.md>/b.md",
    "/b.md>/c.md",
    "/c.md>/d.md",
    "/s.md>/s.md",
    "/x.md>/y.md",
    "/y.md>/x.md",
  ]);
});

test("config flag: reduction defaults on; the literal off restores the full set", () => {
  expect(reductionOf({})).toBe(true);
  expect(reductionOf({ reduction: "on" })).toBe(true);
  expect(reductionOf({ reduction: "off" })).toBe(false);
});

const node = (path: string): SnapshotNode => ({
  path,
  title: path,
  status: "pending",
  blocked: false,
  ghost: false,
});
const nodes = [node("/a.md"), node("/b.md"), node("/c.md")];
const chain = [hard("/a.md", "/b.md"), hard("/b.md", "/c.md"), hard("/a.md", "/c.md")];

test("render layer: the implied edge leaves the SVG; reduction=off repaints it", async () => {
  const on = await renderGraph(nodes, chain, () => "#");
  expect(on).not.toContain('data-from="/a.md" data-to="/c.md"');
  const off = await renderGraph(nodes, chain, () => "#", false);
  expect(off).toContain('data-from="/a.md" data-to="/c.md"');
});
