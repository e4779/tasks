import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { cardSize, serverCtx } from "../src/cards";
import {
  acResults,
  INTERACT_EVAL,
  parseArgs,
  parseGraphHtml,
  routeChecks,
  SCREEN_EVAL,
  webHexOffenders,
} from "../tools/probe.mjs";

test("parseArgs: url plus defaults", () => {
  const r = parseArgs(["http://127.0.0.1:8947/graph"]);
  expect(r.ok).toBeTrue();
  expect(r.v.url).toBe("http://127.0.0.1:8947/graph");
  expect(r.v.settleMs).toBe(2000);
  expect(r.v.canvas).toBeNull();
  expect(r.v.ac).toBeFalse();
  expect(r.v.viewport).toBeNull();
});

test("parseArgs: flags override defaults", () => {
  const r = parseArgs([
    "u",
    "--settle-ms",
    "500",
    "--eval",
    "1+1",
    "--canvas",
    "/tmp/p.png",
    "--viewport",
    "800x600",
  ]);
  expect(r.ok).toBeTrue();
  expect(r.v).toEqual({
    url: "u",
    settleMs: 500,
    evalJs: "1+1",
    canvas: "/tmp/p.png",
    ac: false,
    viewport: "800x600",
  });
});

test("parseArgs: --ac flag, missing url/value, bad ms/viewport, extra positional are errors", () => {
  expect(parseArgs(["u", "--ac"]).v.ac).toBeTrue();
  expect(parseArgs([]).ok).toBeFalse();
  expect(parseArgs(["u", "--settle-ms"]).ok).toBeFalse();
  expect(parseArgs(["u", "--settle-ms", "soon"]).ok).toBeFalse();
  expect(parseArgs(["u", "v"]).ok).toBeFalse();
  expect(parseArgs(["u", "--viewport", "800"]).ok).toBeFalse();
  expect(parseArgs(["u", "--viewport", "100x600"]).ok).toBeFalse();
  expect(parseArgs(["u", "--viewport", "1920x1080"]).v.viewport).toBe("1920x1080");
});

test("webHexOffenders: the client layer carries no raw hex (AC8, repo side)", () => {
  expect(webHexOffenders(resolve(import.meta.dir, "..", "web"))).toEqual([]);
});

// synthetic served-html builders — attribute order matches src/graph-view.ts
const card = (path, x, y, title, cls = "card st-pending") =>
  `<g class="${cls}" data-path="${path}" data-x="${x}" data-y="${y}" data-w="${cardSize(title, serverCtx).w}" data-h="26" transform="translate(${x} ${y})"><rect class="box" width="${cardSize(title, serverCtx).w}" height="26" rx="4"/><rect class="bar" width="4" height="26"/><text x="10" y="13">${title}</text></g>`;
const edge = (from, to, d, kind = "hard") =>
  `<path class="edge ${kind}" data-from="${from}" data-to="${to}" d="${d}"/>`;
const trunk = (d, kind = "hard") => `<path class="edge trunk ${kind}" d="${d}"/>`;
const page = (body, edges = 1) =>
  `<div class="tsk-graph"><svg data-zoom data-edges="${edges}" viewBox="0 0 300 200"><g>${body}</g></svg><div class="tsk-legend"><svg class="tsk-legend-sample"><path d="M1 4H25" class="edge hard"/></svg><svg class="tsk-legend-sample"><path d="M1 4H25" class="edge soft"/></svg><svg class="tsk-legend-sample"><path d="M1 4H25" class="edge broken"/></svg></div></div>`;

