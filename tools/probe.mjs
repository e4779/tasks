#!/usr/bin/env bun
// CDP probe for the web layer: one NEW chrome tab per run (127.0.0.1:9222),
// RAF-shimmed (background tabs have dead RAF), console/exception-capturing.
// Usage: bun tools/probe.mjs <url> [--settle-ms N] [--eval '<js>'] [--canvas out.png] [--ac]
// JSON report → stdout; exit 1 on ANY console error or uncaught exception.
// --ac: operator acceptance gate AC1-AC7 (AC4 labels → vision, out of probe).

import { writeFileSync } from "node:fs";

export const DEFAULT_EVAL = `(() => {
  const g = document.querySelector('tsk-graph');
  if (!g || !g.fg) return { fg: false };
  const d = g.fg.graphData();
  const ys = d.nodes.map((n) => n.y ?? 0);
  const xs = d.nodes.map((n) => n.x ?? 0);
  return {
    fg: true,
    w: g.fg.width(),
    h: g.fg.height(),
    nodes: d.nodes.length,
    links: d.links.length,
    linksResolved: d.links.every((l) => typeof l.source === 'object' && typeof l.target === 'object'),
    ySpread: ys.length ? Math.round(Math.max(...ys) - Math.min(...ys)) : 0,
    xSpread: xs.length ? Math.round(Math.max(...xs) - Math.min(...xs)) : 0,
  };
})()`;

// AC1-AC3, AC7 state gathering. Camera math is force-graph's own:
// graph2ScreenCoords = engine x/y through the live d3-zoom transform.
export const AC_STATE_EVAL = `(() => {
  const g = document.querySelector('tsk-graph');
  if (!g || !g.fg) return { fatal: 'tsk-graph or fg missing' };
  const canvas = g.querySelector('canvas');
  if (!canvas) return { fatal: 'canvas missing' };
  const R = (v) => Math.round(v * 10) / 10;
  const pts = g.fg.graphData().nodes.map((n) => {
    const p = g.fg.graph2ScreenCoords(n.x ?? 0, n.y ?? 0);
    return { id: String(n.id).split('/').pop(), x: p.x, y: p.y };
  });
  return {
    elem: { w: g.clientWidth, h: g.clientHeight },
    canvas: { w: canvas.clientWidth, h: canvas.clientHeight },
    nodes: pts.length,
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
      .filter(
        (p) =>
          !(p.x >= 0 && p.x <= canvas.clientWidth && p.y >= 0 && p.y <= canvas.clientHeight),
      )
      .map((p) => p.id),
    cycleLinks: (g.cycleLinks ?? []).length,
  };
})()`;

// AC5 interaction: synthetic wheel ±100 at canvas center, then a drag gesture.
// d3-zoom binds onto the canvas itself (__zoom prop); mousedown gestures need
// view: window — d3 attaches follow-up mousemove listeners to event.view.
export const AC_INTERACT_EVAL = `(() => {
  const g = document.querySelector('tsk-graph');
  if (!g || !g.fg) return { fatal: 'tsk-graph or fg missing' };
  const c = g.querySelector('canvas');
  const r = c.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const wheel = (dy) =>
    c.dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        clientX: cx,
        clientY: cy,
        deltaX: 0,
        deltaY: dy,
        view: window,
      }),
    );
  const mouse = (type, x, y) =>
    c.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        view: window,
        button: 0,
      }),
    );
  const z0 = g.fg.zoom();
  const c0 = g.fg.centerAt();
  wheel(-100);
  const z1 = g.fg.zoom();
  wheel(100);
  const z2 = g.fg.zoom();
  mouse('mousedown', cx, cy);
  mouse('mousemove', cx + 60, cy + 40);
  mouse('mouseup', cx + 60, cy + 40);
  const c1 = g.fg.centerAt();
  return { z0, z1, z2, c0, c1 };
})()`;

