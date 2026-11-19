// Pure ELK bridge: viewer nodes/edges → ELK JSON, ELK result → card rects
// (top-left + size, exactly what the svg painter draws) + edge polylines.
// No ELK import — only mapping math, unit-tested against a fixture result.

export type Pt = Readonly<{ x: number; y: number }>;
export type Size = Readonly<{ w: number; h: number }>;
export type ElkNodeRef = Readonly<{ id: string }>;
export type ElkEdgeRef = Readonly<{ from: string; to: string; kind: string }>;
export type ElkChild = Readonly<{
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}>;
export type ElkSection = Readonly<{ startPoint: Pt; endPoint: Pt; bendPoints?: readonly Pt[] }>;
export type ElkEdges = ReadonlyArray<Readonly<{
  id: string;
  sections?: ReadonlyArray<ElkSection> | null;
} | null> | null> | null;
export type ElkResult = Readonly<{ children?: readonly ElkChild[]; edges?: ElkEdges }>;

// stable edge id shared by graph building and polyline lookup (parallel
// soft/hard edges between the same pair must not collide)
export const edgeId = (e: ElkEdgeRef): string => `${e.from}\t${e.to}\t${e.kind}`;

/**
 * @param aspect container w/h — layered stretches towards it, so the
 *   viewBox meet-fit covers both axes of whatever viewport is watching
 */
export const buildElkGraph = (
  nodes: readonly ElkNodeRef[],
  sizes: ReadonlyMap<string, Size>,
  edges: readonly ElkEdgeRef[],
  aspect: number,
) => ({
  id: "root",
  // zero edges → rectPacking: layered stacks the whole corpus into one rank
  // (an overlap wall); rectPacking packs the rects in 2D and routes nothing —
  // there is nothing to route. Any edge at all → layered (it already stacks
  // disconnected components side by side).
  layoutOptions:
    edges.length === 0
      ? {
          "elk.algorithm": "org.eclipse.elk.rectpacking",
          // rectPacking's first-fit rows overshoot the asked aspect (order- and
          // width-distribution-dependent, observed ×1.2–×1.7), so ask for a
          // narrower target and let the overshoot land inside the ac2 window
          // shortcut: /1.5 calibrated on the 80-card corpus at aspects 1.3–2.87;
          // recalibrate (or find the exact packing-strategy option) if a corpus misses ac2
          "elk.aspectRatio": String(aspect / 1.5),
        }
      : {
          // elkjs 0.12.1 layered IGNORES elk.aspectRatio once the graph has
          // several components (homelab: 44 components → world aspect 7.19 at any
          // ask) — components.ts repacks elk's own component boxes post-layout
          "elk.algorithm": "layered",
          "elk.edgeRouting": "ORTHOGONAL", // right angles, ≤2 bends per edge
          // layout space vs data space: data edges run dependent(from) → blocker(to);
          // UP points layered edges upward, so the blocker (target) renders upstream
          // — above the dependent — without touching data direction or polylines
          "elk.direction": "UP",
          "elk.aspectRatio": String(aspect),
          "elk.spacing.nodeNode": "230", // wide: merged single-line graph is narrow — ac2 needs ≥0.5 cover at wide-short viewports
          "elk.layered.spacing.nodeNodeBetweenLayers": "200",
          // nodeSize.constraints deliberately NOT set: width/height hold as given
        },
  children: nodes.map((n) => {
    const s = sizes.get(n.id) ?? { w: 40, h: 26 }; // min-card fallback keeps ELK off NaN
    return { id: n.id, width: s.w, height: s.h };
  }),
  edges: edges.map((e) => ({ id: edgeId(e), sources: [e.from], targets: [e.to] })),
});

/** polyline → SVG path d: M then L commands, space-separated pairs */
export const polyToD = (pts: readonly Pt[]): string =>
  pts.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join("");

/**
 * ELK speaks top-left + width/height; that IS the svg card rect (transform
 * translate + rect w/h), so positions pass through untouched.
 * @returns rects (node id → rect) and polylines (edge id → points)
 */
export const mapLayout = (
  result: ElkResult,
): {
  rects: Map<string, Pt & Size>;
  polylines: Map<string, readonly Pt[]>;
} => ({
  rects: new Map(
    (result.children ?? []).map((n) => [
      n.id,
      { x: n.x ?? 0, y: n.y ?? 0, w: n.width ?? 0, h: n.height ?? 0 },
    ]),
  ),
  polylines: new Map(
    (result.edges ?? []).map((e) => {
      const s = e?.sections?.[0]; // flat graphs route one section per edge
      return [e?.id ?? "", s ? [s.startPoint, ...(s.bendPoints ?? []), s.endPoint] : []];
    }),
  ),
});
