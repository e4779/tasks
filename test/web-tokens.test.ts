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

test("swap glue contract: opt-in marker, header negotiation, history, native fallback, trust comment", () => {
  const js = readFileSync(join(root, "web/main.js"), "utf8");
  for (const part of [
    'dataset.swap === "main"', // keys off the server opt-in marker, never route sniffing
    '"x-fragment": "main"', // fragment negotiation header (matches src/serve.ts)
    "history.pushState", // URL = the only state (no cookies/localStorage here)
    'addEventListener("popstate"', // back/forward walks filter history
    "form.submit()", // fetch failure → native GET, no dead UI
    "textContent", // <title> via DOM API, never string interpolation
    "Trust boundary", // documented reasoning at the swap site (card ruling 5)
  ])
    expect(js).toContain(part);
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

test("focus mode contract: root data-focus state, drag threshold, esc/native-click guards, css dimming both themes", () => {
  const js = readFileSync(join(root, "web/main.js"), "utf8");
  for (const part of [
    "svg.dataset.focus = path", // the root attribute is the whole state (probe contract)
    "delete svg.dataset.focus", // Esc/background/same-card clear it
    "Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4", // d3 pan never toggles focus
    "e.metaKey || e.ctrlKey || e.shiftKey", // modified click = native new tab
    "e.preventDefault()", // card click focuses instead of navigating
    'e.key !== "Escape"', // esc unfocuses, resolved per event (swap-proof)
    "bindFocus(svg)", // re-bound after the fragment swap together with zoom
  ])
    expect(js).toContain(part);
  const css = readFileSync(join(root, "web/style.css"), "utf8");
  for (const part of [
    "svg[data-focus] .card:not([data-lit])", // dim to ~0.15 via attribute selectors
    "svg[data-focus] .edge:not([data-lit])",
    "opacity: 0.15",
    "opacity: 1", // lit set back to full
    "vector-effect: non-scaling-stroke", // outline stays 2px at any zoom
    '[data-theme="light"] .tsk-graph svg[data-focus]', // accent remapped for light
  ])
    expect(css).toContain(part);
});
