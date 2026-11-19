#!/usr/bin/env bun
// Probe for the server-rendered viewer. Geometry ACs (ac7, ac9-14, ac12) are
// CURL-LEVEL: fetch the route, parse the SVG attributes out of the served
// HTML, verdict — no CDP. CDP (127.0.0.1:9222, one NEW tab per run,
// RAF-shimmed, console/exception-capturing) stays ONLY for screen truth
// (ac1/ac2/ac3), the wheel interaction (ac5) and --canvas screenshots; ac4
// labels go to vision on the dumps. Exit 1 on ANY failed AC or console error.
//
// Usage: bun tools/probe.mjs <url> [--settle-ms N] [--eval '<js>'] [--canvas out.png] [--ac]
//        [--viewport WxH]  — CDP Emulation.setDeviceMetricsOverride before nav
// JSON report → stdout.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { cardSize, intersect, pointOnRect, serverCtx } from "../src/cards.ts";

export const DEFAULT_EVAL = `(() => ({ title: document.title }))()`;

// screen truth stays in the browser (ac1 fit, ac2 spread, ac3 drawn): the CSS
// box and getBoundingClientRect — viewBox fit + zoom transform, whatever the
// css did. Layout truth (geometry) is curl-side, off the data-* attrs.
export const SCREEN_EVAL = `(() => {
  const svg = document.querySelector('svg[data-zoom]');
  if (!svg) return { noGraph: true };
  const box = svg.closest('.tsk-graph');
  const sb = svg.getBoundingClientRect();
  const bb = (box ?? svg).getBoundingClientRect();
  const pts = [...svg.querySelectorAll('g.card')].map((c) => {
    const b = c.getBoundingClientRect();
    return { id: String(c.dataset.path).split('/').pop(), x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  return {
    elem: { w: Math.round(bb.width), h: Math.round(bb.height) },
    view: { w: Math.round(sb.width), h: Math.round(sb.height) },
    nodes: pts.length,
    distinct: new Set(pts.map((p) => Math.round(p.x) + ',' + Math.round(p.y))).size,
    bbox: pts.length ? {
      x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)),
      y0: Math.min(...pts.map((p) => p.y)), y1: Math.max(...pts.map((p) => p.y)),
    } : null,
    outside: pts
      .filter((p) => !(p.x >= sb.x && p.x <= sb.x + sb.width && p.y >= sb.y && p.y <= sb.y + sb.height))
      .map((p) => p.id),
  };
})()`;

