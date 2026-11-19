#!/usr/bin/env bun
// CDP probe for the web layer: one NEW chrome tab per run (127.0.0.1:9222),
// RAF-shimmed (background tabs have dead RAF), console/exception-capturing.
// Usage: bun tools/probe.mjs <url> [--settle-ms N] [--eval '<js>'] [--canvas out.png] [--ac]
//        [--viewport WxH]  — CDP Emulation.setDeviceMetricsOverride before nav
// JSON report → stdout; exit 1 on ANY console error or uncaught exception.
// --ac: operator acceptance gate AC1-AC13 (AC4 labels → vision, out of probe).
// --canvas: full-page png screenshot (Page.captureScreenshot, svg renderer).

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const DEFAULT_EVAL = `(() => {
  const g = document.querySelector('tsk-graph');
  const svg = g && g.querySelector('svg');
  if (!svg) return { svg: false };
  const cards = [...svg.querySelectorAll('g.card')];
  const xs = cards.map((c) => Number(c.dataset.x));
  const ys = cards.map((c) => Number(c.dataset.y));
  return {
    svg: true,
    w: Number(svg.getAttribute('width')),
    h: Number(svg.getAttribute('height')),
    viewBox: svg.getAttribute('viewBox'),
    nodes: cards.length,
    links: svg.querySelectorAll('path.edge').length,
    ySpread: ys.length ? Math.round(Math.max(...ys) - Math.min(...ys)) : 0,
    xSpread: xs.length ? Math.round(Math.max(...xs) - Math.min(...xs)) : 0,
  };
})()`;

