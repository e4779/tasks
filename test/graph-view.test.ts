import { expect, test } from "bun:test";
import { join } from "node:path";
import { cardSize, serverCtx } from "../src/cards";
import { discover } from "../src/discover";
import { buildGraph } from "../src/graph";
import { renderGraph } from "../src/graph-view";
import { parseFile } from "../src/parse";
import { snapshot } from "../src/serve";

const FX = join(import.meta.dir, "fixtures");
const tasks = (await discover([FX])).flatMap((f) => {
  const r = parseFile(f, [FX]);
  return r.ok ? [r.v] : [];
});
const snap = snapshot(buildGraph(tasks));

const svg = await renderGraph(snap.nodes, snap.edges, (abs) => `/doc/${abs.split("/").pop()}`);

test("renders the full corpus as one inline SVG: cards, edges, trunk buses, legend", () => {
  expect(svg).toMatch(/<div class="tsk-graph"><svg data-zoom/); // height via flex fill — no aspect-ratio emission (operator 2026-11-19)
  expect(svg.match(/<g class="card /g)?.length).toBe(8); // 7 cards + missing-dep ghost
  expect(svg.match(/<path class="edge /g)?.length).toBeGreaterThan(0);
  expect(svg).toContain('class="tsk-legend"');
  expect(svg.match(/tsk-legend-sample/g)?.length).toBe(3); // hard/soft/cycle samples
  expect(svg).toContain(' ghost"'); // ghost card class
  expect(svg).not.toContain('href="/doc/tasks/missing-dep.md"'); // ghosts are not doc links
});

test("every card carries its elk rect and its cardSize-measured width (ac12 contract)", () => {
  const cards = [
    ...svg.matchAll(
      /<g class="card [^"]*" data-path="([^"]*)" data-x="(-?[\d.]+)" data-y="(-?[\d.]+)" data-w="([\d.]+)" data-h="([\d.]+)"/g,
    ),
  ];
  expect(cards.length).toBe(8);
  const decode = (s: string) =>
    s
      .replaceAll("&apos;", "'")
      .replaceAll("&quot;", '"')
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&amp;", "&");
  for (const [, path, x, y, w] of cards) {
    expect(path).toBeTruthy();
    expect(Number(x)).not.toBeNaN();
    expect(Number(y)).not.toBeNaN();
    const title = decode(
      svg.slice(svg.indexOf(`data-path="${path}"`)).match(/<text[^>]*>([^<]*)<\/text>/)?.[1] ?? "",
    );
    expect(Number(w)).toBe(cardSize(title, serverCtx).w); // rect sized by the same fn the probe re-runs
  }
});

test("no two cards overlap (ac9 contract, from the served attrs themselves)", () => {
  const rects = [
    ...svg.matchAll(/data-x="(-?[\d.]+)" data-y="(-?[\d.]+)" data-w="([\d.]+)" data-h="([\d.]+)"/g),
  ].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
    w: Number(m[3]),
    h: Number(m[4]),
  }));
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      if (a && b) {
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `cards ${i}Ã${j}`).toBeFalse();
      }
    }
});

test("edgeless corpus: rectPacking path, no edges painted, empty-state message for no matches", async () => {
  const edgeless = await renderGraph(
    snap.nodes.slice(0, 2).map((n) => ({ ...n, ghost: false })),
    [],
    () => "/doc/x",
  );
  expect(edgeless).not.toContain('data-from="'); // nothing to route — only the legend sample paths exist
  expect(edgeless).not.toContain("edge trunk");
  expect(edgeless).toContain('data-edges="0"');
  const empty = await renderGraph(
    snap.nodes.filter((n) => n.status === "wat"),
    snap.edges,
    () => "/doc/x",
  );
  expect(empty).toContain("no matching tasks");
});
