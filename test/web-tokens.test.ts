import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const webDir = join(import.meta.dir, "..", "web");

test("AC8: web/*.js and index.html carry no raw hex — colours come only from vendored tokens", () => {
  const files = [...readdirSync(webDir).filter((f) => f.endsWith(".js")), "index.html"];
  const offenders = files.flatMap(
    (f) => readFileSync(join(webDir, f), "utf8").match(/#[0-9a-fA-F]{3,8}\b/g) ?? [],
  );
  expect(offenders).toEqual([]);
});

test("index.html styles the svg renderer by css-var classes and wires the vendor css + d3", () => {
  const html = readFileSync(join(webDir, "index.html"), "utf8");
  for (const cls of [
    "st-pending",
    "st-in-progress",
    "st-done",
    "st-cancelled",
    "st-blocked",
    "st-none",
  ])
    expect(html).toContain(cls); // status bar hues by class
  for (const e of [".edge.hard", ".edge.soft", ".edge.broken"]) expect(html).toContain(e);
  expect(html).toContain("/vendor/d3.min.js"); // the only js vendor besides elk
  expect(html).not.toContain("force-graph");
  for (const css of ["normalize", "theme.dark.switch", "sizes", "colors", "shadows", "easings"])
    expect(html).toContain(`/vendor/${css}.min.css`);
  expect(html).toContain('data-theme="dark"');
});
