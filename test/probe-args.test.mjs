import { expect, test } from "bun:test";
import { AC_STATE_EVAL, acResults, DEFAULT_EVAL, parseArgs } from "../tools/probe.mjs";

test("parseArgs: url plus defaults", () => {
  const r = parseArgs(["http://127.0.0.1:8947/#/graph"]);
  expect(r.ok).toBeTrue();
  expect(r.v.url).toBe("http://127.0.0.1:8947/#/graph");
  expect(r.v.settleMs).toBe(2000);
  expect(r.v.evalJs).toBe(DEFAULT_EVAL);
  expect(r.v.canvas).toBeNull();
  expect(r.v.ac).toBeFalse();
});

test("parseArgs: flags override defaults", () => {
  const r = parseArgs(["u", "--settle-ms", "500", "--eval", "1+1", "--canvas", "/tmp/p.png"]);
  expect(r.ok).toBeTrue();
  expect(r.v).toEqual({
    url: "u",
    settleMs: 500,
    evalJs: "1+1",
    canvas: "/tmp/p.png",
    ac: false,
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

const healthyState = {
  elem: { w: 1562, h: 547 },
  canvas: { w: 1562, h: 547 },
  nodes: 8,
  distinct: 8,
  bbox: { x0: 300, x1: 1110, y0: 40, y1: 505 },
  outside: [],
  cycleLinks: 2,
};
const healthyInteract = {
  z0: 1.95,
  z1: 2.24, // +15%
  z2: 1.95,
  c0: { x: 0, y: 0 },
  c1: { x: 30, y: 20 },
};

test("acResults: healthy payloads pass AC1-AC3, AC5-AC7; AC4 stays deferred", () => {
  const ac = acResults(healthyState, healthyInteract, 204, 0);
  expect(ac.filter((r) => r.id !== "ac4").every((r) => r.pass === true)).toBeTrue();
  expect(ac.find((r) => r.id === "ac4")?.pass).toBeNull();
});

test("acResults: NaN camera (the bug) fails spread/drawn/wheel+pan, not cycles", () => {
  const nanState = {
    ...healthyState,
    distinct: 1,
    bbox: { x0: NaN, x1: NaN, y0: NaN, y1: NaN },
    outside: ["a.md", "b.md"],
  };
  const nanInteract = { z0: NaN, z1: NaN, z2: NaN, c0: null, c1: null };
  const ac = acResults(nanState, nanInteract, 204, 0);
  const by = (id) => ac.find((r) => r.id === id)?.pass;
  expect(by("ac2")).toBeFalse();
  expect(by("ac3")).toBeFalse();
  expect(by("ac5")).toBeFalse();
  expect(by("ac7")).toBeTrue();
  // NaN in details must serialize cleanly (null), not break the report
  expect(JSON.parse(JSON.stringify(ac.find((r) => r.id === "ac5"))).detail.z0).toBeNull();
});

test("acResults: favicon 404 or console errors fail AC6 only", () => {
  const by = (ac, id) => ac.find((r) => r.id === id)?.pass;
  expect(by(acResults(healthyState, healthyInteract, 404, 0), "ac6")).toBeFalse();
  expect(by(acResults(healthyState, healthyInteract, 204, 2), "ac6")).toBeFalse();
  expect(by(acResults(healthyState, healthyInteract, 404, 0), "ac1")).toBeTrue();
});

test("acResults: state eval carries the AC2/AC5 payloads the browser will produce", () => {
  expect(AC_STATE_EVAL).toContain("graph2ScreenCoords");
  expect(AC_STATE_EVAL).toContain("cycleLinks");
});
