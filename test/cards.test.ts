import { describe, expect, test } from "bun:test";
import { CARD_FONT, cardSize, intersect, pointOnRect, serverCtx } from "../src/cards";

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

describe("serverCtx (server-side measureText for the SSR graph)", () => {
  test("Helvetica widths: wide glyphs measure wider than narrow ones", () => {
    const w = (t: string) => serverCtx.measureText(t).width;
    expect(w("WWW")).toBeGreaterThan(w("iii") * 2);
    expect(w("m")).toBeGreaterThan(w("i") * 3);
    expect(w("0")).toBeCloseTo(556 * (CARD_FONT / 1000), 5); // digits are 556 units
  });
  test("non-table glyphs (Cyrillic) take the 0.6em fallback, generous not tight", () => {
    expect(serverCtx.measureText("ж").width).toBeCloseTo(0.6 * CARD_FONT, 9);
  });
  test("cardSize with serverCtx: measure + 24 padding, min 40", () => {
    expect(cardSize("package-publication", serverCtx)).toEqual({
      w: serverCtx.measureText("package-publication").width + 24,
      h: 26,
    });
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
