import { expect, test } from "bun:test";
import { bundleEdges } from "../src/edge-bundler";
import { edgeId } from "../src/elk-adapter";

type Pt = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };
const p = (x: number, y: number): Pt => ({ x, y });
// V-H-V edge: vertical drop, horizontal run at y, vertical to target
const vhv = (x0: number, xs: number, xe: number, y: number, y1: number): Pt[] => [
  p(x0, 100),
  p(xs, y),
  p(xe, y),
  p(xe, y1),
];

test("(a) three staggered x-overlapping tracks → ONE trunk at mean y, zero member horizontals", () => {
  const polylines = new Map<string, Pt[]>([
    ["e1", vhv(100, 100, 500, 672, 900)], // track y=672 x 100→500
    ["e2", vhv(400, 400, 700, 712, 900)], // track y=712 x 400→700 (40 apart, x-overlap)
    ["e3", vhv(300, 300, 450, 692, 900)], // track y=692 sits ON the mean
  ]);
  const { pieces, trunks } = bundleEdges(polylines);
  expect(trunks).toEqual([{ kind: "", y: 692, x0: 100, x1: 700 }]); // mean of 672/692/712, union x
  // e1: prefix+stub / stub+suffix, collinear bend dropped
  expect(pieces.get("e1")).toEqual([
    [p(100, 100), p(100, 692)],
    [p(500, 692), p(500, 900)],
  ]);
  // e3 sits exactly on the trunk: zero-length stubs collapse to the plain sides
  expect(pieces.get("e3")).toEqual([
    [p(300, 100), p(300, 692)],
    [p(450, 692), p(450, 900)],
  ]);
  // no bundled member keeps a horizontal run
  for (const [id, ps] of pieces)
    for (const poly of ps)
      for (let i = 0; i + 1 < poly.length; i++) {
        const a = poly[i];
        const b = poly[i + 1];
        if (!a || !b) continue;
        expect(Math.abs(a.y - b.y), `${id} horizontal at ${i}`).toBeGreaterThan(0);
      }
});

test("(b) a lone horizontal run is identity — polyline passes through untouched", () => {
  const poly = vhv(10, 10, 400, 300, 800);
  const { pieces, trunks } = bundleEdges(new Map([["solo", poly]]));
  expect(trunks).toEqual([]);
  expect(pieces.get("solo")).toEqual([poly]);
});

test("(c) same band but x-disjoint runs stay identity (no false corridor)", () => {
  const a = vhv(10, 10, 100, 500, 800);
  const b = vhv(200, 200, 300, 510, 800);
  const { pieces, trunks } = bundleEdges(
    new Map([
      ["a", a],
      ["b", b],
    ]),
  );
  expect(trunks).toEqual([]);
  expect(pieces.get("a")).toEqual([a]);
  expect(pieces.get("b")).toEqual([b]);
});

test("(d) deterministic under input permutation", () => {
  const build = (order: string[]) =>
    new Map(
      order.map((id) => [
        id,
        id === "e1"
          ? vhv(100, 100, 500, 672, 900)
          : id === "e2"
            ? vhv(400, 400, 700, 712, 900)
            : vhv(300, 300, 450, 692, 900),
      ]),
    );
  const r1 = bundleEdges(build(["e1", "e2", "e3"]));
  const r2 = bundleEdges(build(["e3", "e1", "e2"]));
  expect(JSON.stringify({ t: r2.trunks, p: [...r2.pieces].sort() })).toBe(
    JSON.stringify({ t: r1.trunks, p: [...r1.pieces].sort() }),
  );
  expect(r2.trunks).toEqual([{ kind: "", y: 692, x0: 100, x1: 700 }]);
});

