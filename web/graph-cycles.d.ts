export type CycleNode = Readonly<{ path: string }>;
export type CycleEdge = Readonly<{ from: string; to: string; kind: string }>;
export declare function breakCycles(
  nodes: readonly CycleNode[],
  edges: readonly CycleEdge[],
): { edges: CycleEdge[]; broken: CycleEdge[] };
