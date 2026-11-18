import { describe, expect, test } from "bun:test";
import { cardSize, intersect, pointOnRect, trimEnds } from "../web/cards.js";

// measuring stub: 0.5 * fontsize per char, so width scales with the font like
// a real canvas
const mkCtx = () => {
  const ctx = {
    font: "",
    measureText: (t: string) => ({ width: (t.length * Number.parseFloat(ctx.font)) / 2 }),
  };
  return ctx;
};
const T7 = "1234567"; // 7 chars → 42px at font 12

describe("cardSize", () => {
  test("w = measure + padding (min 40), h constant 26 — elk-space px", () => {
    const ctx = mkCtx();
    expect(cardSize(T7, ctx)).toEqual({ w: 66, h: 26 });
    expect(cardSize("ab", ctx)).toEqual({ w: 40, h: 26 }); // under the min
  });
});

describe("intersect", () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  test("overlap in both axes intersects; touching edges do not", () => {
    expect(intersect(a, { x: 5, y: 5, w: 10, h: 10 })).toBeTrue();
    expect(intersect(a, { x: 10, y: 0, w: 10, h: 10 })).toBeFalse(); // edge touch
    expect(intersect(a, { x: 20, y: 0, w: 10, h: 10 })).toBeFalse();
    expect(intersect(a, { x: 2, y: 20, w: 10, h: 10 })).toBeFalse();
    expect(intersect(a, { x: 2, y: 2, w: 2, h: 2 })).toBeTrue(); // contained
  });
});

describe("pointOnRect", () => {
  const r = { x: 10, y: 20, w: 30, h: 10 }; // [10..40]×[20..30]
  test("inside, edge and corner all count as ON", () => {
    expect(pointOnRect({ x: 25, y: 25 }, r, 1)).toBeTrue(); // centre
    expect(pointOnRect({ x: 25, y: 20 }, r, 0)).toBeTrue(); // edge, eps 0
    expect(pointOnRect({ x: 10, y: 20 }, r, 1)).toBeTrue(); // corner
    expect(pointOnRect({ x: 40, y: 30 }, r, 1)).toBeTrue();
  });
  test("≤eps outside counts as ON; beyond eps and the audit's 8px float fail", () => {
    expect(pointOnRect({ x: 25, y: 20.5 }, r, 1)).toBeTrue();
    expect(pointOnRect({ x: 25, y: 31 }, r, 1)).toBeTrue(); // exactly eps: touching
    expect(pointOnRect({ x: 25, y: 31.5 }, r, 1)).toBeFalse(); // beyond eps
    expect(pointOnRect({ x: 25, y: 38 }, r, 1)).toBeFalse(); // 8px short (audit)
    expect(pointOnRect({ x: 2, y: 25 }, r, 1)).toBeFalse(); // 8px lateral miss
  });
});

describe("trimEnds", () => {
  // legacy pure gate fn: documents the AC11 reattach rule from the canvas era;
  // the svg painter never calls it (one coordinate world — ends cannot detach)
  const src = { x: 100, y: 21, w: 40, h: 8 };
  const dst = { x: 100, y: 101, w: 40, h: 8 };
  const orthogonal = (poly: { x: number; y: number }[]) =>
    poly.slice(0, -1).every((p, i) => {
      const q = poly[i + 1];
      return !!q && (p.x === q.x || p.y === q.y);
    });

  test("the audit's 8px float: both ends clamp onto the rect boundary", () => {
    const poly = trimEnds(
      [
        { x: 120, y: 13 }, // 8px above the src top
        { x: 120, y: 60 },
        { x: 120, y: 93 }, // 8px above the dst top
      ],
      src,
      dst,
    );
    expect(poly).toEqual([
      { x: 120, y: 21 },
      { x: 120, y: 60 },
      { x: 120, y: 101 },
    ]);
    const [a] = poly;
    const z = poly.at(-1);
    expect(a && pointOnRect(a, src, 1)).toBeTrue();
    expect(z && pointOnRect(z, dst, 1)).toBeTrue();
  });

  test("lateral miss (audit #3): clamp + elbow, every segment stays axis-aligned", () => {
    const poly = trimEnds(
      [
        { x: 90, y: 25 }, // 10px LEFT of the src x-range
        { x: 90, y: 60 },
        { x: 120, y: 60 },
        { x: 120, y: 93 },
      ],
      src,
      dst,
    );
    expect(poly[0]).toEqual({ x: 100, y: 25 }); // onto the left edge
    expect(orthogonal(poly)).toBeTrue();
    const end = poly.at(-1);
    expect(end && pointOnRect(end, dst, 1)).toBeTrue();
  });

  test("a two-point edge clamped at both ends still comes out orthogonal", () => {
    const poly = trimEnds(
      [
        { x: 90, y: 13 },
        { x: 150, y: 93 },
      ],
      src,
      dst,
    );
    expect(orthogonal(poly)).toBeTrue();
    const [a] = poly;
    const z = poly.at(-1);
    expect(a && pointOnRect(a, src, 1)).toBeTrue();
    expect(z && pointOnRect(z, dst, 1)).toBeTrue();
  });

  test("short polylines pass through; already-attached ends are untouched", () => {
    expect(trimEnds([{ x: 0, y: 0 }], src, dst)).toEqual([{ x: 0, y: 0 }]);
    const ok = [
      { x: 120, y: 21 },
      { x: 120, y: 101 },
    ];
    expect(trimEnds(ok, src, dst)).toEqual(ok);
  });
});