test("(e) per-kind grouping: soft run in a hard corridor stays identity, hard runs still bundle", () => {
  const e1 = { from: "a.md", to: "b.md", kind: "hard" };
  const e2 = { from: "c.md", to: "d.md", kind: "soft" };
  const e3 = { from: "e.md", to: "f.md", kind: "hard" };
  const softPoly: Pt[] = vhv(400, 400, 700, 712, 900); // soft track, same corridor band
  const polylines = new Map<string, Pt[]>([
    [edgeId(e1), vhv(100, 100, 500, 672, 900)], // hard track
    [edgeId(e2), softPoly],
    [edgeId(e3), vhv(300, 300, 450, 692, 900)], // hard track ON the hard mean
  ]);
  const { trunks, pieces } = bundleEdges(polylines, [e1, e2, e3]);
  expect(trunks).toEqual([{ kind: "hard", y: 682, x0: 100, x1: 500 }]); // mean of 672/692
  // the soft run is a lone run of its kind → identity, never joins a hard trunk
  expect(pieces.get(edgeId(e2))).toEqual([softPoly]);
  expect(pieces.get(edgeId(e1))).toEqual([
    [p(100, 100), p(100, 682)],
    [p(500, 682), p(500, 900)],
  ]);
});

test("(f) shared source + targets: stubs snap to card centres — one drop, N rises", () => {
  const rect = (x: number, y: number): Rect => ({ x, y, w: 80, h: 26 });
  const e1 = { from: "src.md", to: "t1.md", kind: "hard" };
  const e2 = { from: "src.md", to: "t2.md", kind: "hard" };
  const polylines = new Map<string, Pt[]>([
    [edgeId(e1), vhv(100, 100, 500, 672, 900)], // elk fan attach x=100
    [edgeId(e2), vhv(180, 180, 700, 712, 900)], // elk fan attach x=180
  ]);
  const rects = new Map<string, Rect>([
    ["src.md", { x: 80, y: 74, w: 120, h: 26 }], // centre x = 140
    ["t1.md", rect(460, 900)], // centre x = 500
    ["t2.md", rect(660, 900)], // centre x = 700
  ]);
  const { trunks, pieces } = bundleEdges(polylines, [e1, e2], rects);
  expect(trunks).toEqual([{ kind: "hard", y: 692, x0: 140, x1: 700 }]); // trunk starts at the drop
  // identical source stubs overlap into ONE drop line at the card centre
  expect(pieces.get(edgeId(e1))).toEqual([
    [p(140, 100), p(140, 692)],
    [p(500, 692), p(500, 900)],
  ]);
  expect(pieces.get(edgeId(e2))).toEqual([
    [p(140, 100), p(140, 692)],
    [p(700, 692), p(700, 900)],
  ]);
});

test("(g) no snap when the prefix bends — orthogonality survives, elk x kept", () => {
  const e1 = { from: "a.md", to: "b.md", kind: "hard" };
  const e2 = { from: "c.md", to: "d.md", kind: "hard" };
  const poly = [p(100, 100), p(150, 100), p(150, 672), p(500, 672), p(500, 900)];
  const rects = new Map<string, Rect>([
    ["a.md", { x: 80, y: 74, w: 120, h: 26 }], // centre x = 140 ≠ prefix bend x
  ]);
  const { pieces, trunks } = bundleEdges(
    new Map([
      [edgeId(e1), poly],
      [edgeId(e2), vhv(160, 160, 460, 682, 900)], // corridor mate
    ]),
    [e1, e2],
    rects,
  );
  expect(trunks).toEqual([{ kind: "hard", y: 677, x0: 150, x1: 500 }]);
  // prefix is a horizontal jog → no snap: stub keeps the elk bend x
  expect(pieces.get(edgeId(e1))).toEqual([
    [p(100, 100), p(150, 100), p(150, 677)],
    [p(500, 677), p(500, 900)],
  ]);
});