// AC5 interaction: synthetic wheel ±100 at the svg centre (d3.zoom stores the
// live transform on svg.__zoom). Node drag is gone by design — the elk layout
// is authoritative; wheel/pinch/dblclick zoom + background pan is the surface.
export const INTERACT_EVAL = `(() => {
  const svg = document.querySelector('svg[data-zoom]');
  if (!svg) return { noGraph: true };
  const r = svg.getBoundingClientRect();
  const wheel = (dy) =>
    svg.dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true, cancelable: true,
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
        deltaX: 0, deltaY: dy, view: window,
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

const decode = (s) =>
  s
    .replaceAll("&apos;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
const short = (p) => String(p).split("/").pop();

/** parse the SERVED html: geometry state off the svg attributes we emitted */
export const parseGraphHtml = (html) => {
  const svg = /<svg data-zoom data-edges="(\d+)" viewBox="([^"]+)"/.exec(html);
  if (!svg) return { graph: false };
  const corpusEdges = Number(svg[1] ?? 0);
  const cards = [
    ...html.matchAll(
      /<g class="card ([^"]*)" data-path="([^"]*)" data-x="(-?[\d.]+)" data-y="(-?[\d.]+)" data-w="([\d.]+)" data-h="([\d.]+)"[^>]*>([\s\S]*?)<\/g>/g,
    ),
  ].map((m) => ({
    cls: m[1] ?? "",
    path: decode(m[2] ?? ""),
    x: Number(m[3]),
    y: Number(m[4]),
    w: Number(m[5]),
    h: Number(m[6]),
    title: decode(/<text[^>]*>([^<]*)<\/text>/.exec(m[7] ?? "")?.[1] ?? ""),
  }));
  const byPath = new Map(cards.map((c) => [c.path, c]));
  const paths = [...html.matchAll(/<path class="edge([^"]*)"([^>]*)d="([^"]+)"/g)].map((m) => {
    const cls = (m[1] ?? "").trim().split(/\s+/);
    return {
      trunk: cls.includes("trunk"),
      kind: ["hard", "soft", "cycle"].find((k) => cls.includes(k)) ?? "?",
      from: decode(/data-from="([^"]*)"/.exec(m[2] ?? "")?.[1] ?? "") || null,
      to: decode(/data-to="([^"]*)"/.exec(m[2] ?? "")?.[1] ?? "") || null,
      poly: [...(m[3] ?? "").matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((p) => ({
        x: Number(p[1]),
        y: Number(p[2]),
      })),
    };
  });
  const pieces = paths.filter((p) => !p.trunk);
  const trunks = paths.filter((p) => p.trunk);

  // ac9: card rects as painted (data attrs = mapLayout output)
  const overlaps = [];
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++)
      if (intersect(cards[i], cards[j]))
        overlaps.push(short(cards[i].path) + "×" + short(cards[j].path));

  // ac10/ac11: painted pieces parse back to polylines; endpoints sit on the
  // card rect (eps 1) or ON a trunk line (y at the trunk, x in its span)
  const trunkSegs = trunks
    .map((t) => t.poly)
    .filter((poly) => poly.length === 2)
    .map((poly) => ({
      y: poly[0].y,
      x0: Math.min(poly[0].x, poly[1].x),
      x1: Math.max(poly[0].x, poly[1].x),
    }));
  const onTrunk = (pt) =>
    trunkSegs.some((t) => Math.abs(pt.y - t.y) <= 1 && pt.x >= t.x0 - 1 && pt.x <= t.x1 + 1);
  const edgeIssues = [];
  const attachIssues = [];
  for (const p of pieces) {
    const name = short(p.from) + "→" + short(p.to);
    const poly = p.poly;
    if (poly.length < 2) {
      edgeIssues.push(name + ":no-polyline");
      continue;
    }
    for (let i = 0; i + 1 < poly.length; i++)
      if (Math.abs(poly[i].x - poly[i + 1].x) > 1e-9 && Math.abs(poly[i].y - poly[i + 1].y) > 1e-9)
        edgeIssues.push(name + ":diagonal");
    const sr = p.from ? byPath.get(p.from) : undefined;
    const dr = p.to ? byPath.get(p.to) : undefined;
    const first = poly[0];
    const last = poly.at(-1);
    if (!first || (!sr && p.from) || !(pointOnRect(first, sr ?? first, 1) || onTrunk(first)))
      attachIssues.push(name + ":src");
    if (!last || (!dr && p.to) || !(pointOnRect(last, dr ?? last, 1) || onTrunk(last)))
      attachIssues.push(name + ":dst");
  }

  // ac7: the merge contract generalized — every painted unordered pair carries
  // exactly ONE direction (mutual hard would paint two; a merged deadlock
  // paints one cycle-kind edge). The fixture cyclic pair stays in the payload
  // as the original canary.
  const pairKey = (p) => [p.from, p.to].filter(Boolean).sort().join("⇄");
  const dirKey = (p) => `${p.from}→${p.to}`;
  const dirsPerPair = new Map();
  for (const p of pieces) {
    if (!p.from || !p.to) continue;
    dirsPerPair.set(pairKey(p), new Set([...(dirsPerPair.get(pairKey(p)) ?? []), dirKey(p)]));
  }
  const multiPair = [...dirsPerPair].filter(([, dirs]) => dirs.size > 1).map(([pair]) => pair);
  const pairEdges = pieces.filter(
    (p) =>
      p.from &&
      p.to &&
      ((p.from.endsWith("cyclic-a.md") && p.to.endsWith("cyclic-b.md")) ||
        (p.from.endsWith("cyclic-b.md") && p.to.endsWith("cyclic-a.md"))),
  );
  const count = (els) => new Set(els.map(pairKey)).size;
  const cyclePair = {
    between: count(pairEdges),
    cycleKind: count(pairEdges.filter((p) => p.kind === "cycle")),
  };

  // ac13: every horizontal on the painted page (pieces, identity edges,
  // trunks) grouped by y-band ±20 with transitive x-overlap WITHIN ONE KIND —
  // per-kind bundling stacks hard/soft trunks side by side in one visual
  // corridor, so the invariant is one horizontal PER KIND per band
  const segs = [];
  for (const p of paths)
    for (let i = 0; i + 1 < p.poly.length; i++)
      if (
        Math.abs(p.poly[i].y - p.poly[i + 1].y) < 1e-9 &&
        Math.abs(p.poly[i].x - p.poly[i + 1].x) > 1e-9
      )
        segs.push({
          y: p.poly[i].y,
          x0: Math.min(p.poly[i].x, p.poly[i + 1].x),
          x1: Math.max(p.poly[i].x, p.poly[i + 1].x),
          kind: p.kind,
        });
  const par = segs.map((_, i) => i);
  const find = (x) => {
    let i = x;
    while (par[i] !== i) {
      par[i] = par[par[i]];
      i = par[i];
    }
    return i;
  };
  for (let a = 0; a < segs.length; a++)
    for (let b = a + 1; b < segs.length; b++)
      if (
        segs[a].kind === segs[b].kind &&
        Math.abs(segs[a].y - segs[b].y) <= 20 &&
        segs[a].x0 < segs[b].x1 &&
        segs[b].x0 < segs[a].x1
      )
        par[find(a)] = find(b);
  const groups = new Map();
  segs.forEach((s, i) => {
    groups.set(find(i), [...(groups.get(find(i)) ?? []), s]);
  });
  const buses = [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => g.map((s) => Math.round(s.y) + ":" + Math.round(s.x0) + "→" + Math.round(s.x1)));

  // ac14: per-kind bundles + shared drops; legend with three samples
  const legendSamples = (html.match(/tsk-legend-sample/g) ?? []).length;
  const members = trunkSegs.map(() => ({ kinds: new Set(), drops: new Map(), rises: new Map() }));
  for (const p of pieces) {
    for (let ti = 0; ti < trunkSegs.length; ti++) {
      const t = trunkSegs[ti];
      const free = p.poly.filter(
        (pt) => !(Math.abs(pt.y - t.y) <= 1 && pt.x >= t.x0 - 1 && pt.x <= t.x1 + 1),
      );
      if (free.length === p.poly.length || free.length === 0) continue; // not a member / connector
      const m = members[ti];
      m.kinds.add(p.kind);
      const fr = p.from ? byPath.get(p.from) : undefined;
      const to = p.to ? byPath.get(p.to) : undefined;
      const ek = short(p.from) + "→" + short(p.to); // per-edge rise key
      const put = (map, id, pt) => map.set(id, [...(map.get(id) ?? []), Math.round(pt.x)]);
      for (const pt of free) {
        if (fr && pointOnRect(pt, fr, 1)) put(m.drops, p.from, pt);
        if (to && pointOnRect(pt, to, 1)) put(m.rises, ek, pt);
      }
    }
  }
  const bundles = {
    legend: { present: /class="tsk-legend"/.test(html), samples: legendSamples },
    trunkCount: trunkSegs.length,
    mixed: members.map((m, i) => (m.kinds.size > 1 ? i : -1)).filter((i) => i >= 0),
    multiDrop: members.flatMap((m, ti) => [
      ...[...m.drops]
        .filter(([, xs]) => new Set(xs).size > 1)
        .map(([id, xs]) => "drop " + short(id) + "@t" + ti + ":" + xs.join(",")),
      ...[...m.rises]
        .filter(([, xs]) => new Set(xs).size > 1)
        .map(([id, xs]) => "rise " + id + "@t" + ti + ":" + xs.join(",")),
    ]),
  };

  // ac12: full titles, no ellipsis, rect sized by the SAME server cardSize fn
  const titleFit = { cards: 0, ellipsis: [], wide: [] };
  for (const c of cards) {
    titleFit.cards++;
    if (c.title.includes("…")) titleFit.ellipsis.push(short(c.path));
    if (c.w !== cardSize(c.title, serverCtx).w)
      titleFit.wide.push(short(c.path) + "+" + Math.round(c.w - cardSize(c.title, serverCtx).w));
  }

  return {
    graph: true,
    corpusEdges,
    cards: cards.length,
    links: pieces.length,
    overlaps,
    edgeIssues,
    attachIssues,
    cyclePair,
    multiPair,
    bus: { horizontals: segs.length, corridors: groups.size, buses },
    bundles,
    titleFit,
  };
};

/** per-route content markers (SSR sanity for non-graph routes) */
export const routeChecks = (pathname, html) => {
  const article = html.slice(
    html.indexOf('<article class="md">') + 1,
    html.indexOf("<details>") - 1,
  );
  const checks = pathname.startsWith("/list")
    ? { table: html.includes("<table"), rows: /<tbody>\s*<tr/.test(html) }
    : pathname.startsWith("/next")
      ? { "next items": html.includes("next-item") }
      : pathname.startsWith("/graph")
        ? { "graph svg": html.includes("<svg data-zoom") }
        : pathname.startsWith("/doc/")
          ? {
              "doc article": html.includes('<article class="md">'),
              "no frontmatter leak": !article.includes("status:"),
            }
          : { nav: html.includes("<nav>") };
  return checks;
};

const finite = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pct = (a, b) => (a === null || b === null || b === 0 ? null : Math.abs(a - b) / Math.abs(b));
const NA = (note) => ({ pass: null, detail: { note } });

// pure: html/screen/interact payloads → AC1-AC14 verdicts (ac4 stays vision's)
export const acResults = (
  htmlState,
  screen,
  interact,
  faviconStatus,
  consoleErrorCount,
  hexOffenders = [],
) => {
  const graph = htmlState?.graph === true;
  const noGraph = NA("no graph on this route — n/a");
  // a graph route MUST deliver its payloads; missing = fail, same as ever
  const screenOk = graph ? !!screen && !screen.noGraph : true;
  const res = [
    {
      id: "ac1",
      name: "canvas-fit",
      pass: !graph
        ? noGraph.pass
        : screenOk &&
          !!screen?.view &&
          !!screen?.elem &&
          finite(screen.view.w / screen.elem.w) >= 0.95 &&
          finite(screen.view.h / screen.elem.h) >= 0.95,
      detail: !graph
        ? noGraph.detail
        : screen?.view && screen?.elem
          ? { view: screen.view, elem: screen.elem }
          : { fatal: "screen payload missing" },
    },
    {
      id: "ac2",
      name: "screen-spread",
      pass: !graph
        ? noGraph.pass
        : screenOk &&
          !!screen?.bbox &&
          !!screen?.view &&
          finite((screen.bbox.y1 - screen.bbox.y0) / screen.view.h) >= 0.7 &&
          finite((screen.bbox.x1 - screen.bbox.x0) / screen.view.w) >= 0.5 &&
          screen.outside.length === 0,
      detail:
        !graph || !screen || screen.noGraph
          ? noGraph.detail
          : {
              coverH: finite((screen.bbox?.y1 - screen.bbox?.y0) / screen.view.h),
              coverW: finite((screen.bbox?.x1 - screen.bbox?.x0) / screen.view.w),
              outside: screen.outside,
            },
    },
    {
      id: "ac3",
      name: "all-drawn",
      pass: !graph
        ? noGraph.pass
        : screenOk &&
          !!screen &&
          screen.nodes > 0 &&
          screen.distinct === screen.nodes &&
          screen.outside.length === 0,
      detail:
        !graph || !screen || screen.noGraph
          ? noGraph.detail
          : { nodes: screen.nodes, distinct: screen.distinct, outside: screen.outside },
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
      pass: !graph
        ? noGraph.pass
        : !!interact &&
          !interact.noGraph &&
          pct(finite(interact.z1), finite(interact.z0)) > 0.1 &&
          pct(finite(interact.z2), finite(interact.z0)) <= 0.1,
      detail:
        !graph || !interact || interact.noGraph
          ? noGraph.detail
          : {
              z0: finite(interact.z0),
              z1: finite(interact.z1),
              z2: finite(interact.z2),
              note: "wheel/pinch/dblclick zoom + pan; elk owns the layout",
            },
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
      // merge contract, generalized off the painted page: every unordered pair
      // paints ONE direction (a merged hard-mutual deadlock paints one cycle
      // edge — two directions between a pair is pre-merge noise); edgeless
      // corpora have nothing to merge — vacuous pass
      pass: !graph
        ? noGraph.pass
        : htmlState.corpusEdges === 0 ||
          (typeof htmlState.links === "number" &&
            htmlState.links > 0 &&
            Array.isArray(htmlState.multiPair) &&
            htmlState.multiPair.length === 0),
      detail: !graph
        ? noGraph.detail
        : { multiPair: htmlState.multiPair ?? null, cyclePair: htmlState.cyclePair ?? null },
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
      pass: !graph
        ? noGraph.pass
        : Array.isArray(htmlState.overlaps) && htmlState.overlaps.length === 0,
      detail: !graph ? noGraph.detail : { overlaps: htmlState.overlaps ?? null },
    },
    {
      id: "ac10",
      name: "orthogonal-edges",
      pass: !graph
        ? noGraph.pass
        : typeof htmlState.links === "number" &&
          (htmlState.links > 0 || htmlState.corpusEdges === 0) &&
          Array.isArray(htmlState.edgeIssues) &&
          htmlState.edgeIssues.length === 0,
      detail: !graph
        ? noGraph.detail
        : { links: htmlState.links ?? null, edgeIssues: htmlState.edgeIssues ?? null },
    },
    {
      id: "ac11",
      name: "edge-attach",
      pass: !graph
        ? noGraph.pass
        : typeof htmlState.links === "number" &&
          (htmlState.links > 0 || htmlState.corpusEdges === 0) && // same edgeless rule as ac10
          Array.isArray(htmlState.attachIssues) &&
          htmlState.attachIssues.length === 0,
      detail: !graph ? noGraph.detail : { attachIssues: htmlState.attachIssues ?? null },
    },
    {
      id: "ac12",
      name: "title-fit",
      // full title rendered (no ellipsis) AND the rect width equals the same
      // cardSize fn's answer for that title (24px padding by construction)
      pass: !graph
        ? noGraph.pass
        : !!htmlState.titleFit &&
          htmlState.titleFit.cards > 0 &&
          htmlState.titleFit.ellipsis.length === 0 &&
          htmlState.titleFit.wide.length === 0,
      detail: !graph ? noGraph.detail : htmlState.titleFit,
    },
    {
      id: "ac13",
      name: "no-buses",
      // every y-band (±20) with x-overlap holds exactly ONE horizontal: the
      // shared trunk. An edgeless corpus paints no horizontals — vacuous pass
      pass: !graph
        ? noGraph.pass
        : !!htmlState.bus &&
          Array.isArray(htmlState.bus.buses) &&
          htmlState.bus.buses.length === 0 &&
          htmlState.bus.horizontals === htmlState.bus.corridors,
      detail: !graph ? noGraph.detail : htmlState.bus,
    },
    {
      id: "ac14",
      name: "bundle-homogeneity+legend",
      // per-kind trunks: member stubs of one trunk share ONE kind; one drop x
      // per (source card, trunk) and one rise x per EDGE (wide targets host
      // several rises at different x); legend present with three samples
      pass: !graph
        ? noGraph.pass
        : !!htmlState.bundles &&
          htmlState.bundles.legend?.present === true &&
          htmlState.bundles.legend?.samples === 3 &&
          Array.isArray(htmlState.bundles.mixed) &&
          htmlState.bundles.mixed.length === 0 &&
          Array.isArray(htmlState.bundles.multiDrop) &&
          htmlState.bundles.multiDrop.length === 0,
      detail: !graph ? noGraph.detail : htmlState.bundles,
    },
  ];
  return res.map((r) => ({ ...r, detail: JSON.parse(JSON.stringify(r.detail)) })); // NaN → null for a clean report
};

// AC8, repo side: every colour in the client layer flows from the vendored
// Open Props css — web assets must carry no raw hex literals.
export const webHexOffenders = (webDir) =>
  readdirSync(webDir)
    .filter((f) => f.endsWith(".js") || f.endsWith(".css"))
    .flatMap((f) => {
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
  // 1. curl level: the page itself + favicon — geometry verdicts read this
  const page = await fetch(args.url);
  const html = await page.text();
  let faviconStatus = null;
  try {
    faviconStatus = (await fetch(new URL("/favicon.ico", args.url))).status;
  } catch {
    faviconStatus = 0;
  }
  const htmlState = parseGraphHtml(html);
  const checks = routeChecks(new URL(args.url).pathname, html);

  // 2. CDP: screen truth + interaction + screenshots only
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
  const settleMs = args.ac ? Math.max(args.settleMs, 5000) : args.settleMs; // d3 zoom wiring + fonts

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
  let screen = null;
  let interact = null;
  if (readyState === "complete" && args.ac) {
    screen = await evaluate(SCREEN_EVAL); // camera read BEFORE interaction mutates it
    interact = await evaluate(INTERACT_EVAL);
    ac = acResults(
      htmlState,
      screen,
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
    status: page.status,
    routeChecks: checks,
    htmlGraph: htmlState.graph
      ? { cards: htmlState.cards, links: htmlState.links, corpusEdges: htmlState.corpusEdges }
      : false,
    readyState,
    settleMs,
    console: consoleMessages,
    exceptions,
    eval: evalResult,
    ac,
    canvas,
    ok:
      page.status === 200 &&
      Object.values(checks).every(Boolean) &&
      readyState === "complete" &&
      exceptions.length === 0 &&
      consoleMessages.every((c) => c.level !== "error") &&
      (ac === null || ac.every((a) => a.pass !== false)), // pass:null = deferred (ac4) or n/a (non-graph route)
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
