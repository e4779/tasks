// UMD globals from /vendor/d3.min.js + /vendor/elk.bundled.js — global d3,
// one file, no module graph
import { cardSize, intersect, pointOnRect } from "./cards.js";
import { bundleEdges } from "./edge-bundler.js";
import { mergeEdges } from "./edges.js";
import { buildElkGraph, edgeId, mapLayout, polyToD } from "./elk-adapter.js";
import { breakCycles } from "./graph-cycles.js";

const { d3, ELK } = globalThis;

const dim = (n) => n.status === "done" || n.status === "cancelled";

// legend: static kind semantics, tokens via the shared .edge classes
const LEGEND = [
  ["hard", "blocks (hard)"],
  ["soft", "related (soft)"],
  ["broken", "cycle"],
];
const legendDom = () => {
  const box = document.createElement("div");
  box.className = "tsk-legend";
  for (const [kind, label] of LEGEND) {
    const row = document.createElement("div");
    row.className = "tsk-legend-row";
    const s = svgEl("svg", {
      class: "tsk-legend-sample",
      width: 26,
      height: 8,
      viewBox: "0 0 26 8",
    });
    s.append(svgEl("path", { d: "M1 4H25", class: `edge ${kind}` }));
    row.append(s, document.createTextNode(label));
    box.append(row);
  }
  return box;
};