test("(h) snapped target stub consumes the pure-vertical suffix — no border jog", () => {
  // elk ends each edge straight on the wide target's bottom border at its own
  // x; the snapped centre stub REPLACES that vertical, so nothing of the old
  // suffix may survive (else a horizontal jogs along the target border)
  const e1 = { from: "a.md", to: "wide.md", kind: "hard" };
  const e2 = { from: "b.md", to: "wide.md", kind: "hard" };
  const polylines = new Map<string, Pt[]>([
    [edgeId(e1), [p(100, 742), p(100, 712), p(640, 712), p(640, 632)]],
    [edgeId(e2), [p(300, 742), p(300, 692), p(760, 692), p(760, 632)]],
  ]);
  const rects = new Map<string, Rect>([
    ["a.md", { x: 60, y: 742, w: 80, h: 26 }], // centre x = 100
    ["b.md", { x: 260, y: 742, w: 80, h: 26 }], // centre x = 300
    ["wide.md", { x: 500, y: 606, w: 400, h: 26 }], // centre x = 700, border y = 632
  ]);
  const { trunks, pieces } = bundleEdges(polylines, [e1, e2], rects);
  expect(trunks).toEqual([{ kind: "hard", y: 702, x0: 100, x1: 700 }]);
  // both members rise at the target centre — and NOTHING else: the replaced
  // elk suffix (its old attach x) must not leak back as a border horizontal
  expect(pieces.get(edgeId(e1))).toEqual([
    [p(100, 742), p(100, 702)],
    [p(700, 702), p(700, 632)],
  ]);
  expect(pieces.get(edgeId(e2))).toEqual([
    [p(300, 742), p(300, 702)],
    [p(700, 702), p(700, 632)],
  ]);
  for (const [id, ps] of pieces)
    for (const poly of ps)
      for (let i = 0; i + 1 < poly.length; i++) {
        const a = poly[i];
        const b = poly[i + 1];
        if (!a || !b) continue;
        expect(Math.abs(a.y - b.y), `${id} horizontal at ${i}`).toBeGreaterThan(0);
      }
});

test("edge with two bundled runs splits into three pieces (H-V-H through two corridors)", () => {
  const polylines = new Map<string, Pt[]>([
    // H-V-H: run1 y=100 x 50→150, vertical, run2 y=300 x 150→250
    ["s", [p(50, 100), p(150, 100), p(150, 300), p(250, 300)]],
    ["t1", vhv(0, 60, 140, 110, 700)], // bands with run1 (Δ10, x-overlap)
    ["t2", vhv(0, 160, 240, 310, 700)], // bands with run2
  ]);
  const { pieces, trunks } = bundleEdges(polylines);
  expect(trunks).toEqual([
    { kind: "", y: 105, x0: 50, x1: 150 },
    { kind: "", y: 305, x0: 150, x1: 250 },
  ]);
  expect(pieces.get("s")).toEqual([
    [p(50, 100), p(50, 105)],
    [p(150, 105), p(150, 305)],
    [p(250, 305), p(250, 300)],
  ]);
});

test("fp-noise elk coords still snap — no overshoot knee, no phantom collinear (D2/D3a)", () => {
  // verbatim homelab jitter: start/bend x of ONE vertical differ by ~1e-12,
  // strict equality missed the snap and kept elk's track beside the trunk
  // level: 678→668→663 up-past-and-back
  const e1 = { from: "a.md", to: "c.md", kind: "hard" };
  const e2 = { from: "b.md", to: "c.md", kind: "hard" };
  const rects = new Map<string, Rect>([
    ["a.md", { x: 2021.534, y: 678, w: 120, h: 26 }], // centre 2081.534
    ["b.md", { x: 1880.544, y: 678, w: 120, h: 26 }], // centre 1940.544
    ["c.md", { x: 1430, y: 452, w: 120, h: 26 }], // centre 1490
  ]);
  const { pieces, trunks } = bundleEdges(
    new Map<string, Pt[]>([
      [
        edgeId(e1),
        [
          p(2081.5339999999997, 678),
          p(2081.5340000000006, 668),
          p(1561.8880000000001, 668),
          p(1561.8879999999997, 478),
        ],
      ],
      [
        edgeId(e2),
        [
          p(1940.5440000000006, 678),
          p(1940.5440000000008, 662),
          p(1490.0000000002, 662),
          p(1489.9999999998, 478),
        ],
      ],
    ]),
    [e1, e2],
    rects,
  );
  expect(trunks).toEqual([{ kind: "hard", y: 665, x0: 1490, x1: 2081.534 }]);
  // both edges snap both ends: border→trunk stubs only, shared target stub
  expect(pieces.get(edgeId(e1))).toEqual([
    [p(2081.534, 678), p(2081.534, 665)],
    [p(1490, 665), p(1490, 478)],
  ]);
  expect(pieces.get(edgeId(e2))).toEqual([
    [p(1940.544, 678), p(1940.544, 665)],
    [p(1490, 665), p(1490, 478)],
  ]);
});