// the fixture pair ac7 gates on, as a minimal healthy page: one merged cycle edge
const CA = "tasks/cyclic-a.md";
const CB = "tasks/cyclic-b.md";
const healthyHtml = page(
  card(CA, 10, 10, "aaaa") +
    card(CB, 100, 100, "bbbb") +
    edge(CA, CB, "M30 36L30 70L120 70L120 100", "cycle"),
);
const healthyState = parseGraphHtml(healthyHtml);
const healthyScreen = {
  elem: { w: 1562, h: 547 },
  view: { w: 1562, h: 547 },
  nodes: 2,
  distinct: 2,
  bbox: { x0: 30, x1: 1200, y0: 20, y1: 500 },
  outside: [],
};
const healthyInteract = { z0: 1, z1: 1.1487, z2: 1 }; // +15% (d3 wheel factor 2^0.2)

test("parseGraphHtml: healthy two-card page → clean geometry payloads", () => {
  expect(healthyState.graph).toBeTrue();
  expect(healthyState.cards).toBe(2);
  expect(healthyState.links).toBe(1);
  expect(healthyState.cyclePair).toEqual({ between: 1, cycleKind: 1 });
  expect(healthyState.multiPair).toEqual([]);
  expect(healthyState.overlaps).toEqual([]);
  expect(healthyState.edgeIssues).toEqual([]);
  expect(healthyState.attachIssues).toEqual([]);
  expect(healthyState.bus.buses).toEqual([]);
  expect(healthyState.bus.horizontals).toBe(healthyState.bus.corridors);
  expect(healthyState.titleFit).toEqual({ cards: 2, ellipsis: [], wide: [] });
  expect(healthyState.bundles.legend).toEqual({ present: true, samples: 3 });
});

test("parseGraphHtml: non-graph pages report graph:false (n/a contract)", () => {
  expect(parseGraphHtml("<html><body><table></table></body></html>")).toEqual({ graph: false });
});

test("parseGraphHtml: overlapping cards are named (ac9)", () => {
  const s = parseGraphHtml(
    page(card("tasks/a.md", 10, 10, "aaaa") + card("tasks/b.md", 12, 12, "bbbb"), 0),
  );
  expect(s.overlaps).toEqual(["a.md×b.md"]);
});

test("parseGraphHtml: diagonal segments and floating endpoints are caught (ac10/ac11)", () => {
  const s = parseGraphHtml(
    page(
      card("tasks/a.md", 10, 10, "aaaa") +
        card("tasks/b.md", 100, 100, "bbbb") +
        edge("tasks/a.md", "tasks/b.md", "M30 36L130 95"),
      1,
    ),
  );
  expect(s.edgeIssues).toEqual(["a.md→b.md:diagonal"]);
  expect(s.attachIssues).toContain("a.md→b.md:dst");
});

test("parseGraphHtml: same-kind parallel horizontals in one band are a bus (ac13)", () => {
  const s = parseGraphHtml(
    page(
      card("tasks/a.md", 10, 10, "aaaa") +
        card("tasks/b.md", 20, 180, "bbbb") +
        card("tasks/c.md", 80, 140, "cccc") +
        card("tasks/d.md", 100, 100, "dddd") +
        edge("tasks/a.md", "tasks/d.md", "M30 36L30 60L150 60L150 100") + // track y=60, x 30→150
        edge("tasks/b.md", "tasks/c.md", "M40 180L40 70L120 70L120 140"), // track y=70, x 40→120
      2,
    ),
  );
  expect(s.bus.buses.length).toBeGreaterThan(0); // tracks 10 apart, x-overlap, same kind
  expect(s.bus.horizontals).not.toBe(s.bus.corridors);
});

test("parseGraphHtml: bundled members (shared trunk) stay clean — ac13 homogeneity, ac14 one-drop", () => {
  const s = parseGraphHtml(
    page(
      card("tasks/a.md", 10, 10, "aaaa") +
        card("tasks/b.md", 100, 100, "bbbb") +
        card("tasks/c.md", 180, 100, "cccc") +
        trunk("M35 60L205 60") +
        edge("tasks/a.md", "tasks/b.md", "M35 36L35 60") + // shared drop from a onto the trunk
        edge("tasks/a.md", "tasks/b.md", "M125 60L125 100") + // rise onto b
        edge("tasks/a.md", "tasks/c.md", "M35 36L35 60") + // ONE drop per source…
        edge("tasks/a.md", "tasks/c.md", "M205 60L205 100"), // …one rise per edge
      2,
    ),
  );
  expect(s.attachIssues).toEqual([]); // trunk-touching endpoints count as ON
  expect(s.edgeIssues).toEqual([]);
  expect(s.bundles.trunkCount).toBe(1);
  expect(s.bundles.mixed).toEqual([]);
  expect(s.bundles.multiDrop).toEqual([]);
  expect(s.bus.buses).toEqual([]); // the trunk is the one horizontal in its band
});

