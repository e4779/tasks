export type PosNode = Readonly<{ x?: number; y?: number }>;
export type BBox = Readonly<{ x0: number; x1: number; y0: number; y1: number }>;
export type Dim = Readonly<{ w: number; h: number }>;
export declare function bboxOf(nodes: readonly PosNode[]): BBox | null;
export declare function fitStretch(
  bbox: BBox,
  dim: Dim,
  opts?: { pad?: number; coverX?: number; coverY?: number },
): { sx: number; sy: number };
