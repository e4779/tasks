import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// tasks/lod-labels.md: card text fades with the zoom scale. Same contract style
// as web-tokens.test.ts — the logic itself is probed live via CDP (tools/probe
// --eval), this guards the wiring surviving merges (sibling worktrees also edit
// web/main.js).
const root = join(import.meta.dir, "..");
const js = readFileSync(join(root, "web/main.js"), "utf8");
const css = readFileSync(join(root, "web/style.css"), "utf8");

test("LOD: bindZoom drives one css var from the zoom scale; css fades text only", () => {
  for (const part of [
    '"--lod"', // the single channel between zoom handler and css
    "- 0.45", // fade band start
    "/ 0.2", // band width (0.45..0.65) — the clamp denominator
    'setProperty("--lod"', // written on the svg root, never per-text
  ])
    expect(js).toContain(part);
  expect(css).toContain(".tsk-graph svg text");
  expect(css).toContain("opacity: var(--lod, 1)"); // default = labels visible (JS off)
});
