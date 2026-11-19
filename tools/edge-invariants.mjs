#!/usr/bin/env node
// Machine gate for the /graph edge-routing invariants (tasks/edge-routing-hygiene.md):
//   D1  per-card bottom-attach x ∩ top-attach x = ∅ (no line pierces a card)
//   D2  no vertical backtrack within one edge path (monotonic verticals)
//   D3a no collinear consecutive segments (no phantom knees)
//   D3b no duplicate path `d` strings in the emitted SVG (shared segments once)
// Curl-level: fetch the route, parse the served SVG, verdict, exit 1 on any
// violation. Plain node, no deps.
//
// Usage: node tools/edge-invariants.mjs <url>   (e.g. http://127.0.0.1:8983/graph)

const url = process.argv[2];
if (!url) {
  console.error("usage: node tools/edge-invariants.mjs <url>");
  process.exit(2);
}

const EPS = 1e-6; // quantized pipeline: geometry-equal coords match exactly
const COLLIDE = 0.5; // attach x closer than this counts as the same attach point

const html = await (await fetch(url)).text();

// scope: the main data-zoom svg only — the legend renders its own sample
// glyphs in sibling svgs (three intentionally identical shapes, not graph)
const main = /<svg data-zoom[^>]*>([\s\S]*?)<\/svg>/.exec(html)?.[1] ?? "";
if (!main) {
  console.error("no data-zoom svg at", url);
  process.exit(2);
}

const decode = (s) =>
  s
    .replaceAll("&apos;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
const short = (p) =>
  String(p || "")
    .split("/")
    .pop();

const cards = [
  ...main.matchAll(
    /<g class="card [^"]*" data-path="([^"]*)" data-x="(-?[\d.]+)" data-y="(-?[\d.]+)" data-w="([\d.]+)" data-h="([\d.]+)"/g,
  ),
].map((m) => ({
  path: decode(m[1]),
  x: Number(m[2]),
  y: Number(m[3]),
  w: Number(m[4]),
  h: Number(m[5]),
}));
const paths = [...main.matchAll(/<path class="edge([^"]*)"[^>]*?d="([^"]+)"/g)].map((m) => ({
  cls: (m[1] ?? "").trim(),
  d: m[2] ?? "",
  trunk: (m[1] ?? "").includes("trunk"),
  from: decode(/data-from="([^"]*)"/.exec(m[0] ?? "")?.[1] ?? "") || null,
  to: decode(/data-to="([^"]*)"/.exec(m[0] ?? "")?.[1] ?? "") || null,
  poly: [...(m[2] ?? "").matchAll(/[ML](-?[\d.eE+-]+) (-?[\d.eE+-]+)/g)].map((p) => ({
    x: Number(p[1]),
    y: Number(p[2]),
  })),
}));
const pieces = paths.filter((p) => !p.trunk);

const report = { url, cards: cards.length, paths: paths.length, D1: [], D2: [], D3a: [], D3b: [] };

// --- D1: per-card bottom-attach x ∩ top-attach x = ∅ -------------------------
// attach = a piece endpoint sitting on a card's top or bottom border
const border = (card, pt) =>
  pt.x >= card.x - 1 &&
  pt.x <= card.x + card.w + 1 &&
  (Math.abs(pt.y - card.y) <= 1 || Math.abs(pt.y - (card.y + card.h)) <= 1);
const attach = new Map(); // card path → { top: number[], bottom: number[] }
for (const p of pieces) {
  for (const pt of [p.poly[0], p.poly.at(-1)]) {
    if (!pt) continue;
    const card = cards.find((c) => border(c, pt));
    if (!card) continue;
    const side = Math.abs(pt.y - card.y) <= 1 ? "top" : "bottom";
    const rec = attach.get(card.path) ?? { top: [], bottom: [] };
    rec[side].push(pt.x);
    attach.set(card.path, rec);
  }
}
for (const [path, { top, bottom }] of attach)
  for (const b of bottom)
    for (const t of top)
      if (Math.abs(b - t) < COLLIDE) report.D1.push(`${short(path)}: bottom x=${b} == top x=${t}`);