// AC1-AC3, AC7-AC12 state gathering. Screen truth comes straight from the
// browser (getBoundingClientRect — viewBox fit + zoom transform, whatever the
// css did); layout truth from the data-* attrs carrying raw elk coordinates.
export const AC_STATE_EVAL = `(() => {
  const g = document.querySelector('tsk-graph');
  if (!g) return { fatal: 'tsk-graph missing' };
  const svg = g.querySelector('svg');
  if (!svg) return { fatal: 'svg missing' };
  const cards = globalThis.tskCards;
  if (!cards) return { fatal: 'tskCards hook missing' };
  // AC7/AC10/AC11 zero-links semantics: the raw corpus edge count (pre-filter,
  // pre-merge) decides whether zero painted links is the contract or a defect
  const corpusEdges = document.querySelector('tsk-app')?.state?.snap?.edges?.length ?? null;
  // AC9: elk-space card rects as painted (data attrs = mapLayout output)
  const cardEls = [...svg.querySelectorAll('g.card')];
  const rects = cardEls.map((c) => ({
    path: String(c.dataset.path),
    id: String(c.dataset.path).split('/').pop(),
    x: Number(c.dataset.x), y: Number(c.dataset.y),
    w: Number(c.dataset.w), h: Number(c.dataset.h),
  }));
  const overlaps = [];
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++)
      if (cards.intersect(rects[i], rects[j]))
        overlaps.push(rects[i].id + '×' + rects[j].id);
  const R = (v) => Math.round(v * 10) / 10;
  const sb = svg.getBoundingClientRect();
  const pts = cardEls.map((c) => {
    const b = c.getBoundingClientRect();
    return { id: String(c.dataset.path).split('/').pop(), x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  // AC10/AC11: painted edges ARE the elk polylines — parse the path d back.
  // Bundled members paint PIECES (data-from/to kept) plus shared trunks
  // (path.edge.trunk, no data attrs): geometry gates look at pieces only,
  // the bus detector below looks at every horizontal on the painted DOM
  const edgeEls = [...svg.querySelectorAll('path.edge:not(.trunk)')];
  const short = (s) => String(s).split('/').pop();
  // AC7: the cyclic pair must merge to exactly one undirected cycle edge —
  // count DISTINCT unordered pairs among cyclic-a/cyclic-b pieces (a bundled
  // pair paints 2 pieces + its trunk; it must still count between: 1)
  const pairKey = (el) => [String(el.dataset.from), String(el.dataset.to)].sort().join('⇄');
  const pairEdges = edgeEls.filter((p) => {
    const f = String(p.dataset.from);
    const t = String(p.dataset.to);
    return (
      (f.endsWith("cyclic-a.md") && t.endsWith("cyclic-b.md")) ||
      (f.endsWith("cyclic-b.md") && t.endsWith("cyclic-a.md"))
    );
  });
  const cyclePairCount = (els) => new Set(els.map(pairKey)).size;
  const byPath = new Map(rects.map((r) => [r.path, r]));
  const gap = (p, r) => Math.max(r.x - p.x, p.x - r.x - r.w, r.y - p.y, p.y - r.y - r.h, 0);
  // AC11 piece semantics: a piece's OUTER endpoint sits 0-gap on its card
  // rect; its INNER endpoint sits ON a trunk (y at the trunk line, x inside
  // its span) — no false :src/:dst fails on bundled pieces
  const trunkSegs = [...svg.querySelectorAll('path.edge.trunk')].flatMap((el) => {
    const m = [...el.getAttribute('d').matchAll(/[ML](-?[\\d.]+) (-?[\\d.]+)/g)];
    return m.length === 2
      ? [{ y: Number(m[0][2]), x0: Math.min(Number(m[0][1]), Number(m[1][1])), x1: Math.max(Number(m[0][1]), Number(m[1][1])) }]
      : [];
  });
  const onTrunk = (pt) =>
    trunkSegs.some((t) => Math.abs(pt.y - t.y) <= 1 && pt.x >= t.x0 - 1 && pt.x <= t.x1 + 1);
  const edgeIssues = [];
  const attach = [];
  const attachIssues = [];
  const piecePolys = []; // parsed once here, reused by the AC14 member scan
  for (const p of edgeEls) {
    const name = short(p.dataset.from) + '→' + short(p.dataset.to);
    const poly = [...p.getAttribute('d').matchAll(/[ML](-?[\\d.]+) (-?[\\d.]+)/g)].map((m) => ({
      x: Number(m[1]), y: Number(m[2]),
    }));
    piecePolys.push({ el: p, poly });
    if (poly.length < 2) { edgeIssues.push(name + ':no-polyline'); continue; }
    for (let i = 0; i + 1 < poly.length; i++)
      if (Math.abs(poly[i].x - poly[i + 1].x) > 1e-9 && Math.abs(poly[i].y - poly[i + 1].y) > 1e-9)
        edgeIssues.push(name + ':diagonal');
    const sr = byPath.get(p.dataset.from);
    const dr = byPath.get(p.dataset.to);
    const last = poly[poly.length - 1];
    attach.push(name + '+' + (sr && dr ? R(gap(poly[0], sr)) + '/' + R(gap(last, dr)) : '?/?'));
    if (!sr || !(cards.pointOnRect(poly[0], sr, 1) || onTrunk(poly[0]))) attachIssues.push(name + ':src');
    if (!dr || !(cards.pointOnRect(last, dr, 1) || onTrunk(last))) attachIssues.push(name + ':dst');
  }
  // AC13 edge buses: every horizontal segment on the painted DOM (pieces,
  // identity edges, trunks), grouped by y-band ±20 with transitive x-overlap
  // WITHIN ONE KIND — per-kind bundling stacks hard/soft trunks side by side
  // in one visual corridor, so the invariant is one horizontal PER KIND per
  // band; same-kind horizontals sharing a band stay an unbundled bus
  const kindOf = (el) =>
    ['hard', 'soft', 'cycle'].find((k) => el.classList.contains(k)) ?? '?';
  const segs = [];
  for (const el of svg.querySelectorAll('path.edge')) {
    const poly = [...el.getAttribute('d').matchAll(/[ML](-?[\\d.]+) (-?[\\d.]+)/g)].map((m) => ({
      x: Number(m[1]), y: Number(m[2]),
    }));
    for (let i = 0; i + 1 < poly.length; i++)
      if (Math.abs(poly[i].y - poly[i + 1].y) < 1e-9 && Math.abs(poly[i].x - poly[i + 1].x) > 1e-9)
        segs.push({
          y: poly[i].y,
          x0: Math.min(poly[i].x, poly[i + 1].x),
          x1: Math.max(poly[i].x, poly[i + 1].x),
          kind: kindOf(el),
        });
  }
  const par = segs.map((_, i) => i);
  const find = (i) => {
    while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; }
    return i;
  };
  for (let a = 0; a < segs.length; a++)
    for (let b = a + 1; b < segs.length; b++)
      if (
        segs[a].kind === segs[b].kind &&
        Math.abs(segs[a].y - segs[b].y) <= 20 && segs[a].x0 < segs[b].x1 && segs[b].x0 < segs[a].x1
      )
        par[find(a)] = find(b);
  const groups = new Map();
  segs.forEach((s, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), s]));
  const buses = [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => g.map((s) => Math.round(s.y) + ':' + Math.round(s.x0) + '→' + Math.round(s.x1)));
  // AC14 per-kind bundles + shared drops + legend: member stubs per trunk
  // share ONE kind; per (source card, trunk) exactly one drop x and per
  // (target card, trunk) exactly one rise x (card-centre snapping); legend
  // box with three samples lives on the graph view
  const legendEl = g.querySelector('.tsk-legend');
  const members = trunkSegs.map(() => ({ kinds: new Set(), drops: new Map(), rises: new Map() }));
  for (const { el: p, poly } of piecePolys) {
    for (let ti = 0; ti < trunkSegs.length; ti++) {
      const t = trunkSegs[ti];
      const free = poly.filter(
        (pt) => !(Math.abs(pt.y - t.y) <= 1 && pt.x >= t.x0 - 1 && pt.x <= t.x1 + 1),
      );
      if (free.length === poly.length || free.length === 0) continue; // not a member / connector
      const m = members[ti];
      m.kinds.add(kindOf(p));
      const fr = byPath.get(String(p.dataset.from));
      const to = byPath.get(String(p.dataset.to));
      const put = (map, id, pt) => map.set(id, [...(map.get(id) ?? []), Math.round(pt.x)]);
      for (const pt of free) {
        if (fr && cards.pointOnRect(pt, fr, 1)) put(m.drops, String(p.dataset.from), pt);
        if (to && cards.pointOnRect(pt, to, 1)) put(m.rises, String(p.dataset.to), pt);
      }
    }
  }
  const bundles = {
    legend: {
      present: !!legendEl,
      samples: legendEl ? legendEl.querySelectorAll('path.edge').length : 0,
    },
    trunkCount: trunkSegs.length,
    mixed: members.map((m, i) => (m.kinds.size > 1 ? i : -1)).filter((i) => i >= 0),
    multiDrop: members.flatMap((m, ti) => [
      ...[...m.drops]
        .filter(([, xs]) => new Set(xs).size > 1)
        .map(([id, xs]) => 'drop ' + short(id) + '@t' + ti + ':' + xs.join(',')),
      ...[...m.rises]
        .filter(([, xs]) => new Set(xs).size > 1)
        .map(([id, xs]) => 'rise ' + short(id) + '@t' + ti + ':' + xs.join(',')),
    ]),
  };
  // AC12: full titles — no canvas-era ellipsis cutoff, and the painted text fits
  // the rect sized for it (data-w - 4 = the BAR allowance on both sides of
  // the middle anchor, same margin graph.js reserves via cardSize padding)
  const titleFit = { cards: 0, ellipsis: [], wide: [] };
  for (const c of cardEls) {
    const t = c.querySelector('text');
    if (!t) continue;
    titleFit.cards++;
    const id = String(c.dataset.path).split('/').pop();
    if (String(t.textContent).includes('…')) titleFit.ellipsis.push(id);
    const slack = Number(c.dataset.w) - 4 - t.getBBox().width;
    if (!(slack >= 0)) titleFit.wide.push(id + '+' + R(-slack));
  }
  return {
    elem: { w: g.clientWidth, h: g.clientHeight },
    view: { w: svg.clientWidth, h: svg.clientHeight },
    nodes: pts.length,
    links: edgeEls.length,
    corpusEdges,
    edgeIssues,
    bbox: pts.length
      ? {
          x0: Math.min(...pts.map((p) => p.x)),
          x1: Math.max(...pts.map((p) => p.x)),
          y0: Math.min(...pts.map((p) => p.y)),
          y1: Math.max(...pts.map((p) => p.y)),
        }
      : null,
    distinct: new Set(pts.map((p) => R(p.x) + ',' + R(p.y))).size,
    outside: pts
      .filter((p) => !(p.x >= sb.x && p.x <= sb.x + sb.width && p.y >= sb.y && p.y <= sb.y + sb.height))
      .map((p) => p.id),
    cycleLinks: svg.querySelectorAll('path.edge.broken').length,
    cyclePair: {
      between: cyclePairCount(pairEdges),
      cycleKind: cyclePairCount(pairEdges.filter((p) => p.classList.contains('cycle'))),
    },
    zoom: svg.__zoom ? svg.__zoom.k : null,
    overlaps,
    attach,
    attachIssues,
    bus: { horizontals: segs.length, corridors: groups.size, buses },
    bundles,
    titleFit,
  };
})()`;

