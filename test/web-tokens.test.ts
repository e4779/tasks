import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { filterForm, page } from "../src/render";

const root = join(import.meta.dir, "..");

test("AC8: web assets + html-emitting src carry no raw hex — colours come only from vendored tokens", () => {
  const offenders = [
    ...readdirSync(join(root, "web")).map((f) => `web/${f}`),
    "src/render.ts",
    "src/graph-view.ts",
  ].flatMap((f) => readFileSync(join(root, f), "utf8").match(/#[0-9a-fA-F]{3,8}\b/g) ?? []);
  expect(offenders).toEqual([]);
});

test("layout emits the wave C contract: nav links, both theme switches, dark default, main+form hooks", () => {
  const css = readFileSync(join(root, "web/style.css"), "utf8");
  const body = page({
    active: "list",
    title: "t — tsk",
    body: "X",
    filters: filterForm("list", "q<x", null),
  });
  for (const part of [
    'href="/list"',
    'href="/next"',
    'href="/graph"',
    'aria-current="page"', // tabs are pure CSS styling of aria-current
    'data-theme="dark"', // default theme in the served HTML
    "/vendor/theme.dark.switch.min.css",
    "/vendor/theme.light.switch.min.css",
    'id="main"', // fragment-swap target (htmx-swap card hook), form OUTSIDE it
    'method="get"', // filters are GET forms → URL arguments
    'action="/list"', // …pointing at the route
    'data-swap="main"', // opt-in marker for the future swap glue
    'id="theme"', // the 5-line toggle button
    'localStorage.getItem("theme")', // D10: pre-paint inline boot (no light flash)
    "/main.js",
    "/style.css",
    'value="q&lt;x"', // task-derived input values are escaped
  ])
    expect(body).toContain(part);
  expect(body.match(/aria-current="page"/g)?.length).toBe(1); // only the active tab
  // d3 rides only the graph page (zoom param)
  expect(body).not.toContain("d3.min.js");
  expect(page({ active: "graph", title: "g", body: "X", zoom: true })).toContain(
    '/vendor/d3.min.js" defer',
  );
  // chips reflect the query server-side
  expect(filterForm("graph", "", "pending")).toContain('data-chip="pending" aria-pressed="true"');
  expect(filterForm("graph", "", "pending")).toContain('data-chip="all" aria-pressed="false"');
  // light remap of the fixed ramp steps (the switch files flip vars only)
  expect(css.match(/\[data-theme="light"\]/g)?.length).toBeGreaterThanOrEqual(10);
  // svg styling by css-var classes, not inline colours
  for (const cls of ["st-pending", "st-in-progress", "st-done", "st-cancelled", "st-none"])
    expect(css).toContain(cls);
  for (const e of [".edge.hard", ".edge.soft", ".edge.broken", ".edge.trunk"])
    expect(css).toContain(e);
});
