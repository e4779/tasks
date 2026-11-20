import { expect, test } from "bun:test";
import { addHops, bundleEdges } from "../src/edge-bundler";
import { edgeId, polyToD } from "../src/elk-adapter";

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
  expect(trunks).toEqual([{ kind: "hard", y: 692, x0: 148, x1: 692 }]); // trunk starts at the outbound stem
  // single-stem: BOTH members leave at the outbound stem (centre+8), targets
  // receive at their inbound stems (centre−8) — one line per side, no cascade
  expect(pieces.get(edgeId(e1))).toEqual([
    [p(148, 100), p(148, 692)],
    [p(492, 692), p(492, 900)],
  ]);
  expect(pieces.get(edgeId(e2))).toEqual([
    [p(148, 100), p(148, 692)],
    [p(692, 692), p(692, 900)],
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
  expect(trunks).toEqual([{ kind: "hard", y: 702, x0: 108, x1: 692 }]);
  // both members rise at the target's inbound stem (centre−8) — and NOTHING
  // else: the replaced elk suffix (its old attach x) must not leak back as a
  // border horizontal
  expect(pieces.get(edgeId(e1))).toEqual([
    [p(108, 742), p(108, 702)],
    [p(692, 702), p(692, 632)],
  ]);
  expect(pieces.get(edgeId(e2))).toEqual([
    [p(308, 742), p(308, 702)],
    [p(692, 702), p(692, 632)],
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
    ["c.md", { x: 1430, y: 452, w: 200, h: 26 }], // centre 1530, span covers both elk attaches
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
  expect(trunks).toEqual([{ kind: "hard", y: 665, x0: 1522, x1: 2089.534 }]);
  // both edges snap both ends: border→trunk stubs only; all inbound stubs
  // share ONE stem at c's centre−8 — one line into the card
  expect(pieces.get(edgeId(e1))).toEqual([
    [p(2089.534, 678), p(2089.534, 665)],
    [p(1522, 665), p(1522, 478)],
  ]);
  expect(pieces.get(edgeId(e2))).toEqual([
    [p(1948.544, 678), p(1948.544, 665)],
    [p(1522, 665), p(1522, 478)],
  ]);
});

test("D1 by construction: exit (top, centre+8) vs incoming (bottom, centre−8) never coincide — no mover", () => {
  // verbatim thm012 ruling case: two bundled edges rise to c's bottom inbound
  // stem while c's own exit leaves the top outbound stem — ±8 makes a pierce
  // impossible; the raw exit tooth bundles into the stems too
  const e1 = { from: "a.md", to: "c.md", kind: "hard" };
  const e3 = { from: "d.md", to: "c.md", kind: "hard" };
  const e2 = { from: "c.md", to: "b.md", kind: "hard" }; // pure vertical raw tooth
  const rects = new Map<string, Rect>([
    ["a.md", { x: 310.138, y: 678, w: 120, h: 26 }], // centre 370.138
    ["d.md", { x: 843.262, y: 678, w: 120, h: 26 }], // centre 903.262
    ["c.md", { x: 1430, y: 452, w: 120, h: 26 }], // centre 1490, span 1430..1550
    ["b.md", { x: 1430, y: 226, w: 120, h: 26 }], // centre 1490
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
  // the raw exit tooth joins the stems: leaves c's outbound stem (top, +8),
  // arrives at b's inbound stem (bottom, −8), jog at the vertical midpoint
  expect(pieces.get(edgeId(e2))).toEqual([
    [p(1498, 452), p(1498, 352), p(1482, 352), p(1482, 252)],
  ]);
  // incoming stubs share ONE inbound stem at c centre−8 (no H2 spread)
  expect(pieces.get(edgeId(e1))).toEqual([
    [p(378.138, 678), p(378.138, 663)],
    [p(1482, 663), p(1482, 478)],
  ]);
  expect(pieces.get(edgeId(e3))).toEqual([
    [p(911.262, 678), p(911.262, 663)],
    [p(1482, 663), p(1482, 478)],
  ]);
  expect(trunks).toEqual([{ kind: "hard", y: 663, x0: 378.138, x1: 1482 }]);
});

test("lone V-H-V route snaps both ends to the stems — run horizontal stays at elk's level", () => {
  const e1 = { from: "a.md", to: "c.md", kind: "hard" };
  const e3 = { from: "d.md", to: "c.md", kind: "hard" };
  const e2 = { from: "c.md", to: "b.md", kind: "hard" }; // lone-run exit: vertical, H, vertical
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
  // unbundled route still joins the stems: elk's run level kept as the jog
  expect(pieces.get(edgeId(e2))).toEqual([
    [p(1498, 452), p(1498, 350), p(1432, 350), p(1432, 252)],
  ]);
});

// --- single-stem doctrine (tasks/single-stem-attach.md) ----------------------

test("26-edge fan → ONE outbound stem at centre+8, inbound stem at centre−8 — no cascade", () => {
  const rect = (x: number): Rect => ({ x, y: 900, w: 80, h: 26 });
  const edges = Array.from({ length: 26 }, (_, i) => ({
    from: "src.md",
    to: `t${String(i).padStart(2, "0")}.md`,
    kind: "hard",
  }));
  const fan = new Map<string, Pt[]>(
    edges.map((e, i) => [
      edgeId(e),
      vhv(100 + i * 4, 100 + i * 4, 200 + i * 20, 672 + (i % 3) * 10, 900),
    ]),
  );
  const inbound = { from: "p.md", to: "src.md", kind: "hard" }; // pure vertical tooth into src's top
  fan.set(edgeId(inbound), [p(200, 66), p(200, 74)]);
  const rects = new Map<string, Rect>([
    ["src.md", { x: 80, y: 74, w: 120, h: 26 }], // centre 140, top border 74, bottom 100
    ["p.md", { x: 180, y: 40, w: 120, h: 26 }], // centre 240
    ...edges.map((e, i) => [e.to, rect(180 + i * 20)] as const),
  ]);
  const { pieces } = bundleEdges(fan, [...edges, inbound], rects);
  // all 26 fan legs leave at the SAME outbound stem — the comb is gone
  const xs = edges.map((e) => pieces.get(edgeId(e))?.[0]?.[0]?.x);
  expect(new Set(xs)).toEqual(new Set([148]));
  // inbound tooth bundles into the stems: p outbound +8, src inbound −8
  expect(pieces.get(edgeId(inbound))).toEqual([[p(248, 66), p(248, 70), p(132, 70), p(132, 74)]]);
  // src's two stems: top (inbound) 132 = centre−8, bottom (outbound) 148 = centre+8 — never equal
  const srcTop = pieces.get(edgeId(inbound))?.at(-1)?.at(-1)?.x;
  const srcBottom = pieces.get(edgeId(edges[0] ?? inbound))?.[0]?.[0]?.x;
  expect(srcTop).toBe(132);
  expect(srcBottom).toBe(148);
});

// --- single-stem: raw teeth bundle into the stems ----------------------------

test("raw pure-vertical tooth inside the owner span → snapped into the side stems (thm011 case)", () => {
  const e1 = { from: "a.md", to: "tgt.md", kind: "hard" };
  const e2 = { from: "b.md", to: "tgt.md", kind: "hard" };
  const raw = { from: "r.md", to: "tgt.md", kind: "hard" }; // pure vertical: no run → never a trunk member
  const { pieces } = bundleEdges(
    new Map<string, Pt[]>([
      [edgeId(e1), [p(100, 678), p(100, 663), p(200, 663), p(200, 478)]],
      [edgeId(e2), [p(300, 678), p(300, 673), p(160, 673), p(160, 478)]],
      [edgeId(raw), [p(140, 678), p(140, 478)]], // elk fan tooth ON the centre line
    ]),
    [e1, e2, raw],
    new Map<string, Rect>([
      ["a.md", { x: 20, y: 678, w: 160, h: 26 }], // centre 100
      ["b.md", { x: 220, y: 678, w: 160, h: 26 }], // centre 300
      ["r.md", { x: 60, y: 678, w: 160, h: 26 }], // centre 140 = tgt centre
      ["tgt.md", { x: 40, y: 452, w: 200, h: 26 }], // centre 140, bottom border 478
    ]),
  );
  // the tooth joins the stems like a snapped member: leaves r's outbound stem
  // (centre+8), arrives at tgt's inbound stem (centre−8) — no double track
  expect(pieces.get(edgeId(raw))).toEqual([[p(148, 678), p(148, 578), p(132, 578), p(132, 478)]]);
  // the bundled members' inbound stubs land on the SAME tgt stem as the tooth
  expect(pieces.get(edgeId(e1))?.[1]?.[0]?.x).toBe(132);
  expect(pieces.get(edgeId(e2))?.[1]?.[0]?.x).toBe(132);
});

test("raw tooth whose attach x lies OUTSIDE the owner span stays raw (distant route)", () => {
  const raw = { from: "r.md", to: "tgt.md", kind: "hard" };
  const poly = [p(500, 678), p(500, 478)];
  const { pieces } = bundleEdges(
    new Map<string, Pt[]>([[edgeId(raw), poly]]),
    [raw],
    new Map<string, Rect>([
      ["r.md", { x: 0, y: 678, w: 80, h: 26 }], // span 0..80 — attach 500 outside
      ["tgt.md", { x: 600, y: 452, w: 80, h: 26 }], // span 600..680 — attach 500 outside
    ]),
  );
  expect(pieces.get(edgeId(raw))).toEqual([poly]);
});

test("unsnapped fan legs (no source rect) keep their elk x — no snap without a card", () => {
  const e1 = { from: "src.md", to: "t1.md", kind: "hard" };
  const e2 = { from: "src.md", to: "t2.md", kind: "hard" };
  // no rect for src.md → no snap: both trunk-member stubs keep their elk x 50
  // even though they collide — snapping needs the owner card
  const { pieces, trunks } = bundleEdges(
    new Map<string, Pt[]>([
      [edgeId(e1), [p(50, 100), p(150, 100), p(150, 672), p(500, 672), p(500, 900)]],
      [edgeId(e2), [p(50, 110), p(150, 110), p(150, 712), p(700, 712), p(700, 900)]],
    ]),
    [e1, e2],
    new Map<string, Rect>([
      ["t1.md", { x: 460, y: 900, w: 80, h: 26 }],
      ["t2.md", { x: 660, y: 900, w: 80, h: 26 }],
    ]),
  );
  expect(trunks.length).toBe(2); // both runs bundled — the stubs ARE members
  expect(pieces.get(edgeId(e1))?.[0]).toEqual([p(50, 100), p(50, 105)]);
  expect(pieces.get(edgeId(e2))?.[0]).toEqual([p(50, 110), p(50, 105)]);
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

// --- H1: crossings get semicircle hops (tasks/edge-crossing-hops.md) ---------

test("H1: vertical × horizontal crossing → hop arc on the vertical, horizontal continuous", () => {
  const e1 = { from: "a.md", to: "b.md", kind: "hard" };
  const e2 = { from: "c.md", to: "d.md", kind: "hard" };
  const h = [p(322, 675), p(1725, 675)];
  const { pieces } = bundleEdges(
    new Map([
      [edgeId(e1), [p(957, 100), p(957, 900)]],
      [edgeId(e2), h],
    ]),
    [e1, e2],
  );
  const hopped = addHops(pieces, []);
  // measured pi-etc case: hop replaces ±6 around (957, 675), sweep 1 (bump right)
  expect(hopped.get(edgeId(e1))).toEqual([
    [p(957, 100), p(957, 669), { x: 957, y: 681, sweep: 1 }, p(957, 900)],
  ]);
  expect(polyToD(hopped.get(edgeId(e1))?.[0] ?? [])).toBe(
    "M957 100L957 669A6 6 0 0 1 957 681L957 900",
  );
  // the horizontal runs continuous — untouched
  expect(hopped.get(edgeId(e2))).toEqual([h]);
});

test("H1: T-junctions stay plain joints — endpoint touch on either side", () => {
  const e1 = { from: "a.md", to: "b.md", kind: "hard" };
  const e2 = { from: "c.md", to: "d.md", kind: "hard" };
  // vertical STARTS on the horizontal (leg meeting its trunk)
  const r1 = addHops(
    bundleEdges(
      new Map([
        [edgeId(e1), [p(500, 675), p(500, 900)]],
        [edgeId(e2), [p(100, 675), p(900, 675)]],
      ]),
      [e1, e2],
    ).pieces,
    [],
  );
  expect(JSON.stringify(r1.get(edgeId(e1))).includes("sweep")).toBeFalse();
  // vertical passes at the horizontal's ENDPOINT
  const r2 = addHops(
    bundleEdges(
      new Map([
        [edgeId(e1), [p(500, 100), p(500, 900)]],
        [edgeId(e2), [p(500, 675), p(900, 675)]],
      ]),
      [e1, e2],
    ).pieces,
    [],
  );
  expect(JSON.stringify(r2.get(edgeId(e1))).includes("sweep")).toBeFalse();
});

test("H1: two crossings on one vertical → two arcs, sorted in travel order", () => {
  const e1 = { from: "a.md", to: "b.md", kind: "hard" };
  const e2 = { from: "c.md", to: "d.md", kind: "hard" };
  const e3 = { from: "e.md", to: "f.md", kind: "hard" };
  const { pieces } = bundleEdges(
    new Map([
      [edgeId(e1), [p(500, 100), p(500, 900)]],
      [edgeId(e2), [p(100, 675), p(900, 675)]],
      [edgeId(e3), [p(100, 800), p(900, 800)]],
    ]),
    [e1, e2, e3],
  );
  expect(addHops(pieces, []).get(edgeId(e1))).toEqual([
    [
      p(500, 100),
      p(500, 669),
      { x: 500, y: 681, sweep: 1 },
      p(500, 794),
      { x: 500, y: 806, sweep: 1 },
      p(500, 900),
    ],
  ]);
});

test("H1: crossings closer than 2r → single hop, second left plain (no overlapping arcs)", () => {
  const e1 = { from: "a.md", to: "b.md", kind: "hard" };
  const e2 = { from: "c.md", to: "d.md", kind: "hard" };
  const e3 = { from: "e.md", to: "f.md", kind: "soft" }; // soft: never bundles with the hard run
  const { pieces } = bundleEdges(
    new Map([
      [edgeId(e1), [p(500, 100), p(500, 900)]],
      [edgeId(e2), [p(100, 675), p(900, 675)]],
      [edgeId(e3), [p(100, 680), p(900, 680)]], // Δ5 < 2·6
    ]),
    [e1, e2, e3],
  );
  expect(addHops(pieces, []).get(edgeId(e1))).toEqual([
    [p(500, 100), p(500, 669), { x: 500, y: 681, sweep: 1 }, p(500, 900)],
  ]);
});

test("H1: same-endpoint fan edges and their trunks stay untouched (stubs are T-junctions)", () => {
  const rect = (x: number): Rect => ({ x, y: 900, w: 80, h: 26 });
  const e1 = { from: "src.md", to: "t1.md", kind: "hard" };
  const e2 = { from: "src.md", to: "t2.md", kind: "hard" };
  const { pieces, trunks } = bundleEdges(
    new Map<string, Pt[]>([
      [edgeId(e1), vhv(100, 100, 500, 672, 900)],
      [edgeId(e2), vhv(180, 180, 700, 712, 900)],
    ]),
    [e1, e2],
    new Map<string, Rect>([
      ["src.md", { x: 80, y: 74, w: 120, h: 26 }],
      ["t1.md", rect(460)],
      ["t2.md", rect(660)],
    ]),
  );
  const hopped = addHops(pieces, trunks);
  expect(hopped.get(edgeId(e1))).toEqual(pieces.get(edgeId(e1)));
  expect(hopped.get(edgeId(e2))).toEqual(pieces.get(edgeId(e2)));
});

test("H1: vertical through a real trunk hops it; upward run flips sweep (bump stays right)", () => {
  const e1 = { from: "a.md", to: "b.md", kind: "hard" };
  const e2 = { from: "c.md", to: "b.md", kind: "hard" };
  const through = { from: "g.md", to: "h.md", kind: "hard" };
  const { pieces, trunks } = bundleEdges(
    new Map<string, Pt[]>([
      [edgeId(e1), vhv(100, 100, 500, 672, 900)],
      [edgeId(e2), vhv(400, 400, 700, 712, 900)],
      [edgeId(through), [p(350, 100), p(350, 900)]],
    ]),
    [e1, e2, through],
  );
  expect(trunks).toEqual([{ kind: "hard", y: 692, x0: 100, x1: 700 }]);
  expect(addHops(pieces, trunks).get(edgeId(through))).toEqual([
    [p(350, 100), p(350, 686), { x: 350, y: 698, sweep: 1 }, p(350, 900)],
  ]);
  // upward run: arc from c+r down to c−r, sweep 0 — bump still faces right
  const up = { from: "i.md", to: "j.md", kind: "hard" };
  const { pieces: upPieces } = bundleEdges(
    new Map<string, Pt[]>([
      [edgeId(e1), vhv(100, 100, 500, 672, 900)],
      [edgeId(e2), vhv(400, 400, 700, 712, 900)],
      [edgeId(up), [p(350, 900), p(350, 100)]],
    ]),
    [e1, e2, up],
  );
  expect(addHops(upPieces, trunks).get(edgeId(up))).toEqual([
    [p(350, 900), p(350, 698), { x: 350, y: 686, sweep: 0 }, p(350, 100)],
  ]);
});
