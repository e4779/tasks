import { expect, test } from "bun:test";
import type { Rect } from "../src/cards";
import { packComponents, packDeltas } from "../src/components";

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

test("packDeltas: shelf-packs height-desc, wraps rows at sqrt(area×aspect)", () => {
  const boxes = new Map<number, Rect>([
    [0, rect(1000, 1000, 100, 100)], // tallest
    [1, rect(0, 0, 100, 60)],
    [2, rect(500, 500, 100, 40)],
  ]);
  const d = packDeltas(boxes, 2); // area 20000 → target = sqrt(40000) = 200
  expect(d.get(0)).toEqual({ dx: -1000, dy: -1000 }); // tallest box opens row 1 at the origin
  // box 1 (60 tall) would land at x=160; 160+100=260 > 200 target → wraps to
  // row 2: y = row-1 height 100 + Y_GAP 64
  expect(d.get(1)?.dy).toBe(164);
  // box 2 (40 tall) follows in row 2 at x=160, wraps again → row 3
  expect(d.get(2)).toEqual({ dx: -500, dy: 288 - 500 });
});

test("packComponents: rigid translation — rects, polylines and inner geometry move together", () => {
  const rects = new Map<string, Rect>([
    ["a.md", rect(0, 0, 80, 26)],
    ["b.md", rect(0, 60, 80, 26)], // one component (edge a→b), tall elk box
    ["c.md", rect(500, 0, 80, 26)], // second component, elk put it far right
  ]);
  const polylines = new Map<string, { x: number; y: number }[]>([
    [
      "a.md\tb.md\thard",
      [
        { x: 40, y: 26 },
        { x: 40, y: 60 },
      ],
    ],
  ]);
  const edges = [{ from: "a.md", to: "b.md", kind: "hard" }];
  const { rects: r2, polylines: p2 } = packComponents(rects, polylines, edges, 2);
  // a/b keep their inner relationship; c gets packed beside them, not 500px away
  expect(r2.get("a.md")).toEqual(rect(0, 0, 80, 26));
  expect(r2.get("b.md")).toEqual(rect(0, 60, 80, 26));
  expect(p2.get("a.md\tb.md\thard")).toEqual([
    { x: 40, y: 26 },
    { x: 40, y: 60 },
  ]);
  const c = r2.get("c.md");
  expect(c).toBeDefined();
  // {a,b} box (80×86) opens row 1; {c} (80 wide) would need 140+80=220 > the
  // ~134 target → wraps below: x back to 0, y = 86 + Y_GAP
  expect(c).toEqual(rect(0, 86 + 64, 80, 26));
});

test("packComponents: two tall components stack with a ≥BAND+20 y-gap (no bundler coupling)", () => {
  const rects = new Map<string, Rect>([
    ["a.md", rect(0, 0, 80, 200)],
    ["b.md", rect(300, 0, 80, 200)], // elk side by side; aspect 2 target wants stacking
  ]);
  const { rects: r2 } = packComponents(rects, new Map(), [], 0.05); // extreme aspect forces wrap
  const a = r2.get("a.md");
  const b = r2.get("b.md");
  expect(a).toBeDefined();
  expect(b).toBeDefined();
  if (a && b) {
    const gap = Math.abs(b.y - (a.y + 200));
    expect(gap).toBeGreaterThanOrEqual(64); // Y_GAP > bundler BAND 40 + detector 20
  }
});
