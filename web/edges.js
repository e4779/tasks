// Render-prep merge: the data model (snapshot/buildGraph) keeps every edge;
// the viewer draws ONE line per relation (AC7).
// 1. same-direction parallels (soft+hard between one ordered pair) collapse
//    to the strongest kind — hard > soft
// 2. edges in BOTH directions between an unordered pair (2-cycle) collapse
//    to ONE edge kind "cycle" — red solid, no direction semantics

/** @typedef {Readonly<{from: string, to: string, kind: string}>} Edge */

const RANK = { soft: 0, hard: 1 };

/**
 * @param {readonly Edge[]} edges
 * @returns {Edge[]} merged list, stable first-occurrence order; a mutual
 *   pair emits its cycle edge at the lexicographically-smaller direction's
 *   slot (from < to), so the output is deterministic for any input order
 */
export const mergeEdges = (edges) => {
  const dir = new Map(); // "from\tto" → strongest edge
  for (const e of edges) {
    const k = `${e.from}\t${e.to}`;
    const prev = dir.get(k);
    if (!prev || (RANK[e.kind] ?? 0) > (RANK[prev.kind] ?? 0)) dir.set(k, e);
  }
  const out = [];
  for (const e of dir.values()) {
    // a self-loop's reverse key is itself: it must pass through untouched
    const mutual = e.from !== e.to && dir.has(`${e.to}\t${e.from}`);
    if (!mutual) out.push(e);
    else if (e.from < e.to) out.push({ from: e.from, to: e.to, kind: "cycle" });
  }
  return out;
};
