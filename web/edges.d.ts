export type Edge = Readonly<{ from: string; to: string; kind: string }>;
export declare function mergeEdges(edges: readonly Edge[]): Edge[];