// AC5 interaction: synthetic wheel ±100 at the svg centre. Node drag is gone
// by design — the elk layout is authoritative, so wheel/pinch/dblclick zoom
// plus background pan (d3.zoom on the svg, transform on svg.__zoom) is the
// interaction surface.
export const AC_INTERACT_EVAL = `(() => {
  const g = document.querySelector('tsk-graph');
  if (!g) return { fatal: 'tsk-graph missing' };
  const svg = g.querySelector('svg');
  if (!svg) return { fatal: 'svg missing' };
  const r = svg.getBoundingClientRect();
  const wheel = (dy) =>
    svg.dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        clientX: r.left + r.width / 2,
        clientY: r.top + r.height / 2,
        deltaX: 0,
        deltaY: dy,
        view: window,
      }),
    );
  const k = () => (svg.__zoom ? svg.__zoom.k : null);
  const z0 = k();
  wheel(-100);
  const z1 = k();
  wheel(100);
  const z2 = k();
  return { z0, z1, z2 };
})()`;

const finite = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pct = (a, b) => (a === null || b === null || b === 0 ? null : Math.abs(a - b) / Math.abs(b));

// pure: state/interact/favicon payloads → AC1-AC13 verdicts (AC4 stays vision's)
export const acResults = (state, interact, faviconStatus, consoleErrorCount, hexOffenders = []) => {
  const fatal = state?.fatal ?? interact?.fatal ?? null;
  const res = [
    {
      id: "ac1",
      name: "canvas-fit",
      pass:
        !!state?.view &&
        finite(state.view.w / state.elem.w) >= 0.95 &&
        finite(state.view.h / state.elem.h) >= 0.95,
      detail: state?.view
        ? {
            view: state.view,
            elem: state.elem,
            ratioW: finite(state.view.w / state.elem.w),
            ratioH: finite(state.view.h / state.elem.h),
          }
        : { fatal },
    },
    {
      id: "ac2",
      name: "screen-spread",
      pass:
        !fatal &&
        !!state?.bbox &&
        !!state?.view &&
        finite((state.bbox.y1 - state.bbox.y0) / state.view.h) >= 0.7 &&
        finite((state.bbox.x1 - state.bbox.x0) / state.view.w) >= 0.5 &&
        state.outside.length === 0,
      detail:
        fatal || !state?.bbox || !state?.view
          ? { fatal }
          : {
              coverH: finite((state.bbox.y1 - state.bbox.y0) / state.view.h),
              coverW: finite((state.bbox.x1 - state.bbox.x0) / state.view.w),
              outside: state.outside,
              bbox: Object.fromEntries(Object.entries(state.bbox).map(([k, v]) => [k, finite(v)])),
            },
    },
    {
      id: "ac3",
      name: "all-drawn",
      pass:
        !fatal &&
        !!state &&
        state.nodes > 0 &&
        state.distinct === state.nodes &&
        state.outside.length === 0,
      detail: state
        ? { nodes: state.nodes, distinct: state.distinct, outside: state.outside }
        : { fatal },
    },
    {
      id: "ac4",
      name: "labels",
      pass: null,
      detail: { note: "out of probe — parent runs zai-vision on --canvas dump" },
    },
    {
      id: "ac5",
      name: "wheel-zoom",
      pass:
        !fatal &&
        !!interact &&
        pct(finite(interact.z1), finite(interact.z0)) > 0.1 &&
        pct(finite(interact.z2), finite(interact.z0)) <= 0.1,
      detail: interact
        ? {
            z0: finite(interact.z0),
            z1: finite(interact.z1),
            z2: finite(interact.z2),
            zoomInPct: pct(finite(interact.z1), finite(interact.z0)),
            restorePct: pct(finite(interact.z2), finite(interact.z0)),
            note: "node drag dropped — elk owns the layout; d3.zoom gives wheel/pinch/dblclick + pan",
          }
        : { fatal },
    },
    {
      id: "ac6",
      name: "console-clean+favicon",
      pass:
        consoleErrorCount === 0 &&
        typeof faviconStatus === "number" &&
        faviconStatus > 0 &&
        faviconStatus < 400,
      detail: { consoleErrors: consoleErrorCount, faviconStatus },
    },
    {
      id: "ac7",
      name: "cycles-visible",
      // merge contract: exactly ONE cycle edge between the pair, ZERO other
      // edges between them (pre-merge DOM: 2 dotted + 1 solid + 1 dashed = 4);
      // an edgeless corpus has no cycles to show — vacuous pass
      pass:
        !fatal &&
        !!state &&
        (state.corpusEdges === 0 ||
          (state.cyclePair?.between === 1 && state.cyclePair?.cycleKind === 1)),
      detail: state ? { cyclePair: state.cyclePair ?? null } : { fatal },
    },
    {
      id: "ac8",
      name: "tokens-only",
      pass: hexOffenders.length === 0,
      detail: { offenders: hexOffenders },
    },
    {
      id: "ac9",
      name: "no-card-overlap",
      pass: !fatal && Array.isArray(state?.overlaps) && state.overlaps.length === 0,
      detail: state ? { overlaps: state.overlaps ?? null } : { fatal },
    },
    {
      id: "ac10",
      name: "orthogonal-edges",
      pass:
        !fatal &&
        !!state &&
        typeof state.links === "number" &&
        // edgeless corpus: zero links IS the contract; edges present but
        // unpainted stays the fail it always was
        (state.links > 0 || state.corpusEdges === 0) &&
        Array.isArray(state.edgeIssues) &&
        state.edgeIssues.length === 0,
      detail: state
        ? { links: state?.links ?? null, edgeIssues: state?.edgeIssues ?? null }
        : { fatal },
    },
    {
      id: "ac11",
      name: "edge-attach",
      pass:
        !fatal &&
        !!state &&
        typeof state.links === "number" &&
        (state.links > 0 || state.corpusEdges === 0) && // same edgeless rule as ac10
        Array.isArray(state.attachIssues) &&
        state.attachIssues.length === 0,
      detail: state
        ? {
            links: state?.links ?? null,
            attach: state?.attach ?? null,
            attachIssues: state?.attachIssues ?? null,
          }
        : { fatal },
    },
    {
      id: "ac12",
      name: "title-fit",
      // full title rendered AND it fits the rect measured for it; a missing
      // payload is a fail (same contract as ac9-ac11)
      pass:
        !fatal &&
        !!state?.titleFit &&
        state.titleFit.cards > 0 &&
        Array.isArray(state.titleFit.ellipsis) &&
        state.titleFit.ellipsis.length === 0 &&
        Array.isArray(state.titleFit.wide) &&
        state.titleFit.wide.length === 0,
      detail: state?.titleFit ? state.titleFit : { fatal },
    },
    {
      id: "ac13",
      name: "no-buses",
      // every y-band (±20) with x-overlap holds exactly ONE horizontal: the
      // shared trunk. Missing payload is a fail, same contract as ac9-ac12;
      // an edgeless corpus paints no horizontals — vacuous pass
      pass:
        !fatal &&
        !!state?.bus &&
        Array.isArray(state.bus.buses) &&
        state.bus.buses.length === 0 &&
        state.bus.horizontals === state.bus.corridors,
      detail: state?.bus ?? { fatal },
    },
    {
      id: "ac14",
      name: "bundle-homogeneity+legend",
      // per-kind trunks: member stubs of one trunk share ONE kind; card-centre
      // snapping gives one drop/rise x per (card, trunk); legend present with
      // three samples. Missing payload is a fail, same contract as ac9-ac13
      pass:
        !fatal &&
        !!state?.bundles &&
        state.bundles.legend?.present === true &&
        state.bundles.legend?.samples === 3 &&
        Array.isArray(state.bundles.mixed) &&
        state.bundles.mixed.length === 0 &&
        Array.isArray(state.bundles.multiDrop) &&
        state.bundles.multiDrop.length === 0,
      detail: state?.bundles ?? { fatal },
    },
  ];
  return res.map((r) => ({ ...r, detail: JSON.parse(JSON.stringify(r.detail)) })); // NaN → null for a clean report
};

