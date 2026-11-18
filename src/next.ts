import type { Graph } from "./graph";

// hard-blocked = any hard edge to a target that is not done/cancelled (ghosts included);
// shared by nextUp and the web snapshot
export const hardBlocked = (graph: Graph): ReadonlySet<string> => {
  const statusOf = new Map(graph.nodes.map((n) => [n.path, n.status]));
  return new Set(
    graph.edges
      .filter(
        (e) =>
          e.kind === "hard" && statusOf.get(e.to) !== "done" && statusOf.get(e.to) !== "cancelled",
      )
      .map((e) => e.from),
  );
};

export const nextUp = (graph: Graph): Readonly<{ title: string; path: string }>[] => {
  const blocked = hardBlocked(graph);
  return graph.nodes
    .filter((n) => (n.status === "pending" || n.status === "in-progress") && !blocked.has(n.path))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((n) => ({ title: n.title, path: n.path }));
};