const BAR = 4; // status colour bar, left inside the rect
const PAD = 2; // viewBox pad — slim: ac2 measures centre spread against the view, every pad px eats cover
const SVG_NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}) => {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

// probe/test hook: --ac validates geometry through the same pure fns the
// renderer could use — no duplicated rect math in the probe
globalThis.tskCards = { intersect, pointOnRect };

let elk; // one ELK per page; its worker serializes the layouts
let mctx; // measure context for cardSize

class TskGraph extends HTMLElement {
  gen = 0; // filters can re-enter paint() while ELK runs; last call wins

  connectedCallback() {
    this.resizeObserver?.disconnect();
    // svg attrs track the container, so the viewBox meet-fit keeps mapping
    // elk space onto exactly 100% of the element on every resize (AC1)
    this.resizeObserver = new ResizeObserver(() => this.sizeSvg());
    this.resizeObserver.observe(this);
    if (this.data) this.paint();
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
  }

  sizeSvg() {
    const svg = this.querySelector("svg");
    if (svg) {
      svg.setAttribute("width", this.clientWidth || 800);
      svg.setAttribute("height", this.clientHeight || 500);
    }
  }

  update({ nodes, edges }) {
    this.gen++; // invalidate any in-flight layout: its graph is gone
    if (nodes.length === 0) {
      this.data = null;
      this.replaceChildren(document.createTextNode("no matching tasks"));
      return;
    }
    this.data = { nodes, edges };
    if (this.isConnected) this.paint();
  }

  // one svg per element for its lifetime; filters re-render only the world
  // group, so the zoom transform (svg.__zoom) survives filtering
  ensureSvg() {
    const existing = this.querySelector("svg");
    if (existing) return existing;
    const svg = svgEl("svg", { width: this.clientWidth || 800, height: this.clientHeight || 500 });
    svg.append(svgEl("g"));
    svg.addEventListener("click", (e) => {
      const path = e.target.closest?.(".card")?.dataset.path;
      if (path) location.hash = `#/doc?path=${encodeURIComponent(path)}`;
    });
    d3.select(svg).call(
      // wheel/pinch/dblclick zoom + drag pan; d3 stores the live transform
      // on the element itself (svg.__zoom) where the probe reads it
      d3
        .zoom()
        .on("zoom", ({ transform }) => svg.querySelector("g").setAttribute("transform", transform)),
    );
    this.replaceChildren(svg, legendDom());
    return svg;
  }

  async paint() {
    const gen = ++this.gen;
    const svg = this.ensureSvg();
    const world = svg.querySelector("g");
    const w = Number(svg.getAttribute("width")) || 800;
    const h = Number(svg.getAttribute("height")) || 500;
    const { nodes, edges } = this.data;
    const nodeObjs = nodes.map((n) => ({ ...n, id: n.path }));
    const byPath = new Map(nodeObjs.map((n) => [n.path, n]));
    const kept = edges.filter((e) => byPath.has(e.from) && byPath.has(e.to));
    // render-prep only (AC7): merge parallels/mutual pairs — the snapshot
    // keeps every edge, the canvas draws one line per relation; no 2-cycles
    // reach elk, so breakCycles only ever handles 3+ cycles (broken style)
    const merged = mergeEdges(kept);
    const { broken } = breakCycles(nodes, merged);
    const brokenIds = new Set(broken.map(edgeId));
    mctx ??= document.createElement("canvas").getContext("2d");
    const sizes = new Map(nodeObjs.map((n) => [n.id, cardSize(n.title, mctx)]));
    elk ??= new ELK();
    const result = await elk.layout(buildElkGraph(nodeObjs, sizes, merged, w / h));
    if (gen !== this.gen) return; // stale: a newer paint() owns the graph
    const { rects, polylines } = mapLayout(result);
    // edge buses: parallel horizontal runs merge into kind-homogeneous shared
    // trunks BEFORE painting — a bundled member paints pieces (stubs onto the
    // trunk), never its own horizontal run, and card-attached stubs snap to
    // the card centre (one drop/rise per card); groups of 1 are identity, so
    // bus-free corpora paint exactly what they painted before
    const { pieces, trunks } = bundleEdges(polylines, merged, rects);

    // ONE coordinate world: everything below carries raw elk coords, the
    // viewBox is the only bridge to screen space — cards and edges cannot
    // drift apart, so nothing ever trims or reattaches an endpoint
    const xs = [...rects.values()].flatMap((r) => [r.x, r.x + r.w]);
    const ys = [...rects.values()].flatMap((r) => [r.y, r.y + r.h]);
    svg.setAttribute(
      "viewBox",
      `${Math.min(...xs) - PAD} ${Math.min(...ys) - PAD} ${Math.max(...xs) - Math.min(...xs) + 2 * PAD} ${
        Math.max(...ys) - Math.min(...ys) + 2 * PAD
      }`,
    );
    world.replaceChildren();
    for (const t of trunks)
      world.append(
        svgEl("path", {
          d: polyToD([
            { x: t.x0, y: t.y },
            { x: t.x1, y: t.y },
          ]),
          class: `edge trunk ${t.kind}`, // trunk paint follows member kind
        }),
      );
    for (const e of merged) {
      for (const poly of pieces.get(edgeId(e)) ?? []) {
        if (poly.length < 2) continue; // unrouted edge (e.g. self-loop)
        world.append(
          svgEl("path", {
            d: polyToD(poly),
            class: `edge ${e.kind}${brokenIds.has(edgeId(e)) ? " broken" : ""}`,
            "data-from": e.from,
            "data-to": e.to,
          }),
        );
      }
    }
    for (const n of nodeObjs) {
      const r = rects.get(n.id);
      if (!r) continue;
      const card = svgEl("g", {
        class: `card st-${n.status ?? "none"}${n.ghost ? " ghost" : ""}${dim(n) ? " dim" : ""}`,
        "data-path": n.path,
        // the elk rect verbatim — the --ac gate reads geometry back from here
        "data-x": r.x,
        "data-y": r.y,
        "data-w": r.w,
        "data-h": r.h,
        transform: `translate(${r.x} ${r.y})`,
      });
      card.append(svgEl("rect", { class: "box", width: r.w, height: r.h, rx: 4 }));
      if (!n.ghost) card.append(svgEl("rect", { class: "bar", width: BAR, height: r.h }));
      const text = svgEl("text", { x: r.w / 2 + BAR / 2, y: r.h / 2 });
      // full title — the rect is sized for it (cardSize measureText + padding);
      // any future cap must cut by measured width, never char count
      text.textContent = n.title;
      card.append(text);
      world.append(card);
    }
  }
}
customElements.define("tsk-graph", TskGraph);
