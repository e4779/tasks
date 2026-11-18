import { expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  AC_STATE_EVAL,
  acResults,
  DEFAULT_EVAL,
  parseArgs,
  webHexOffenders,
} from "../tools/probe.mjs";

test("parseArgs: url plus defaults", () => {
  const r = parseArgs(["http://127.0.0.1:8947/#/graph"]);
  expect(r.ok).toBeTrue();
  expect(r.v.url).toBe("http://127.0.0.1:8947/#/graph");
  expect(r.v.settleMs).toBe(2000);
  expect(r.v.evalJs).toBe(DEFAULT_EVAL);
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

test("parseArgs: --ac flag toggles acceptance mode", () => {
  const r = parseArgs(["u", "--ac"]);
  expect(r.ok).toBeTrue();
  expect(r.v.ac).toBeTrue();
});

test("parseArgs: missing url, missing value, bad ms, extra positional are errors", () => {
  expect(parseArgs([]).ok).toBeFalse();
  expect(parseArgs(["u", "--settle-ms"]).ok).toBeFalse();
  expect(parseArgs(["u", "--settle-ms", "soon"]).ok).toBeFalse();
  expect(parseArgs(["u", "v"]).ok).toBeFalse();
});

test("parseArgs: --viewport needs WxH, min 200x200", () => {
  expect(parseArgs(["u", "--viewport"]).ok).toBeFalse();
  expect(parseArgs(["u", "--viewport", "800"]).ok).toBeFalse();
  expect(parseArgs(["u", "--viewport", "800x"]).ok).toBeFalse();
  expect(parseArgs(["u", "--viewport", "100x600"]).ok).toBeFalse();
  expect(parseArgs(["u", "--viewport", "1920x1080"]).v.viewport).toBe("1920x1080");
});

test("webHexOffenders: the web layer carries no raw hex (AC8, repo side)", () => {
  expect(webHexOffenders(resolve(import.meta.dir, "..", "web"))).toEqual([]);
});

const healthyState = {
  elem: { w: 1562, h: 547 },
  view: { w: 1562, h: 547 },
  nodes: 8,
  distinct: 8,
  links: 7,
  edgeIssues: [],
  bbox: { x0: 300, x1: 1110, y0: 40, y1: 505 },
  outside: [],
  cycleLinks: 2,
  cyclePair: { between: 1, cycleKind: 1 },
  overlaps: [],
  attach: [
    "blocked-card.md→normal-card.md+0/0",
    "blocked-card.md→missing-dep.md+0/0",
    "cyclic-a.md→cyclic-b.md+0/0",
    "normal-card.md→completed-card.md+0/0",
  ],
  attachIssues: [],
};
const healthyInteract = {
  z0: 1,
  z1: 1.1487, // +15% (d3 wheel factor 2^0.2)
  z2: 1,
};

test("acResults: healthy payloads pass AC1-AC3, AC5-AC11; AC4 stays deferred", () => {
  const ac = acResults(healthyState, healthyInteract, 204, 0);
  expect(ac.filter((r) => r.id !== "ac4").every((r) => r.pass === true)).toBeTrue();
  expect(ac.find((r) => r.id === "ac4")?.pass).toBeNull();
  expect(ac).toHaveLength(11);
});

test("acResults: overlapping card pairs fail AC9 with the pairs named", () => {
  const pairs = ["missing-dep.md×normal-card.md", "completed-card.md×cyclic-a.md"];
  const ac = acResults({ ...healthyState, overlaps: pairs }, healthyInteract, 204, 0);
  const ac9 = ac.find((r) => r.id === "ac9");
  expect(ac9?.pass).toBeFalse();
  expect(ac9?.detail.overlaps).toEqual(pairs);
});

test("acResults: missing overlap payload (hook absent) fails AC9, not AC7", () => {
  const ac = acResults(healthyState, healthyInteract, 204, 0, []);
  const { overlaps: _drop, ...noOverlaps } = healthyState;
  const ac2 = acResults(noOverlaps, healthyInteract, 204, 0, []);
  expect(ac.find((r) => r.id === "ac9")?.pass).toBeTrue();
  expect(ac2.find((r) => r.id === "ac9")?.pass).toBeFalse();
  expect(ac2.find((r) => r.id === "ac7")?.pass).toBeTrue();
});

test("acResults: AC7 fails on the pre-merge DOM (4 lines between the pair) and on missing payload", () => {
  const by = (ac, id) => ac.find((r) => r.id === id)?.pass;
  // pre-merge cyclic pair: 2 red dotted + 1 blue solid + 1 gray dashed
  const preMerge = acResults(
    { ...healthyState, cyclePair: { between: 4, cycleKind: 0 } },
    healthyInteract,
    204,
    0,
  );
  expect(by(preMerge, "ac7")).toBeFalse();
  expect(preMerge.find((r) => r.id === "ac7")?.detail.cyclePair).toEqual({
    between: 4,
    cycleKind: 0,
  });
  // extra non-cycle line next to the merged one is still noise → fail
  expect(
    by(
      acResults(
        { ...healthyState, cyclePair: { between: 2, cycleKind: 1 } },
        healthyInteract,
        204,
        0,
      ),
      "ac7",
    ),
  ).toBeFalse();
  // same contract as ac9/ac10: a missing payload is a fail, not a pass
  const { cyclePair: _c, ...noPair } = healthyState;
  expect(by(acResults(noPair, healthyInteract, 204, 0), "ac7")).toBeFalse();
});

test("acResults: NaN camera (the bug) fails spread/drawn/wheel-zoom, not cycles", () => {
  const nanState = {
    ...healthyState,
    distinct: 1,
    bbox: { x0: NaN, x1: NaN, y0: NaN, y1: NaN },
    outside: ["a.md", "b.md"],
  };
  const nanInteract = { z0: NaN, z1: NaN, z2: NaN };
  const ac = acResults(nanState, nanInteract, 204, 0);
  const by = (id) => ac.find((r) => r.id === id)?.pass;
  expect(by("ac2")).toBeFalse();
  expect(by("ac3")).toBeFalse();
  expect(by("ac5")).toBeFalse();
  expect(by("ac7")).toBeTrue();
  // NaN in details must serialize cleanly (null), not break the report
  expect(JSON.parse(JSON.stringify(ac.find((r) => r.id === "ac5"))).detail.z0).toBeNull();
});

test("acResults: AC10 fails on diagonal segments, empty polylines, or missing payload", () => {
  const by = (ac, id) => ac.find((r) => r.id === id)?.pass;
  const diagonal = acResults(
    { ...healthyState, edgeIssues: ["a.md→b.md:diagonal"] },
    healthyInteract,
    204,
    0,
  );
  expect(by(diagonal, "ac10")).toBeFalse();
  expect(diagonal.find((r) => r.id === "ac10")?.detail.edgeIssues).toEqual(["a.md→b.md:diagonal"]);
  const empty = acResults(
    { ...healthyState, edgeIssues: ["a.md→b.md:no-polyline"] },
    healthyInteract,
    204,
    0,
  );
  expect(by(empty, "ac10")).toBeFalse();
  // pre-elk code carries no polyline payload at all — same missing-payload rule as ac9
  const { links: _l, edgeIssues: _e, ...noPoly } = healthyState;
  expect(by(acResults(noPoly, healthyInteract, 204, 0), "ac10")).toBeFalse();
  // zero links is not a pass: a linked corpus is part of the fixture contract
  expect(by(acResults({ ...healthyState, links: 0 }, healthyInteract, 204, 0), "ac10")).toBeFalse();
});

test("acResults: AC11 fails on floating endpoints with the gap in world px, and on missing payload", () => {
  const by = (ac, id) => ac.find((r) => r.id === id)?.pass;
  const floating = acResults(
    {
      ...healthyState,
      attach: ["blocked-card.md→normal-card.md+8.2/8.1"],
      attachIssues: [
        "blocked-card.md→normal-card.md+8.2/8.1:src",
        "blocked-card.md→normal-card.md+8.2/8.1:dst",
      ],
    },
    healthyInteract,
    204,
    0,
  );
  expect(by(floating, "ac11")).toBeFalse();
  expect(floating.find((r) => r.id === "ac11")?.detail.attachIssues[0]).toContain("8.2");
  expect(by(floating, "ac10")).toBeTrue(); // orthogonality is a separate gate
  const { attachIssues: _a, ...noAttach } = healthyState;
  expect(by(acResults(noAttach, healthyInteract, 204, 0), "ac11")).toBeFalse();
  expect(by(acResults({ ...healthyState, links: 0 }, healthyInteract, 204, 0), "ac11")).toBeFalse();
});

test("acResults: AC8 fails on raw-hex offenders, passes clean", () => {
  const by = (ac, id) => ac.find((r) => r.id === id)?.pass;
  expect(by(acResults(healthyState, healthyInteract, 204, 0, []), "ac8")).toBeTrue();
  expect(
    by(acResults(healthyState, healthyInteract, 204, 0, ["graph.js: #fff"]), "ac8"),
  ).toBeFalse();
});

test("acResults: favicon 404 or console errors fail AC6 only", () => {
  const by = (ac, id) => ac.find((r) => r.id === id)?.pass;
  expect(by(acResults(healthyState, healthyInteract, 404, 0), "ac6")).toBeFalse();
  expect(by(acResults(healthyState, healthyInteract, 204, 2), "ac6")).toBeFalse();
  expect(by(acResults(healthyState, healthyInteract, 404, 0), "ac1")).toBeTrue();
});

test("acResults: state eval carries the AC2/AC5/AC9/AC10/AC11 payloads the browser will produce", () => {
  expect(AC_STATE_EVAL).toContain("getBoundingClientRect"); // browser's own camera math
  expect(AC_STATE_EVAL).toContain("__zoom"); // d3 transform on the element
  expect(AC_STATE_EVAL).toContain("tskCards");
  expect(AC_STATE_EVAL).toContain("path.edge");
  expect(AC_STATE_EVAL).toContain("dataset.path");
  expect(AC_STATE_EVAL).toContain("pointOnRect");
  expect(AC_STATE_EVAL).toContain("cycleLinks");
  expect(AC_STATE_EVAL).toContain("cyclePair"); // AC7 merge contract payload
});
