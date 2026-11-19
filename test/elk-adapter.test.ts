import { describe, expect, test } from "bun:test";
import { buildElkGraph, edgeId, mapLayout, polyToD } from "../src/elk-adapter";

const nodes = [{ id: "tasks/a.md" }, { id: "tasks/b.md" }, { id: "tasks/c.md" }];
const sizes = new Map([
  ["tasks/a.md", { w: 96, h: 26 }],
  ["tasks/b.md", { w: 120, h: 26 }],
  ["tasks/c.md", { w: 40, h: 26 }],
]);
const edges = [
  { from: "tasks/a.md", to: "tasks/b.md", kind: "hard" },
  { from: "tasks/a.md", to: "tasks/c.md", kind: "soft" },
  { from: "tasks/b.md", to: "tasks/a.md", kind: "hard" }, // cycle edge — still routed
  { from: "tasks/a.md", to: "tasks/b.md", kind: "soft" }, // parallel to the hard one
];

describe("edgeId", () => {
  test("kind separates parallel edges between the same pair", () => {
    const ids = edges.map(edgeId);
    expect(new Set(ids).size).toBe(4);
    expect(edgeId({ from: "tasks/a.md", to: "tasks/b.md", kind: "hard" })).toBe(
      "tasks/a.md\ttasks/b.md\thard",
    );
  });
});

describe("buildElkGraph", () => {
  const g = buildElkGraph(nodes, sizes, edges, 1562 / 547);

  test("children carry the measured fixed sizes as width/height", () => {
    expect(g.children).toEqual([
      { id: "tasks/a.md", width: 96, height: 26 },
      { id: "tasks/b.md", width: 120, height: 26 },
      { id: "tasks/c.md", width: 40, height: 26 },
    ]);
  });

  test("a sizeless node falls back to the min card, never to undefined", () => {
    const g2 = buildElkGraph([{ id: "x" }], new Map(), [], 2);
    expect(g2.children).toEqual([{ id: "x", width: 40, height: 26 }]);
  });

  test("edges are id'd and directed via sources/targets", () => {
    expect(g.edges).toHaveLength(4);
    expect(g.edges[0]).toEqual({
      id: "tasks/a.md\ttasks/b.md\thard",
      sources: ["tasks/a.md"],
      targets: ["tasks/b.md"],
    });
    expect(g.edges[2]?.targets).toEqual(["tasks/a.md"]); // cycle direction kept
  });

  test("layout options: layered UP ORTHOGONAL at the graph aspect; no size constraints", () => {
    expect(g.layoutOptions["elk.algorithm"]).toBe("layered");
    expect(g.layoutOptions["elk.direction"]).toBe("UP"); // blockers upstream, see buildElkGraph
    expect(g.layoutOptions["elk.edgeRouting"]).toBe("ORTHOGONAL");
    expect(g.layoutOptions["elk.aspectRatio"]).toBe(String(1562 / 547));
    // nodeSize.constraints must stay unset, or ELK would resize the cards
    expect(JSON.stringify(g)).not.toContain("constraints");
  });

  test("80 nodes + 0 edges → rectPacking at the container aspect, layered-only options dropped", () => {
    const nodes80 = Array.from({ length: 80 }, (_, i) => ({
      id: `tasks/edgeless-${String(i).padStart(2, "0")}.md`,
    }));
    const sizes80 = new Map(nodes80.map((n, i) => [n.id, { w: 48 + i * 1.5, h: 26 }]));
    const g80 = buildElkGraph(nodes80, sizes80, [], 1562 / 547);
    expect(g80.children).toHaveLength(80);
    expect(g80.layoutOptions["elk.algorithm"]).toBe("org.eclipse.elk.rectpacking");
    expect(g80.layoutOptions["elk.aspectRatio"]).toBe(String(1562 / 547 / 1.5)); // /1.5: rectPacking overshoots the asked aspect — see adapter
    // nothing to route — edgeRouting/direction/layered spacings are meaningless here
    expect(g80.layoutOptions["elk.edgeRouting"]).toBeUndefined();
    expect(g80.layoutOptions["elk.direction"]).toBeUndefined();
    expect(g80.layoutOptions["elk.spacing.nodeNode"]).toBeUndefined();
    expect(g80.edges).toEqual([]);
  });
});

describe("polyToD", () => {
  test("polyline → SVG path d: M then L commands, space-separated pairs", () => {
    expect(
      polyToD([
        { x: 60, y: 46 },
        { x: 60, y: 80 },
        { x: -30, y: 80 },
      ]),
    ).toBe("M60 46L60 80L-30 80");
  });

  test("empty and single-point polylines degrade to empty / M-only d", () => {
    expect(polyToD([])).toBe("");
    expect(polyToD([{ x: 1, y: 2 }])).toBe("M1 2");
  });
});

describe("mapLayout", () => {
  // fixture shaped like real ELK output: top-left coords, one section per edge
  const result = {
    children: [
      { id: "tasks/a.md", x: 10, y: 20, width: 100, height: 26 },
      { id: "tasks/b.md", x: -50, y: 200, width: 40, height: 26 },
      { id: "raw", x: 7, y: 9 }, // degenerate: no size → centre == top-left
    ],
    edges: [
      {
        id: "e1",
        sections: [
          {
            startPoint: { x: 60, y: 46 },
            bendPoints: [
              { x: 60, y: 80 },
              { x: -30, y: 80 },
            ],
            endPoint: { x: -30, y: 200 },
          },
        ],
      },
      { id: "e2", sections: [{ startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 5 } }] },
      { id: "e3", sections: [] }, // unrouted edge → empty polyline, painter skips
      { id: "e4" }, // no sections key at all
    ],
  };

  test("rects are top-left + size, exactly what the svg painter draws", () => {
    const { rects } = mapLayout(result);
    expect(rects.get("tasks/a.md")).toEqual({ x: 10, y: 20, w: 100, h: 26 });
    expect(rects.get("tasks/b.md")).toEqual({ x: -50, y: 200, w: 40, h: 26 });
    expect(rects.get("raw")).toEqual({ x: 7, y: 9, w: 0, h: 0 }); // no size → degenerate, never undefined
  });

  test("polylines are startPoint, bendPoints…, endPoint in paint order", () => {
    const { polylines } = mapLayout(result);
    expect(polylines.get("e1")).toEqual([
      { x: 60, y: 46 },
      { x: 60, y: 80 },
      { x: -30, y: 80 },
      { x: -30, y: 200 },
    ]);
    expect(polylines.get("e2")).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 5 },
    ]);
  });

  test("edges without sections map to empty polylines, keyed by edge id", () => {
    const { polylines } = mapLayout(result);
    expect(polylines.get("e3")).toEqual([]);
    expect(polylines.get("e4")).toEqual([]);
    expect(polylines.size).toBe(4);
  });

  test("a missing edges array yields no polylines but all rects", () => {
    const { rects, polylines } = mapLayout({ children: result.children });
    expect(polylines.size).toBe(0);
    expect(rects.size).toBe(3);
  });
});
