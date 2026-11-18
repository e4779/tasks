// Pure ELK bridge: viewer nodes/edges → ELK JSON, ELK result → card rects
// (top-left + size, exactly what the svg painter draws) + edge polylines.
// No DOM, no ELK import — only mapping math, unit-tested against a fixture
// result object.

/** @typedef {Readonly<{id: string}>} Node */
/** @typedef {Readonly<{from: string, to: string, kind: string}>} Edge */
/** @typedef {Readonly<{w: number, h: number}>} Size */
/** @typedef {Readonly<{x: number, y: number}>} Pt */
/** @typedef {Readonly<{id: string, x: number, y: number, width?: number, height?: number}>} ElkChild */
/** @typedef {Readonly<{id: string, sections?: readonly {startPoint: Pt, endPoint: Pt, bendPoints?: readonly Pt[]}[]}[] | null>} ElkEdges */

// stable edge id shared by graph building and polyline lookup (parallel
// soft/hard edges between the same pair must not collide)
export const edgeId = (e) => `${e.from}\t${e.to}\t${e.kind}`;

/**
 * @param {readonly Node[]} nodes id-keyed
 * @param {ReadonlyMap<string, Size>} sizes card size per node id (measureText)
 * @param {readonly Edge[]} edges ALL edges — ELK layered breaks cycles internally
 *   but still routes them (that is why cycles need no hand path)
 * @param {number} aspect container w/h — layered stretches towards it, so the
 *   viewBox meet-fit covers both axes of whatever viewport is watching
 */
export const buildElkGraph = (nodes, sizes, edges, aspect) => ({
  id: "root",
  layoutOptions: {
    "elk.algorithm": "layered",
    "elk.edgeRouting": "ORTHOGONAL", // right angles, ≤2 bends per edge
    // layout space vs data space: data edges run dependent(from) → blocker(to);
    // UP points layered edges upward, so the blocker (target) renders upstream
    // — above the dependent — without touching data direction or polylines
    "elk.direction": "UP",
    "elk.aspectRatio": String(aspect),
    "elk.spacing.nodeNode": "230", // wide: merged single-line graph is narrow — ac2 needs ≥0.5 cover at wide-short viewports
    "elk.layered.spacing.nodeNodeBetweenLayers": "56",
    // nodeSize.constraints deliberately NOT set: width/height hold as given
  },
  children: nodes.map((n) => {
    const s = sizes.get(n.id) ?? { w: 40, h: 26 }; // min-card fallback keeps ELK off NaN
    return { id: n.id, width: s.w, height: s.h };
  }),
  edges: edges.map((e) => ({ id: edgeId(e), sources: [e.from], targets: [e.to] })),
});

/** polyline → SVG path d: M then L commands, space-separated pairs */
export const polyToD = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join("");

/**
 * ELK speaks top-left + width/height; that IS the svg card rect (transform
 * translate + rect w/h), so positions pass through untouched.
 * @param {Readonly<{children: readonly ElkChild[], edges?: ElkEdges}>} result ELK layout output
 * @returns {{rects: Map<string, Pt & Size>, polylines: Map<string, readonly Pt[]>}}
 */
export const mapLayout = (result) => ({
  rects: new Map(
    result.children.map((n) => [n.id, { x: n.x, y: n.y, w: n.width ?? 0, h: n.height ?? 0 }]),
  ),
  polylines: new Map(
    (result.edges ?? []).map((e) => {
      const s = e.sections?.[0]; // flat graphs route one section per edge
      return [e.id, s ? [s.startPoint, ...(s.bendPoints ?? []), s.endPoint] : []];
    }),
  ),
});