const finite = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pct = (a, b) => (a === null || b === null || b === 0 ? null : Math.abs(a - b) / Math.abs(b));
const shift = (a, b) =>
  a === null || b === null || [a.x, a.y, b.x, b.y].some((v) => typeof v !== "number")
    ? null
    : Math.hypot(a.x - b.x, a.y - b.y);

// pure: state/interact/favicon payloads → AC1-AC7 verdicts (AC4 stays vision's)
export const acResults = (state, interact, faviconStatus, consoleErrorCount) => {
  const fatal = state?.fatal ?? interact?.fatal ?? null;
  const res = [
    {
      id: "ac1",
      name: "canvas-fit",
      pass:
        !!state?.canvas &&
        finite(state.canvas.w / state.elem.w) >= 0.95 &&
        finite(state.canvas.h / state.elem.h) >= 0.95,
      detail: state?.canvas
        ? {
            canvas: state.canvas,
            elem: state.elem,
            ratioW: finite(state.canvas.w / state.elem.w),
            ratioH: finite(state.canvas.h / state.elem.h),
          }
        : { fatal },
    },
    {
      id: "ac2",
      name: "screen-spread",
      pass:
        !fatal &&
        !!state?.bbox &&
        !!state?.canvas &&
        finite((state.bbox.y1 - state.bbox.y0) / state.canvas.h) >= 0.7 &&
        finite((state.bbox.x1 - state.bbox.x0) / state.canvas.w) >= 0.5 &&
        state.outside.length === 0,
      detail:
        fatal || !state?.bbox || !state?.canvas
          ? { fatal }
          : {
              coverH: finite((state.bbox.y1 - state.bbox.y0) / state.canvas.h),
              coverW: finite((state.bbox.x1 - state.bbox.x0) / state.canvas.w),
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
        state.nodes === 8 &&
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
      name: "wheel+pan",
      pass:
        !fatal &&
        !!interact &&
        pct(finite(interact.z1), finite(interact.z0)) > 0.1 &&
        pct(finite(interact.z2), finite(interact.z0)) <= 0.1 &&
        shift(interact.c1, interact.c0) > 1,
      detail: interact
        ? {
            z0: finite(interact.z0),
            z1: finite(interact.z1),
            z2: finite(interact.z2),
            zoomInPct: pct(finite(interact.z1), finite(interact.z0)),
            restorePct: pct(finite(interact.z2), finite(interact.z0)),
            dragShift: shift(interact.c1, interact.c0),
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
      pass: !fatal && !!state && state.cycleLinks >= 1,
      detail: state ? { cycleLinks: state.cycleLinks } : { fatal },
    },
  ];
  return res.map((r) => ({ ...r, detail: JSON.parse(JSON.stringify(r.detail)) })); // NaN → null for a clean report
};

export const parseArgs = (argv) => {
  const v = { url: "", settleMs: 2000, evalJs: DEFAULT_EVAL, canvas: null, ac: false };
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
    } else if (!v.url) v.url = a;
    else return { ok: false, e: `unexpected argument: ${a}` };
  }
  return v.url
    ? { ok: true, v }
    : {
        ok: false,
        e: "usage: bun tools/probe.mjs <url> [--settle-ms N] [--eval '<js>'] [--canvas out.png] [--ac]",
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
  // (where force-graph's dag throw lives), so funnel them into console.error.
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
    );
  } else if (readyState === "complete") {
    evalResult = await evaluate(args.evalJs);
  }

  let canvas = null;
  if (args.canvas && readyState === "complete") {
    const c = await send("Runtime.evaluate", {
      expression:
        "(() => { const c = document.querySelector('tsk-graph canvas'); return c ? c.toDataURL('image/png') : ''; })()",
      returnByValue: true,
    });
    const s = typeof c?.result?.value === "string" ? c.result.value : "";
    if (s.startsWith("data:")) {
      writeFileSync(args.canvas, Buffer.from(s.split(",")[1], "base64"));
      canvas = args.canvas;
    } else canvas = "no-canvas";
  }

  ws.close();
  fetch(`${base}/json/close/${tab.id}`).catch(() => {}); // best effort, report already has everything

  const report = {
    url: args.url,
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
