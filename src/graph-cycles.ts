// Find the edges that close cycles — elk layered breaks them internally for
// layout but still routes them, so the viewer only needs the set to style:
// broken edges render red dotted, cycles stay visible. Deterministic: each
// cycle's max edge by `${from}\t${to}\t${kind}` is the one styled broken.

export type CycleNode = Readonly<{ path: string }>;
export type CycleEdge = Readonly<{ from: string; to: string; kind: string }>;

export const breakCycles = (
  nodes: readonly CycleNode[],
  edges: readonly CycleEdge[],
): { edges: CycleEdge[]; broken: CycleEdge[] } => {
  const key = (e: CycleEdge): string => `${e.from}\t${e.to}\t${e.kind}`;
  const remaining = [...edges];
  const broken: CycleEdge[] = [];

  // DFS with gray/black states; a gray hit closes a cycle through the stack.
  // shortcut: restarts per broken edge (cycles are rare in real corpora) and
  // recursion depth = node count; upgrade to iterative only for huge corpora
  const findCycleEdges = (): CycleEdge[] | null => {
    const adj = new Map<string, CycleEdge[]>();
    for (const e of remaining) {
      const list = adj.get(e.from) ?? [];
      list.push(e);
      adj.set(e.from, list);
    }
    const state = new Map<string, "gray" | "black">();
    const stack: string[] = [];
    const visit = (n: string): CycleEdge[] | null => {
      state.set(n, "gray");
      stack.push(n);
      for (const e of adj.get(n) ?? []) {
        if (state.get(e.to) === "gray") {
          const cyc = stack.slice(stack.indexOf(e.to)); // v … n
          const cycEdges = [e]; // closing edge n→v; plus every edge between path neighbours (parallels included)
          for (let i = 0; i < cyc.length - 1; i++)
            for (const c of adj.get(cyc[i] ?? "") ?? []) if (c.to === cyc[i + 1]) cycEdges.push(c);
          return cycEdges;
        }
        if (!state.has(e.to)) {
          const found = visit(e.to);
          if (found) return found;
        }
      }
      stack.pop();
      state.set(n, "black");
      return null;
    };
    const starts = [...nodes.map((n) => n.path), ...remaining.flatMap((e) => [e.from, e.to])];
    for (const s of starts) {
      if (state.has(s)) continue;
      const found = visit(s);
      if (found) return found;
    }
    return null;
  };

  for (let cyc = findCycleEdges(); cyc; cyc = findCycleEdges()) {
    let max: CycleEdge | null = null;
    for (const e of cyc) if (!max || key(e) > key(max)) max = e;
    if (!max) continue; // unreachable: a cycle report always carries edges
    remaining.splice(remaining.indexOf(max), 1);
    broken.push(max);
  }
  return { edges: remaining, broken };
};
