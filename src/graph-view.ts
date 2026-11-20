// Server-side graph renderer: snapshot nodes/edges → elk layout (server elkjs)
// → merge → break cycles → bundle edge buses → one inline SVG string with the
// elk coordinates in data-* attrs — the probe's geometry ACs read them back
// straight from the served HTML (curl level, no CDP).

import ELK from "elkjs";
import { cardSize, serverCtx } from "./cards.ts";
import { packComponents } from "./components.ts";
import { addHops, bundleEdges } from "./edge-bundler.ts";
import { mergeEdges } from "./edges.ts";
import { buildElkGraph, edgeId, mapLayout, polyToD } from "./elk-adapter.ts";
import { breakCycles } from "./graph-cycles.ts";
import { esc } from "./render.ts";
import type { Snapshot, SnapshotNode } from "./serve.ts";

// fixed layout aspect: elk only takes a ratio, and the server has no viewport.
// disco overshoots the ask ~×1.15 (ask 1.9 → real ≈2.2 measured on homelab), so
// both probe viewports keep their ac2 windows open: 1562x547 = 2.86 → coverW ≈
// 2.2/2.86 = 0.77 ≥ 0.5; 1920x1080 = 1.78 → coverH ≈ 1.78/2.2 = 0.81 ≥ 0.7.
export const GRAPH_ASPECT = 1.9;

const BAR = 4; // status colour bar, left inside the rect
const PAD = 2; // viewBox pad — slim: ac2 measures centre spread against the view, every pad px eats cover

const dim = (n: SnapshotNode): boolean => n.status === "done" || n.status === "cancelled";

// legend: static kind semantics, tokens via the shared .edge classes
const LEGEND = [
  ["hard", "blocks (hard)"],
  ["soft", "related (soft)"],
  ["broken", "cycle"],
] as const;
const legendHtml = (): string =>
  `<div class="tsk-legend">${LEGEND.map(
    ([kind, label]) =>
      `<div class="tsk-legend-row"><svg class="tsk-legend-sample" width="26" height="8" viewBox="0 0 26 8"><path d="M1 4H25" class="edge ${kind}"/></svg>${label}</div>`,
  ).join("")}</div>`;

let elk: InstanceType<typeof ELK> | null = null; // one ELK per process; its worker serializes layouts

export const renderGraph = async (
  nodes: readonly SnapshotNode[],
  edges: Snapshot["edges"],
  docHref: (abs: string) => string,
): Promise<string> => {
  if (nodes.length === 0) return `<div class="tsk-graph tsk-empty">no matching tasks</div>`;
  const nodeObjs = nodes.map((n) => ({ ...n, id: n.path }));
  const byPath = new Map(nodeObjs.map((n) => [n.path, n]));
  const kept = edges.filter((e) => byPath.has(e.from) && byPath.has(e.to));
  // render-prep only (AC7): merge parallels/mutual pairs — the snapshot keeps
  // every edge, the canvas draws one line per relation; no 2-cycles reach elk,
  // so breakCycles only ever handles 3+ cycles (broken style)
  const merged = mergeEdges(kept);
  const { broken } = breakCycles(nodes, merged);
  const brokenIds = new Set(broken.map(edgeId));
  const sizes = new Map(nodeObjs.map((n) => [n.id, cardSize(n.title, serverCtx)]));
  elk ??= new ELK();
  const result = await elk.layout(buildElkGraph(nodeObjs, sizes, merged, GRAPH_ASPECT));
  // elk ignores the aspect once the corpus has several components — repack its
  // own component boxes against GRAPH_ASPECT (rigid translation, routing intact)
  const laid = mapLayout(result);
  const { rects, polylines } = packComponents(laid.rects, laid.polylines, merged, GRAPH_ASPECT);
  // edge buses: parallel horizontal runs merge into kind-homogeneous shared
  // trunks BEFORE painting (groups of 1 are identity — bus-free corpora paint
  // exactly what they painted before)
  const { pieces, trunks } = bundleEdges(polylines, merged, rects);
  // H1: interior inter-edge crossings get semicircle hops (vertical side hops,
  // trunks run continuous) — points+hops serialized by polyToD afterwards
  const hopped = addHops(pieces, trunks);

  // ONE coordinate world: everything below carries raw elk coords, the
  // viewBox is the only bridge to screen space — cards and edges cannot
  // drift apart, so nothing ever trims or reattaches an endpoint
  const xs = [...rects.values()].flatMap((r) => [r.x, r.x + r.w]);
  const ys = [...rects.values()].flatMap((r) => [r.y, r.y + r.h]);
  const w = Math.max(...xs) - Math.min(...xs) + 2 * PAD;
  const h = Math.max(...ys) - Math.min(...ys) + 2 * PAD;
  const viewBox = `${Math.min(...xs) - PAD} ${Math.min(...ys) - PAD} ${w} ${h}`;

  // the container adopts the WORLD's aspect (the server has no viewport, so
  // the box meets the viewBox exactly): meet-fit then covers ~100% of both
  // axes at any viewport — ac2 stops depending on elk honouring the aspect
  // ask. CSS caps extreme heights; wide fans (a 14-wide blocker star) stay
  // short bands instead of letterboxing inside a fixed 70vh box.
  const out: string[] = [
    // data-edges: pre-filter corpus edge count — the probe's zero-links
    // semantics (edgeless corpora legitimately paint nothing)
    `<div class="tsk-graph"><svg data-zoom data-edges="${edges.length}" viewBox="${viewBox}" role="img" aria-label="task graph"><g>`,
  ];
  // D3b: shared segments draw ONCE — N members rising to the same card emit
  // identical stub d strings; keep the first occurrence (its from/to survives
  // as provenance for the shared line)
  const seenD = new Set<string>();
  const emit = (cls: string, attrs: string, d: string) => {
    if (seenD.has(d)) return;
    seenD.add(d);
    out.push(`<path class="${cls}"${attrs} d="${d}"/>`);
  };
  for (const t of trunks)
    emit(
      `edge trunk ${t.kind}`,
      "",
      polyToD([
        { x: t.x0, y: t.y },
        { x: t.x1, y: t.y },
      ]),
    ); // trunk paint follows member kind
  for (const e of merged)
    for (const poly of hopped.get(edgeId(e)) ?? []) {
      if (poly.length < 2) continue; // unrouted edge (e.g. self-loop)
      emit(
        `edge ${e.kind}${brokenIds.has(edgeId(e)) ? " broken" : ""}`,
        ` data-from="${esc(e.from)}" data-to="${esc(e.to)}"`,
        polyToD(poly),
      );
    }
  for (const n of nodeObjs) {
    const r = rects.get(n.path);
    if (!r) continue;
    const card = `<g class="card st-${n.status ?? "none"}${n.ghost ? " ghost" : ""}${dim(n) ? " dim" : ""}" data-path="${esc(n.path)}" data-x="${r.x}" data-y="${r.y}" data-w="${r.w}" data-h="${r.h}" transform="translate(${r.x} ${r.y})"><rect class="box" width="${r.w}" height="${r.h}" rx="4"/>${n.ghost ? "" : `<rect class="bar" width="${BAR}" height="${r.h}"/>`}<text x="${r.w / 2 + BAR / 2}" y="${r.h / 2}">${esc(n.title)}</text></g>`;
    // full title — the rect is sized for it (cardSize measure + padding);
    // any future cap must cut by measured width, never char count
    out.push(n.ghost ? card : `<a href="${docHref(n.path)}">${card}</a>`);
  }
  out.push(`</g></svg>${legendHtml()}</div>`);
  return out.join("");
};
