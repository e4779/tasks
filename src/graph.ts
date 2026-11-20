import { basename, dirname, resolve } from "node:path";
import type { ParsedTask } from "./parse.ts";

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

// transitive reduction, graphviz-tred lineage (tasks/transitive-reduction.md):
// an edge leaves the picture only when a longer path already implies it.
// Cycles never dissolve: inside an SCC a minimal strongly-connected skeleton
// survives (cycle members stay painted), between SCCs the condensation DAG
// reduces canonically; self-loops have no implying path and stay.
export const reduceEdges = (edges: readonly Edge[]): Edge[] => {
  const nodes = [...new Set(edges.flatMap((e) => [e.from, e.to]))].sort();
  const id = new Map(nodes.map((p, i) => [p, i] as [string, number]));
  const adj: number[][] = nodes.map(() => []);
  for (const e of edges) {
    if (e.from === e.to) continue;
    const a = id.get(e.from) ?? -1;
    const b = id.get(e.to) ?? -1;
    if (a < 0 || b < 0 || adj[a]?.includes(b)) continue;
    adj[a]?.push(b);
  }
  for (let v = 0; v < nodes.length; v++) adj[v]?.sort((x, y) => x - y);
  // Tarjan SCC; pop order = reverse topological over the condensation (sinks first)
  const index = new Array<number>(nodes.length).fill(-1);
  const low = new Array<number>(nodes.length).fill(0);
  const onStack = new Array<boolean>(nodes.length).fill(false);
  const tstack: number[] = [];
  const comp = new Array<number>(nodes.length).fill(-1);
  const comps: number[][] = [];
  let counter = 0;
  const visit = (v: number): void => {
    index[v] = counter;
    low[v] = counter;
    counter += 1;
    tstack.push(v);
    onStack[v] = true;
    for (const w of adj[v] ?? []) {
      const iw = index[w] ?? -1;
      if (iw < 0) {
        visit(w);
        low[v] = Math.min(low[v] ?? counter, low[w] ?? counter);
      } else if (onStack[w] ?? false) low[v] = Math.min(low[v] ?? counter, iw);
    }
    if (low[v] === index[v]) {
      const members: number[] = [];
      for (;;) {
        const w = tstack.pop() ?? -1;
        if (w < 0) break;
        onStack[w] = false;
        comp[w] = comps.length;
        members.push(w);
        if (w === v) break;
      }
      comps.push(members);
    }
  };
  for (let v = 0; v < nodes.length; v++) if ((index[v] ?? -1) < 0) visit(v);
  const cadj: number[][] = comps.map(() => []);
  for (const e of edges) {
    if (e.from === e.to) continue;
    const a = id.get(e.from) ?? -1;
    const b = id.get(e.to) ?? -1;
    const ca = comp[a] ?? -1;
    const cb = comp[b] ?? -1;
    const out = ca < 0 ? undefined : cadj[ca];
    if (a < 0 || b < 0 || ca === cb || out?.includes(cb)) continue;
    out?.push(cb);
  }
  // successors pop before their predecessor: one forward pass closes every SCC
  const reach: Set<number>[] = comps.map(() => new Set<number>());
  for (let a = 0; a < comps.length; a++)
    for (const d of cadj[a] ?? []) {
      reach[a]?.add(d);
      for (const r of reach[d] ?? []) reach[a]?.add(r);
    }
  // condensation edge a→b is implied iff another out-route of a already reaches b
  const implied = (a: number, b: number): boolean => {
    for (const c of cadj[a] ?? []) {
      const rs = reach[c];
      if (c !== b && rs !== undefined && rs.has(b)) return true;
    }
    return false;
  };
  // per multi-member SCC: greedily drop internal edges the SCC survives
  // without (still strongly connected after removal) — a bare cycle loses
  // nothing, redundant chords go; deterministic via sorted edge iteration
  const intra: { a: number; b: number; key: string }[] = [];
  for (const e of edges) {
    if (e.from === e.to) continue;
    const a = id.get(e.from) ?? -1;
    const b = id.get(e.to) ?? -1;
    if (a < 0 || b < 0 || comp[a] !== comp[b]) continue;
    intra.push({ a, b, key: `${e.from}\t${e.to}` });
  }
  intra.sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
  const stronglyConnected = (c: number, active: Set<string>): boolean => {
    const members = comps[c] ?? [];
    const fwd = new Map<number, number[]>();
    const rev = new Map<number, number[]>();
    for (const e of intra)
      if (active.has(e.key)) {
        const f = fwd.get(e.a) ?? [];
        f.push(e.b);
        fwd.set(e.a, f);
        const r = rev.get(e.b) ?? [];
        r.push(e.a);
        rev.set(e.b, r);
      }
    const reachAll = (m: Map<number, number[]>): boolean => {
      const start = members[0] ?? -1;
      const seen = new Set<number>([start]);
      const stack = [start];
      while (stack.length > 0) {
        const v = stack.pop() ?? -1;
        if (v < 0) break;
        for (const w of m.get(v) ?? [])
          if (!seen.has(w)) {
            seen.add(w);
            stack.push(w);
          }
      }
      return seen.size >= members.length;
    };
    return reachAll(fwd) && reachAll(rev);
  };
  const active = new Set(intra.map((e) => e.key));
  for (const e of intra) {
    active.delete(e.key);
    if (!stronglyConnected(comp[e.a] ?? -1, active)) active.add(e.key);
  }
  return edges.filter((e) => {
    if (e.from === e.to) return true;
    const a = id.get(e.from) ?? -1;
    const b = id.get(e.to) ?? -1;
    if (a < 0 || b < 0) return true;
    const ca = comp[a] ?? -1;
    const cb = comp[b] ?? -1;
    if (ca === cb) return active.has(`${e.from}\t${e.to}`);
    return !implied(ca, cb);
  });
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
