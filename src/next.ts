import { DEFAULT_TERMINALS } from "./config";
import type { Graph } from "./graph";

// blocked = a hard edge to a target whose status is not terminal (ghosts included);
// terminals come from status.terminals — the one source for next, snapshot, future dimming
export const hardBlocked = (
  graph: Graph,
  terminals: readonly string[] = DEFAULT_TERMINALS,
): ReadonlySet<string> => {
  const term = new Set<string>(terminals);
  const statusOf = new Map(graph.nodes.map((n) => [n.path, n.status]));
  return new Set(
    graph.edges
      .filter((e) => e.kind === "hard" && !term.has(statusOf.get(e.to) ?? ""))
      .map((e) => e.from),
  );
};

export const nextUp = (
  graph: Graph,
  terminals: readonly string[] = DEFAULT_TERMINALS,
): Readonly<{ title: string; path: string }>[] => {
  const blocked = hardBlocked(graph, terminals);
  return graph.nodes
    .filter((n) => (n.status === "pending" || n.status === "in-progress") && !blocked.has(n.path))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((n) => ({ title: n.title, path: n.path }));
};
