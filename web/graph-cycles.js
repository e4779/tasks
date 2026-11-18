/**
 * @typedef {Readonly<{from: string, to: string, kind: string}>} Edge
 * @typedef {Readonly<{path: string}>} NodeRef
 */

/**
 * Remove one edge per cycle until the edge set is acyclic — force-graph's
 * dagMode throws on cycles and the layout dies. Deterministic: each cycle's
 * max edge by `${from}\t${to}\t${kind}` is the one broken; the caller renders
 * broken edges separately so cycles stay visible, just excluded from layering.
 * @param {Readonly<NodeRef[]>} nodes
 * @param {Readonly<Edge[]>} edges
 * @returns {{ edges: Edge[], broken: Edge[] }}
 */
export const breakCycles = (nodes, edges) => {
  const key = (e) => `${e.from}\t${e.to}\t${e.kind}`;
  const remaining = [...edges];
  const broken = [];

  // DFS with gray/black states; a gray hit closes a cycle through the stack.
  // shortcut: restarts per broken edge (cycles are rare in real corpora) and
  // recursion depth = node count; upgrade to iterative only for huge corpora
  const findCycleEdges = () => {
    const adj = new Map();
    for (const e of remaining) {
      const list = adj.get(e.from) ?? [];
      list.push(e);
      adj.set(e.from, list);
    }
    const state = new Map();
    const stack = [];
    const visit = (n) => {
      state.set(n, "gray");
      stack.push(n);
      for (const e of adj.get(n) ?? []) {
        if (state.get(e.to) === "gray") {
          const cyc = stack.slice(stack.indexOf(e.to)); // v … n
          const cycEdges = [e]; // closing edge n→v; plus every edge between path neighbours (parallels included)
          for (let i = 0; i < cyc.length - 1; i++)
            for (const c of adj.get(cyc[i]) ?? []) if (c.to === cyc[i + 1]) cycEdges.push(c);
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
    let max = cyc[0];
    for (const e of cyc) if (key(e) > key(max)) max = e;
    remaining.splice(remaining.indexOf(max), 1);
    broken.push(max);
  }
  return { edges: remaining, broken };
};