// named check from the ruling: thm012 incoming trunk x ≠ outgoing exit x
const thm = cards.find(
  (c) => short(c.path) === "thm012-m1-live-deploy-soak.md" || short(c.path) === "thm012",
);
let thmVerdict = "n/a (no thm012 card in this corpus)";
if (thm) {
  const rec = attach.get(thm.path) ?? { top: [], bottom: [] };
  const clash = rec.bottom.filter((b) => rec.top.some((t) => Math.abs(b - t) < COLLIDE));
  thmVerdict = clash.length
    ? `FAIL — shared attach x: ${clash.join(", ")}`
    : `pass — incoming bottom [${rec.bottom.join(", ") || "none"}] vs outgoing top [${rec.top.join(", ") || "none"}]`;
}

// --- D2: no vertical backtrack within one edge path ---------------------------
for (const p of pieces) {
  const name = `${short(p.from)}→${short(p.to)}`;
  // maximal vertical runs (consecutive points at one x); each must be
  // monotonic, and consecutive runs must keep the same direction
  const runs = [];
  for (let i = 1; i < p.poly.length; i++) {
    const a = p.poly[i - 1];
    const b = p.poly[i];
    if (a && b && Math.abs(a.x - b.x) <= EPS) {
      const last = runs.at(-1);
      if (last && Math.abs(last.x - b.x) <= EPS) last.ys.push(b.y);
      else runs.push({ x: b.x, ys: [a.y, b.y] });
    }
  }
  for (const r of runs)
    for (let i = 2; i < r.ys.length; i++) {
      const d1 = Math.sign(r.ys[i - 1] - r.ys[i - 2]);
      const d2 = Math.sign(r.ys[i] - r.ys[i - 1]);
      if (d1 && d2 && d1 !== d2)
        report.D2.push(`${name}: backtrack inside vertical at x=${r.x} (${r.ys.join("→")})`);
    }
  for (let i = 1; i + 1 < runs.length; i++) {
    const _d1 = Math.sign(runs[i].ys.at(-1) - runs[i].ys[0]);
    const d0 = Math.sign(runs[i - 1].ys.at(-1) - runs[i - 1].ys[0]);
    const d2 = Math.sign(runs[i + 1].ys.at(-1) - runs[i + 1].ys[0]);
    if (d0 && d2 && d0 !== d2)
      report.D2.push(
        `${name}: vertical direction reversal around x=${runs[i].x} (${d0} then ${d2})`,
      );
  }
}

// --- D3a: no collinear consecutive segments -----------------------------------
for (const p of pieces) {
  const name = `${short(p.from)}→${short(p.to)}`;
  for (let i = 1; i + 1 < p.poly.length; i++) {
    const a = p.poly[i - 1];
    const b = p.poly[i];
    const c = p.poly[i + 1];
    if (!a || !b || !c) continue;
    const colX = Math.abs(a.x - b.x) <= EPS && Math.abs(b.x - c.x) <= EPS;
    const colY = Math.abs(a.y - b.y) <= EPS && Math.abs(b.y - c.y) <= EPS;
    if (colX || colY) report.D3a.push(`${name}: collinear knee at ${JSON.stringify(b)}`);
  }
}

// --- D3b: no duplicate path d strings -----------------------------------------
const counts = new Map();
for (const p of paths) counts.set(p.d, (counts.get(p.d) ?? 0) + 1);
for (const [d, n] of counts) if (n > 1) report.D3b.push(`${n}× ${d}`);

// --- report -------------------------------------------------------------------
const line = (label, list) => {
  const ok = list.length === 0;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` (${list.length})`}`);
  for (const item of list.slice(0, 12)) console.log(`      ${item}`);
  if (list.length > 12) console.log(`      … +${list.length - 12} more`);
};
console.log(`== edge invariants — ${url}`);
console.log(
  `   cards=${cards.length} paths=${paths.length} (trunks=${paths.length - pieces.length})`,
);
line("D1  per-card bottom ∩ top attach x = ∅", report.D1);
line("D2  no vertical backtrack in a path", report.D2);
line("D3a no collinear consecutive segments", report.D3a);
line("D3b no duplicate path d strings", report.D3b);
console.log(`thm012: ${thmVerdict}`);
const fail = report.D1.length + report.D2.length + report.D3a.length + report.D3b.length;
console.log(`RESULT: ${fail === 0 ? "PASS" : `FAIL (${fail} violations)`}`);
process.exit(fail === 0 ? 0 : 1);
