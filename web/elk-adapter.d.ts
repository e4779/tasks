export type ElkNode = Readonly<{ id: string }>;
export type ElkEdge = Readonly<{ from: string; to: string; kind: string }>;
export type Size = Readonly<{ w: number; h: number }>;
export type Pt = Readonly<{ x: number; y: number }>;
export type ElkRect = Readonly<{ x: number; y: number; w: number; h: number }>;
export type ElkSection = Readonly<{
  startPoint: Pt;
  endPoint: Pt;
  bendPoints?: readonly Pt[];
}>;
export type ElkResult = Readonly<{
  children: readonly {
    id: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
  }[];
  edges?: readonly { id: string; sections?: readonly ElkSection[] }[] | null;
}>;
export declare function edgeId(e: ElkEdge): string;
export declare function buildElkGraph(
  nodes: readonly ElkNode[],
  sizes: ReadonlyMap<string, Size>,
  edges: readonly ElkEdge[],
  aspect: number,
): {
  id: string;
  layoutOptions: Record<string, string>;
  children: { id: string; width: number; height: number }[];
  edges: { id: string; sources: string[]; targets: string[] }[];
};
export declare function polyToD(pts: readonly Pt[]): string;
export declare function mapLayout(result: ElkResult): {
  rects: Map<string, ElkRect>;
  polylines: Map<string, readonly Pt[]>;
};