// AC8, repo side: every colour in the web layer flows from the vendored Open
// Props css — web/*.js and index.html must carry no raw hex literals.
export const webHexOffenders = (webDir) =>
  [...readdirSync(webDir).filter((f) => f.endsWith(".js")), "index.html"].flatMap((f) => {
    const m = readFileSync(resolve(webDir, f), "utf8").match(/#[0-9a-fA-F]{3,8}\b/g);
    return m ? [`${f}: ${m.join(" ")}`] : [];
  });

export const parseArgs = (argv) => {
  const v = {
    url: "",
    settleMs: 2000,
    evalJs: DEFAULT_EVAL,
    canvas: null,
    ac: false,
    viewport: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) return { ok: false, e: `missing value for ${a}` };
      i++;
      return { ok: true, val: argv[i] };
    };
    if (a === "--ac") v.ac = true;
    else if (a === "--settle-ms") {
      const n = next();
      if (!n.ok) return n;
      const ms = Number(n.val);
      if (!Number.isFinite(ms) || ms < 0) return { ok: false, e: `bad --settle-ms: ${n.val}` };
      v.settleMs = ms;
    } else if (a === "--eval") {
      const n = next();
      if (!n.ok) return n;
      v.evalJs = n.val;
    } else if (a === "--canvas") {
      const n = next();
      if (!n.ok) return n;
      v.canvas = n.val;
    } else if (a === "--viewport") {
      const n = next();
      if (!n.ok) return n;
      const m = /^(\d+)x(\d+)$/.exec(n.val);
      if (!m || Number(n.val.split("x")[0]) < 200 || Number(n.val.split("x")[1]) < 200)
        return { ok: false, e: `bad --viewport (need WxH, min 200x200): ${n.val}` };
      v.viewport = n.val;
    } else if (!v.url) v.url = a;
    else return { ok: false, e: `unexpected argument: ${a}` };
  }
  return v.url
    ? { ok: true, v }
    : {
        ok: false,
        e: "usage: bun tools/probe.mjs <url> [--settle-ms N] [--eval '<js>'] [--canvas out.png] [--ac] [--viewport WxH]",
      };
};

