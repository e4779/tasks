export type CardNode = Readonly<{ title: string; path?: string; x?: number; y?: number }>;
export type Rect = Readonly<{ x: number; w: number; y: number; h: number }>;
export type Pt = Readonly<{ x: number; y: number }>;
export type MeasureCtx = Readonly<{
  font: string;
  measureText: (text: string) => { width: number };
}>;
export declare const CARD_FONT: 12;
export declare const CARD_H: 26;
export declare function cardSize(title: string, ctx: MeasureCtx): { w: number; h: number };
export declare function intersect(a: Rect, b: Rect): boolean;
export declare function pointOnRect(p: Pt, r: Rect, eps?: number): boolean;
export declare function trimEnds(poly: readonly Pt[], src: Rect, dst: Rect): Pt[];
