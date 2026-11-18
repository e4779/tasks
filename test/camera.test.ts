import { describe, expect, test } from "bun:test";
import { bboxOf, fitStretch } from "../web/camera.js";

describe("bboxOf", () => {
  test("bounds of positioned nodes; non-numeric coords skipped", () => {
    expect(
      bboxOf([
        { x: -114, y: -120 },
        { x: 67, y: 120 },
        { x: 0, y: 0 },
      ]),
    ).toEqual({
      x0: -114,
      x1: 67,
      y0: -120,
      y1: 120,
    });
    expect(bboxOf([{ x: 1, y: 2 }, {}])).toEqual({ x0: 1, x1: 1, y0: 2, y1: 2 });
  });
  test("empty or positionless input is null", () => {
    expect(bboxOf([])).toBeNull();
    expect(bboxOf([{}, { x: 1 }])).toBeNull();
  });
});

describe("fitStretch", () => {
  // the corpus reality: tall-narrow dag (181x240 engine) in a wide canvas
  const wide = { w: 1562, h: 547 };
  const dag = { x0: -114, x1: 67, y0: -120, y1: 120 };

  test("stretches only the slack axis; fit coverage meets the AC floors", () => {
    const { sx, sy } = fitStretch(dag, wide);
    expect(sx).toBeGreaterThan(1);
    expect(sy).toBe(1); // height already binds the fit
    const k = Math.min((wide.w - 80) / 181, (wide.h - 80) / 240);
    expect((k * 181 * sx) / wide.w).toBeGreaterThanOrEqual(0.5); // AC2 width floor
    expect((k * 240) / wide.h).toBeGreaterThanOrEqual(0.7); // AC2 height floor
  });

  test("stretched axis stays slack — nothing clips at the fit scale", () => {
    const { sx } = fitStretch(dag, wide);
    const k = Math.min((wide.w - 80) / (181 * sx), (wide.h - 80) / 240);
    expect(k * 181 * sx).toBeLessThanOrEqual(wide.w);
  });

  test("mirror case: wide-short graph in a tall canvas stretches y", () => {
    const tall = { w: 547, h: 1562 };
    const flat = { x0: -120, x1: 120, y0: -114, y1: 67 };
    const { sx, sy } = fitStretch(flat, tall);
    expect(sy).toBeGreaterThan(1);
    expect(sx).toBe(1);
  });

  test("square graph in a square canvas needs no stretch", () => {
    const { sx, sy } = fitStretch({ x0: -100, x1: 100, y0: -100, y1: 100 }, { w: 800, h: 800 });
    expect(sx).toBe(1);
    expect(sy).toBe(1);
  });

  test("degenerate extents and tiny canvases never yield factors below 1", () => {
    expect(fitStretch({ x0: 0, x1: 100, y0: 5, y1: 5 }, wide)).toEqual({ sx: 1, sy: 1 });
    const tiny = fitStretch(dag, { w: 10, h: 10 }); // dim < 2*pad
    expect(tiny.sx).toBeGreaterThanOrEqual(1);
    expect(tiny.sy).toBeGreaterThanOrEqual(1);
  });
});
