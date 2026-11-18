import { basename, dirname, resolve } from "node:path";
import type { ParsedTask } from "./parse";

export type TaskNode = Readonly<{
  path: string;
  title: string;
  status: string | null;
  attrs: Record<string, unknown>;
}>;
export type Edge = Readonly<{ from: string; to: string; kind: "soft" | "hard" }>;
export type Graph = Readonly<{
  nodes: TaskNode[];
  edges: Edge[];
  cycles: string[][];
  ghosts: string[];
}>;

// blocked-by accepts a YAML list or a bare string; each entry resolves like a prose link
const hardTargets = (t: ParsedTask): string[] => {
  const bb = t.attrs["blocked-by"];
  const list = Array.isArray(bb) ? bb : typeof bb === "string" ? [bb] : [];
  return list
    .filter((p): p is string => typeof p === "string")
    .map((p) => resolve(dirname(t.path), p));
};

const findCycles = (nodes: readonly TaskNode[], edges: readonly Edge[]): string[][] => {
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    const set = adj.get(e.from) ?? new Set<string>();
    set.add(e.to);
    adj.set(e.from, set);
  } // a cycle is reachability, not edge multiplicity: parallel soft/hard pairs collapse
  const state = new Map<string, "gray" | "black">();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const visit = (n: string): void => {
    state.set(n, "gray");
    stack.push(n);
    for (const next of adj.get(n) ?? []) {
      if (state.get(next) === "gray") cycles.push([...stack.slice(stack.indexOf(next)), next]);
      else if (!state.has(next)) visit(next);
    }
    stack.pop();
    state.set(n, "black");
  };
  for (const n of nodes) if (!state.has(n.path)) visit(n.path);
  return cycles;
};

export const buildGraph = (tasks: ParsedTask[]): Graph => {
  const byPath = new Map(tasks.map((t) => [t.path, t]));
  const edges: Edge[] = [];
  const seen = new Set<string>();
  const addEdge = (from: string, to: string, kind: "soft" | "hard"): void => {
    const key = `${from}\t${to}\t${kind}`;
    if (!seen.has(key)) {
      seen.add(key);
      edges.push({ from, to, kind });
    }
  };
  for (const t of tasks) {
    for (const link of t.links)
      if (byPath.has(link.resolved)) addEdge(t.path, link.resolved, "soft");
    for (const to of hardTargets(t)) addEdge(t.path, to, "hard");
  }
  const ghosts = [
    ...new Set(edges.filter((e) => e.kind === "hard" && !byPath.has(e.to)).map((e) => e.to)),
  ];
  const nodes: TaskNode[] = [
    ...tasks.map((t) => ({ path: t.path, title: t.title, status: t.status, attrs: t.attrs })),
    ...ghosts.map((path) => ({ path, title: basename(path, ".md"), status: null, attrs: {} })),
  ];
  return { nodes, edges, cycles: findCycles(nodes, edges), ghosts };
};