test("parseGraphHtml: pre-merge cycle pair (2 hard lines both ways) reads as a defect (ac7)", () => {
  const two = parseGraphHtml(
    page(
      card(CA, 10, 10, "aaaa") +
        card(CB, 100, 10, "bbbb") +
        edge(CA, CB, "M30 36L30 70L120 70L120 36", "hard") +
        edge(CB, CA, "M120 36L120 80L30 80L30 36", "hard"),
      4,
    ),
  );
  expect(two.cyclePair.between).toBe(1); // one unordered pair…
  expect(two.cyclePair.cycleKind).toBe(0); // …but zero cycle-styled edges → pre-merge defect
  expect(two.multiPair).toEqual(["tasks/cyclic-a.md⇄tasks/cyclic-b.md"]); // TWO directions painted — the generalized ac7 verdict
  expect(
    acResults(two, healthyScreen, healthyInteract, 204, 0).find((r) => r.id === "ac7")?.pass,
  ).toBeFalse();
  const four = parseGraphHtml(
    page(
      card(CA, 10, 10, "aaaa") +
        card(CB, 100, 10, "bbbb") +
        edge(CA, CB, "M30 36L30 70L120 70L120 36", "soft") +
        edge(CA, CB, "M30 36L30 75L120 75L120 36", "hard") +
        edge(CB, CA, "M120 36L120 80L30 80L30 36", "soft") +
        edge(CB, CA, "M120 36L120 85L30 85L30 36", "hard"),
      4,
    ),
  );
  expect(four.cyclePair.between).toBe(1); // DISTINCT unordered pairs — parallels collapse
  expect(four.cyclePair.cycleKind).toBe(0);
});

test("parseGraphHtml: title width mismatch and ellipsis are caught (ac12)", () => {
  const wide = `<g class="card st-pending" data-path="tasks/a.md" data-x="10" data-y="10" data-w="40" data-h="26"><text>aaaaaaaaaa</text></g>`;
  expect(parseGraphHtml(page(wide, 0)).titleFit.wide).toEqual(["a.md+-51"]); // real cardSize answer is 90.72
  const ell = `<g class="card st-pending" data-path="tasks/a.md" data-x="10" data-y="10" data-w="66" data-h="26"><text>aaa…</text></g>`;
  expect(parseGraphHtml(page(ell, 0)).titleFit.ellipsis).toEqual(["a.md"]);
});

test("acResults: healthy graph payloads pass everything but ac4 (vision-deferred)", () => {
  const ac = acResults(healthyState, healthyScreen, healthyInteract, 204, 0);
  expect(ac.filter((r) => r.id !== "ac4").every((r) => r.pass === true)).toBeTrue();
  expect(ac.find((r) => r.id === "ac4")?.pass).toBeNull();
  expect(ac).toHaveLength(14);
});

test("acResults: non-graph routes mark graph ACs n/a, keep the universal ones live", () => {
  const ac = acResults({ graph: false }, { noGraph: true }, { noGraph: true }, 204, 0);
  const by = (id) => ac.find((r) => r.id === id)?.pass;
  for (const id of [
    "ac1",
    "ac2",
    "ac3",
    "ac5",
    "ac7",
    "ac9",
    "ac10",
    "ac11",
    "ac12",
    "ac13",
    "ac14",
  ])
    expect(by(id)).toBeNull();
  expect(by("ac6")).toBeTrue();
  expect(by("ac8")).toBeTrue();
  expect(
    acResults({ graph: false }, { noGraph: true }, { noGraph: true }, 404, 1).find(
      (r) => r.id === "ac6",
    )?.pass,
  ).toBeFalse();
});

