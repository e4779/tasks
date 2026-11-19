export type Pt = Readonly<{ x: number; y: number }>;
export type Rect = Readonly<{ x: number; y: number; w: number; h: number }>;
export type BundleEdge = Readonly<{ from: string; to: string; kind: string }>;
export type Trunk = Readonly<{ y: number; x0: number; x1: number; kind: string }>;
export declare const BAND: number;
export declare function bundleEdges(
  polylines: ReadonlyMap<string, readonly Pt[]>,
  edges?: readonly BundleEdge[],
  rects?: ReadonlyMap<string, Rect>,
): {
  pieces: Map<string, Pt[][]>;
  trunks: Trunk[];
};