test("D1: bottom trunk x == top exit x on one card — fewer side (top) slides 16px, raw chain stays orthogonal", () => {
  // verbatim thm012 ruling case: two bundled edges rise to c's bottom centre
  // while c's own exit leaves the top at the same x — one piercing line
  const e1 = { from: "a.md", to: "c.md", kind: "hard" };
  const e3 = { from: "d.md", to: "c.md", kind: "hard" };
  const e2 = { from: "c.md", to: "b.md", kind: "hard" }; // pure vertical, no run → never bundled
  const rects = new Map<string, Rect>([
    ["a.md", { x: 310.138, y: 678, w: 120, h: 26 }], // centre 370.138
    ["d.md", { x: 843.262, y: 678, w: 120, h: 26 }], // centre 903.262
    ["c.md", { x: 1430, y: 452, w: 120, h: 26 }], // centre 1490, span 1430..1550
    ["b.md", { x: 1430, y: 226, w: 120, h: 26 }],
  ]);
  const { pieces, trunks } = bundleEdges(
    new Map<string, Pt[]>([
      [
        edgeId(e1),
        [
          p(370.1379999999997, 678),
          p(370.13800000000015, 658),
          p(1490.0000000002, 658),
          p(1489.9999999998, 478),
        ],
      ],
      [
        edgeId(e3),
        [p(903.2620000000001, 678), p(903.262, 668), p(1490.00000005, 668), p(1489.99999995, 478)],
      ],
      [edgeId(e2), [p(1490.0000000003, 452), p(1489.9999999997, 252)]],
    ]),
    [e1, e3, e2],
    rects,
  );
  // the outgoing side (1 attachment) yields to the incoming pair: exit slides to 1506
  expect(pieces.get(edgeId(e2))).toEqual([[p(1506, 452), p(1506, 252)]]);
  // incoming trunk stubs stay at the centre — and the old 658 knee is gone
  expect(pieces.get(edgeId(e1))).toEqual([
    [p(370.138, 678), p(370.138, 663)],
    [p(1490, 663), p(1490, 478)],
  ]);
  expect(pieces.get(edgeId(e3))).toEqual([
    [p(903.262, 678), p(903.262, 663)],
    [p(1490, 663), p(1490, 478)],
  ]);
  expect(trunks).toEqual([{ kind: "hard", y: 663, x0: 370.138, x1: 1490 }]);
});

test("D1: raw end with a bend slides only its vertical chain — the far attach keeps its x", () => {
  const e1 = { from: "a.md", to: "c.md", kind: "hard" };
  const e3 = { from: "d.md", to: "c.md", kind: "hard" };
  const e2 = { from: "c.md", to: "b.md", kind: "hard" }; // bent raw exit: vertical, H, vertical
  const rects = new Map<string, Rect>([
    ["a.md", { x: 310.138, y: 678, w: 120, h: 26 }],
    ["d.md", { x: 843.262, y: 678, w: 120, h: 26 }],
    ["c.md", { x: 1430, y: 452, w: 120, h: 26 }],
    ["b.md", { x: 1380, y: 226, w: 120, h: 26 }], // centre 1440
  ]);
  const { pieces } = bundleEdges(
    new Map<string, Pt[]>([
      [edgeId(e1), [p(370.138, 678), p(370.138, 658), p(1490, 658), p(1490, 478)]],
      [edgeId(e3), [p(903.262, 678), p(903.262, 668), p(1490, 668), p(1490, 478)]],
      [edgeId(e2), [p(1490, 452), p(1490, 350), p(1440, 350), p(1440, 252)]],
    ]),
    [e1, e3, e2],
    rects,
  );
  // only the start chain (452→350 at x 1490) slides; the 1440 attach survives
  expect(pieces.get(edgeId(e2))).toEqual([
    [p(1506, 452), p(1506, 350), p(1440, 350), p(1440, 252)],
  ]);
});

test("empty and degenerate polylines survive (unrouted/self-loop edges)", () => {
  const { pieces, trunks } = bundleEdges(
    new Map([
      ["void", []],
      ["dot", [p(1, 1)]],
    ]),
  );
  expect(trunks).toEqual([]);
  expect(pieces.get("void")).toEqual([[]]);
  expect(pieces.get("dot")).toEqual([[p(1, 1)]]);
});