test("acResults: a graph route with a missing screen payload FAILS ac1-ac3, not the geometry ACs", () => {
  const ac = acResults(healthyState, null, healthyInteract, 204, 0);
  const by = (id) => ac.find((r) => r.id === id)?.pass;
  expect(by("ac1")).toBeFalse();
  expect(by("ac2")).toBeFalse();
  expect(by("ac3")).toBeFalse();
  expect(by("ac9")).toBeTrue();
});

test("acResults: edgeless corpora vacuously pass ac7/ac10/ac11/ac13", () => {
  const state = parseGraphHtml(page(card("tasks/a.md", 10, 10, "aaaa"), 0));
  const ac = acResults(state, healthyScreen, healthyInteract, 204, 0);
  const by = (id) => ac.find((r) => r.id === id)?.pass;
  expect(by("ac7")).toBeTrue();
  expect(by("ac10")).toBeTrue();
  expect(by("ac11")).toBeTrue();
  expect(by("ac13")).toBeTrue();
});

test("acResults: ac5 fails on a dead zoom (no movement or NaN)", () => {
  const by = (ac) => ac.find((r) => r.id === "ac5")?.pass;
  expect(by(acResults(healthyState, healthyScreen, { z0: 1, z1: 1, z2: 1 }, 204, 0))).toBeFalse();
  const nan = acResults(healthyState, healthyScreen, { z0: NaN, z1: NaN, z2: NaN }, 204, 0);
  expect(by(nan)).toBeFalse();
  expect(JSON.parse(JSON.stringify(nan.find((r) => r.id === "ac5"))).detail.z0).toBeNull(); // NaN serializes clean
});

test("acResults: ac8 fails on raw-hex offenders; ac6 on favicon/console", () => {
  expect(
    acResults(healthyState, healthyScreen, healthyInteract, 204, 0, ["main.js: #fff"]).find(
      (r) => r.id === "ac8",
    )?.pass,
  ).toBeFalse();
  const by = (ac, id) => ac.find((r) => r.id === id)?.pass;
  expect(by(acResults(healthyState, healthyScreen, healthyInteract, 404, 0), "ac6")).toBeFalse();
  expect(by(acResults(healthyState, healthyScreen, healthyInteract, 204, 2), "ac6")).toBeFalse();
  expect(by(acResults(healthyState, healthyScreen, healthyInteract, 404, 0), "ac1")).toBeTrue(); // one gate, one defect
});

test("routeChecks: per-route content markers", () => {
  expect(routeChecks("/list", "<table><tbody><tr>")).toEqual({ table: true, rows: true });
  expect(routeChecks("/next", '<div class="next-item">')).toEqual({ "next items": true });
  expect(routeChecks("/graph", "<svg data-zoom")).toEqual({ "graph svg": true });
  expect(
    routeChecks("/doc/tasks/x.md", '<article class="md">ok</article><details><pre>status: x</pre>'),
  ).toEqual({ "doc article": true, "no frontmatter leak": true });
  expect(
    routeChecks("/doc/tasks/x.md", '<article class="md">status: leak</article><details>'),
  ).toEqual({
    "doc article": true,
    "no frontmatter leak": false,
  });
});

test("evals stay CDP-shaped: screen reads the browser camera, interact reads svg.__zoom", () => {
  expect(SCREEN_EVAL).toContain("getBoundingClientRect");
  expect(SCREEN_EVAL).toContain("svg[data-zoom]");
  expect(SCREEN_EVAL).toContain(".card");
  expect(INTERACT_EVAL).toContain("__zoom");
  expect(INTERACT_EVAL).toContain("WheelEvent");
});
