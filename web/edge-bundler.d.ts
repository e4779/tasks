export type Pt = Readonly<{ x: number; y: number }>;
export type Trunk = Readonly<{ y: number; x0: number; x1: number }>;
export declare const BAND: number;
export declare function bundleEdges(polylines: ReadonlyMap<string, readonly Pt[]>): {
  pieces: Map<string, Pt[][]>;
  trunks: Trunk[];
};
