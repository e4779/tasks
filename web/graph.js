// UMD global from /vendor/force-graph.min.js — dist .mjs has bare imports, unusable without a build step
import { bboxOf, fitStretch } from "./camera.js";
import { breakCycles } from "./graph-cycles.js";

const { ForceGraph } = globalThis;

const STATUS_COLOR = {
  pending: "#e0af68",
  "in-progress": "#7aa2f7",
  done: "#9ece6a",
  cancelled: "#f7768e",
};
const trunc = (s, max = 22) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
const dim = (n) => n.status === "done" || n.status === "cancelled";

class TskGraph extends HTMLElement {
  // update() runs while the element is still detached (app.js builds views
  // before inserting them) — clientWidth would be 0, so painting waits for
  // connectedCallback where layout is real
  connectedCallback() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() =>
      this.fg?.width(this.clientWidth || 800).height(this.clientHeight || 500),
    );
    this.resizeObserver.observe(this);
    if (this.data) this.paint();
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
  }

  update({ nodes, edges }) {
    if (nodes.length === 0) {
      this.fg?.pauseAnimation();
      this.fg = null;
      this.data = null;
      this.cycleLinks = [];
      this.replaceChildren(document.createTextNode("no matching tasks"));
      return;
    }
    this.data = { nodes, edges };
    if (this.isConnected) this.paint();
  }

  buildFg() {
    const fg = ForceGraph()(this)
      .width(this.clientWidth || 800)
      .height(this.clientHeight || 500)
      .dagMode("td")
      .dagLevelDistance(80)
      // wall-clock cooldown: engineStop lands at a frame-rate-independent
      // moment, so the fit (and the probe) is not at the mercy of RAF pacing
      .cooldownTime(3000)
      .nodeRelSize(5)
      .linkWidth(1.5)
      .linkColor((l) => (l.kind === "hard" ? "#7aa2f7" : "#565f89"))
      .linkLineDash((l) => (l.kind === "soft" ? [5, 4] : []))
      .nodeLabel((n) => n.id)
      .onNodeClick((n) => {
        location.hash = `#/doc?path=${encodeURIComponent(n.id)}`;
      })
      // eager zoomToFit reads pre-tick positions (x/y undefined) and leaves a
      // NaN camera transform — dead wheel, nodes collapsed to a corner; fit
      // only once per data load, after the engine settles
      .onEngineStop(() => {
        if (!this.needsFit) return;
        this.needsFit = false;
        const nodes = fg.graphData().nodes;
        const bb = bboxOf(nodes);
        if (!bb) return; // shortcut: ≤1 positioned node has no spread to fit
        const { sx, sy } = fitStretch(bb, {
          w: this.clientWidth || 800,
          h: this.clientHeight || 500,
        });
        const cx = (bb.x0 + bb.x1) / 2;
        const cy = (bb.y0 + bb.y1) / 2;
        for (const n of nodes) {
          if (typeof n.x !== "number" || typeof n.y !== "number") continue;
          n.x = cx + (n.x - cx) * sx;
          n.y = cy + (n.y - cy) * sy;
        }
        fg.zoomToFit(300, 40);
      })
      // broken cycle edges: force-graph's dag pass reads ALL graphData links, so
      // they cannot be links; drawn per-frame instead — visible, never layered
      .onRenderFramePost((ctx) => {
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = "#f7768e";
        ctx.lineWidth = 1.5;
        for (const l of this.cycleLinks ?? []) {
          if (typeof l.source?.x !== "number" || typeof l.target?.x !== "number") continue;
          ctx.beginPath();
          ctx.moveTo(l.source.x, l.source.y);
          ctx.lineTo(l.target.x, l.target.y);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      })
      // shortcut: canvas labels get cramped beyond ~50 nodes; upgrade to zoom-based label fading
      .nodeCanvasObject((node, ctx, globalScale) => {
        const r = 5;
        ctx.globalAlpha = dim(node) ? 0.35 : 1;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
        ctx.fillStyle = node.ghost ? "#20232b" : (STATUS_COLOR[node.status] ?? "#565f89");
        ctx.fill();
        if (node.ghost) {
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = "#565f89";
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.font = `${12 / globalScale}px system-ui, sans-serif`;
        ctx.fillStyle = "#c0caf5";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(trunc(node.title), node.x, node.y - r - 2);
        ctx.globalAlpha = 1;
      });
    return fg;
  }

  paint() {
    this.fg ??= this.buildFg();
    this.fg.width(this.clientWidth || 800).height(this.clientHeight || 500);
    const { nodes, edges } = this.data;
    const nodeObjs = nodes.map((n) => ({ ...n, id: n.path }));
    const byPath = new Map(nodeObjs.map((n) => [n.path, n]));
    // dagMode throws on cycles: layer over the acyclic set; same node objects so
    // the overlay picks up live x/y as the simulation moves them
    const { edges: acyclic, broken } = breakCycles(nodes, edges);
    this.cycleLinks = broken
      .map((e) => ({ source: byPath.get(e.from), target: byPath.get(e.to) }))
      .filter((l) => l.source && l.target);
    const links = acyclic
      .map((e) => ({ source: byPath.get(e.from), target: byPath.get(e.to), kind: e.kind }))
      .filter((l) => l.source && l.target);
    this.needsFit = true;
    this.fg.graphData({ nodes: nodeObjs, links });
  }
}
customElements.define("tsk-graph", TskGraph);
