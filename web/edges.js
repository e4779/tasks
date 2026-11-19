// Render-prep merge: the data model (snapshot/buildGraph) keeps every edge;
// the viewer draws ONE line per relation (AC7).
// 1. same-direction parallels (soft+hard between one ordered pair) collapse
//    to the strongest kind — hard > soft
// 2. hard edges in BOTH directions between a pair = a genuine deadlock →
//    ONE edge kind "cycle" — red solid, no direction semantics (ac7)
// 3. SOFT edges in both directions are NOT a cycle: mutual mentions are one
//    undirected soft relation — the strongest soft wins, stays dashed gray.
//    A red cycle must not be born from prose mentions (operator, 2026-11-19:
//    package-publication ↔ ponytail-user-level cross-links painted as a
//    "cycle" while neither card blocks the other)

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
  const emitted = new Set(); // directional keys already merged into an output edge
  for (const e of dir.values()) {
    if (emitted.has(`${e.from}\t${e.to}`)) continue;
    const rev = dir.get(`${e.to}\t${e.from}`); // strongest opposite-direction edge
    const selfLoop = e.from === e.to;
    // cycle only when HARD points both ways — a soft-only mutual pair is a
    // bidirectional mention, not a deadlock
    if (!selfLoop && rev && e.kind === "hard" && rev.kind === "hard") {
      const [a, b] = e.from < e.to ? [e, rev] : [rev, e];
      out.push({ from: a.from, to: a.to, kind: "cycle" });
      emitted.add(`${a.from}\t${a.to}`);
      emitted.add(`${b.from}\t${b.to}`);
      continue;
    }
    if (!selfLoop && rev) {
      // mutual with at least one hard: the hard direction wins outright
      const hard = e.kind === "hard" ? e : rev.kind === "hard" ? rev : null;
      if (hard) {
        out.push(hard);
        emitted.add(`${hard.from}\t${hard.to}`);
        emitted.add(`${hard.to}\t${hard.from}`);
        continue;
      }
      // soft+soft mutual: one undirected soft, emitted at the smaller slot
      const [a, b] = e.from < e.to ? [e, rev] : [rev, e];
      out.push({ from: a.from, to: a.to, kind: "soft" });
      emitted.add(`${a.from}\t${a.to}`);
      emitted.add(`${b.from}\t${b.to}`);
      continue;
    }
    out.push(e);
    emitted.add(`${e.from}\t${e.to}`);
  }
  return out;
};