const run = async (args) => {
  const base = "http://127.0.0.1:9222";
  let r = await fetch(`${base}/json/new?url=about:blank`, { method: "PUT" });
  if (!r.ok) r = await fetch(`${base}/json/new?url=about:blank`); // older chromes need GET
  const tab = await r.json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error("cdp websocket failed"));
  });

  let id = 0;
  const pend = new Map();
  const consoleMessages = [];
  const exceptions = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) {
      pend.get(m.id)(m.result);
      pend.delete(m.id);
    } else if (m.method === "Runtime.consoleAPICalled") {
      consoleMessages.push({
        level: m.params.type,
        text: m.params.args.map((a) => a.value ?? a.description ?? "").join(" "),
      });
    } else if (m.method === "Runtime.exceptionDetails") {
      exceptions.push({ text: m.params.exception?.description ?? m.params.text });
    }
  };
  const send = (method, params = {}) =>
    new Promise((res) => {
      const i = ++id;
      pend.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });

  await send("Page.enable");
  await send("Runtime.enable");
  // background tabs have dead RAF; timers throttle to 1s but still tick.
  // CDP's Runtime.exceptionDetails never reports uncaught errors from timers/RAF
  // (async renderer code), so funnel them into console.error.
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 40);
      window.addEventListener("error", (e) =>
        console.error("UNCAUGHT: " + (e.message || (e.error && e.error.stack) || "unknown")));
      window.addEventListener("unhandledrejection", (e) =>
        console.error("UNHANDLED_REJECTION: " + ((e.reason && (e.reason.stack || e.reason.message)) || String(e.reason))));
    `,
  });
  await send("Page.bringToFront");
  if (args.viewport) {
    // before nav, so the page lays out once at the emulated metrics (matrix runs)
    const [w, h] = args.viewport.split("x").map(Number);
    await send("Emulation.setDeviceMetricsOverride", {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }
  await send("Page.navigate", { url: args.url });
  const settleMs = args.ac ? Math.max(args.settleMs, 5000) : args.settleMs; // engine cooldown + fit transition

  let readyState = "";
  for (let i = 0; i < 30 && readyState !== "complete"; i++) {
    const rr = await send("Runtime.evaluate", {
      expression: "document.readyState",
      returnByValue: true,
    });
    readyState = rr?.result?.value ?? "";
    if (readyState !== "complete") await new Promise((res) => setTimeout(res, 500));
  }
  await new Promise((res) => setTimeout(res, settleMs));

  const evaluate = async (expression) => {
    const rr = await send("Runtime.evaluate", {
      expression: `(${expression})`,
      returnByValue: true,
    });
    if (rr?.exceptionDetails) {
      exceptions.push({
        text: rr.exceptionDetails.exception?.description ?? rr.exceptionDetails.text,
      });
      return null;
    }
    return rr?.result?.value ?? null;
  };

  let evalResult = null;
  let ac = null;
  if (readyState === "complete" && args.ac) {
    const state = await evaluate(AC_STATE_EVAL); // camera read BEFORE interaction mutates it
    const interact = await evaluate(AC_INTERACT_EVAL);
    let faviconStatus = null;
    try {
      faviconStatus = (await fetch(new URL("/favicon.ico", args.url))).status;
    } catch {
      faviconStatus = 0;
    }
    ac = acResults(
      state,
      interact,
      faviconStatus,
      consoleMessages.filter((c) => c.level === "error").length + exceptions.length,
      webHexOffenders(resolve(import.meta.dir, "..", "web")),
    );
  } else if (readyState === "complete") {
    evalResult = await evaluate(args.evalJs);
  }

  let canvas = null;
  if (args.canvas && readyState === "complete") {
    // svg renderer: capture the emulated viewport as a png (AC4 → vision)
    const shot = await send("Page.captureScreenshot", { format: "png" });
    if (typeof shot?.data === "string" && shot.data.length > 0) {
      writeFileSync(args.canvas, Buffer.from(shot.data, "base64"));
      canvas = args.canvas;
    } else canvas = "no-screenshot";
  }

  ws.close();
  fetch(`${base}/json/close/${tab.id}`).catch(() => {}); // best effort, report already has everything

  const report = {
    url: args.url,
    viewport: args.viewport,
    readyState,
    settleMs,
    console: consoleMessages,
    exceptions,
    eval: evalResult,
    ac,
    canvas,
    ok:
      readyState === "complete" &&
      exceptions.length === 0 &&
      consoleMessages.every((c) => c.level !== "error") &&
      (ac === null || ac.every((r) => r.pass !== false)), // pass:null = deferred (AC4)
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
};

if (import.meta.main) {
  const parsed = parseArgs(Bun.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.e);
    process.exit(2);
  }
  await run(parsed.v);
}
