import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { basename, dirname, extname, relative, resolve, sep } from "node:path";
import matter from "gray-matter";
import { DEFAULT_TERMINALS, loadConfig, terminalsOf } from "./config.ts";
import { discover } from "./discover.ts";
import type { Graph } from "./graph.ts";
import { buildGraph } from "./graph.ts";
import { renderGraph } from "./graph-view.ts";
import { renderMd } from "./markdown.ts";
import { hardBlocked, nextUp } from "./next.ts";
import { parseFile } from "./parse.ts";
import {
  docPage,
  filtered,
  filterForm,
  listTable,
  mainFragment,
  nextPage,
  notFoundPage,
  page,
} from "./render.ts";

export type SnapshotNode = Readonly<{
  path: string;
  title: string;
  status: string | null;
  blocked: boolean;
  ghost: boolean;
}>;
export type Snapshot = Readonly<{
  nodes: SnapshotNode[];
  edges: Readonly<{ from: string; to: string; kind: "soft" | "hard" }>[];
}>;

export const snapshot = (
  graph: Graph,
  terminals: readonly string[] = DEFAULT_TERMINALS,
): Snapshot => {
  const blocked = hardBlocked(graph, terminals);
  return {
    nodes: graph.nodes.map((n) => ({
      path: n.path,
      title: n.title,
      status: n.status,
      blocked: blocked.has(n.path),
      ghost: graph.ghosts.includes(n.path),
    })),
    edges: graph.edges,
  };
};

const webRoot = resolve(import.meta.dirname, "..", "web");

// vendor base: node_modules resolved by WALKING UP from this module's dir
// (classic node resolution). Repo layout: <root>/node_modules. Global
// installs hoist deps ABOVE the package (bun: ~/.bun/install/global/
// node_modules; npm: /usr/lib/node_modules), so a fixed relative hop
// breaks there — first hit wins, nothing user-controlled in the map.
const vendorRoot = (() => {
  let dir = import.meta.dirname;
  for (;;) {
    const cand = resolve(dir, "node_modules");
    if (existsSync(resolve(cand, "d3", "dist", "d3.min.js"))) return cand;
    const up = dirname(dir);
    if (up === dir) return resolve(import.meta.dirname, "..", "node_modules");
    dir = up;
  }
})();
const VENDOR = {
  "d3.min.js": "d3/dist/d3.min.js",
  "normalize.min.css": "open-props/normalize.min.css",
  "theme.dark.switch.min.css": "open-props/theme.dark.switch.min.css",
  "theme.light.switch.min.css": "open-props/theme.light.switch.min.css",
  "sizes.min.css": "open-props/sizes.min.css",
  "colors.min.css": "open-props/colors.min.css",
  "shadows.min.css": "open-props/shadows.min.css",
  "easings.min.css": "open-props/easings.min.css",
} as const;

// trust boundary: serve only files physically under web/ (no traversal, no project files)
const safeWebFile = (rel: string) => {
  const abs = resolve(webRoot, rel);
  return abs.startsWith(`${webRoot}${sep}`) ? abs : null;
};

// node Response does no extension sniffing (bun's file API did): map the two kinds we ship
const MIME: Record<string, string> = {
  ".css": "text/css",
  ".js": "text/javascript",
};
const fileResponse = async (path: string): Promise<Response | null> => {
  try {
    return new Response(await readFile(path), {
      headers: {
        "cache-control": "no-store",
        "content-type": MIME[extname(path)] ?? "application/octet-stream",
      },
    });
  } catch {
    return null; // missing file — caller answers 404
  }
};

const HTML = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" };
const html = (body: string, status = 200) => new Response(body, { status, headers: HTML });

// corpus model recomputed per request: discover → parse → buildGraph → snapshot
// (computed-views doctrine, literally); no caching
const model = async (roots: readonly string[]) => {
  const rs: string[] = roots.length > 0 ? [...roots] : ["."];
  const conf = loadConfig(rs);
  const files = await discover(rs);
  const tasks = files.flatMap((f) => {
    const r = parseFile(f, rs, conf);
    return r.ok ? [r.v] : [];
  });
  const graph = buildGraph(tasks);
  return { rs, conf, files, graph, snap: snapshot(graph, terminalsOf(conf)) };
};

// doc URLs are corpus-root-relative: first root whose relative() does not
// escape upward owns the file; fallback keeps /doc/basename working visually
const relOf = (rs: readonly string[], abs: string): string => {
  for (const r of rs) {
    const rel = relative(r, abs);
    if (rel !== "" && !rel.startsWith("..")) return rel.split(sep).join("/");
  }
  return basename(abs);
};

// unauthenticated read-only server — bind wider than loopback only on trusted LAN
export type ServeHandle = Readonly<{
  hostname: string;
  port: number;
  stop: (closeActive?: boolean) => void;
}>;

export const startServer = async (
  roots: string[],
  port: number,
  host = "127.0.0.1",
): Promise<ServeHandle> => {
  // runtime-neutral fetch handler: same logic under node and bun
  const handler = async (req: Request): Promise<Response> => {
    if (req.method !== "GET" && req.method !== "HEAD")
      return new Response("method not allowed", { status: 405 });
    const url = new URL(req.url);
    // decode AFTER url parsing: %2F and friends become path structure here,
    // but every /doc candidate still faces the corpus-membership check below
    const p = decodeURIComponent(url.pathname);

    if (p === "/favicon.ico")
      // 204: a real response with zero bytes on the wire — kills the 404 console noise
      return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

    if (p === "/")
      // classic pages: the entry point is the list, not a shell
      return new Response(null, { status: 303, headers: { location: "/list" } });

    if (p === "/list" || p === "/graph") {
      const m = await model(roots);
      const q = url.searchParams.get("q") ?? "";
      const statusParam = url.searchParams.get("status");
      const status = !statusParam ? null : statusParam;
      const rel = (abs: string) => relOf(m.rs, abs);
      const docHref = (abs: string) => `/doc/${encodeURI(rel(abs))}`;
      // htmx-style swap: the client glue tags its fetch `x-fragment: main`;
      // absent or any other value gets the classic full page — the form
      // still works without JS and the enhancement degrades to a reload
      const frag = req.headers.get("x-fragment") === "main";
      if (p === "/list") {
        const { nodes } = filtered(m.snap, q, status, false);
        const body = listTable(nodes, rel);
        const filters = filterForm("list", q, status);
        return frag
          ? html(mainFragment("list — tsk", body, filters))
          : html(page({ active: "list", title: "list — tsk", body, filters }));
      }
      const { nodes, edges } = filtered(m.snap, q, status, true); // graph keeps ghosts (ghost edges included)
      const body = await renderGraph(nodes, edges, docHref);
      const filters = filterForm("graph", q, status);
      return frag
        ? html(mainFragment("graph — tsk", body, filters))
        : html(
            page({
              active: "graph",
              cls: "fill",
              title: "graph — tsk",
              body,
              zoom: true,
              filters,
            }),
          );
    }

    if (p === "/next") {
      const m = await model(roots);
      return html(nextPage(nextUp(m.graph, terminalsOf(m.conf)), (abs) => relOf(m.rs, abs)));
    }

    if (p === "/doc" || p.startsWith("/doc/")) {
      const rest = p.slice("/doc/".length);
      const m = await model(roots);
      // trust boundary: the relpath resolves against the served roots and
      // MUST name a corpus member (recomputed per request) — abs paths, ..
      // and unknown files all miss the set and 404 before any fs read
      const abs = m.rs.map((r) => resolve(r, rest)).find((c) => m.files.includes(c));
      if (!abs) return html(notFoundPage(rest), 404);
      try {
        const r = parseFile(abs, m.rs, m.conf);
        const source = readFileSync(abs, "utf8");
        const title = r.ok ? r.v.title : basename(abs, ".md");
        // same gray-matter split parse.ts runs, so parser and page agree on
        // the body; first ^# line dropped — it is the very line above shows as title
        const body = matter(source).content.replace(/^# .+\n?/m, "");
        const next = nextUp(m.graph, terminalsOf(m.conf))[0];
        // D3 trust pattern (same as the route itself): a blocked-by entry
        // links only when it names a corpus member; everything else stays inert text
        const linkOf = (raw: string): string | null => {
          const target = resolve(dirname(abs), raw); // links resolve vs the doc's dir (parse.ts convention)
          return m.files.includes(target) ? `/doc/${encodeURI(relOf(m.rs, target))}` : null;
        };
        return html(
          page({
            active: "",
            title: `${title} — tsk`,
            body: docPage({
              title,
              html: renderMd(body),
              source,
              status: r.ok ? r.v.status : null,
              attrs: r.ok ? r.v.attrs : {},
              linkOf,
              next: next ? `/doc/${encodeURI(relOf(m.rs, next.path))}` : null,
            }),
          }),
        );
      } catch {
        return html(notFoundPage(rest), 404); // vanished mid-request — same answer as never-existed
      }
    }

    if (p.startsWith("/vendor/")) {
      const rel = VENDOR[p.slice("/vendor/".length) as keyof typeof VENDOR];
      const f = rel && (await fileResponse(resolve(vendorRoot, rel)));
      return f ?? new Response("not found", { status: 404 });
    }

    const file = safeWebFile(p.slice(1));
    return (file ? await fileResponse(file) : null) ?? html(notFoundPage(p), 404);
  };

  // thin node:http driver: node req → Request, handler, Response → res
  const server = createServer(async (nodeReq, nodeRes) => {
    try {
      const headers = new Headers();
      for (const [k, v] of Object.entries(nodeReq.headers))
        if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
      const res = await handler(
        new Request(`http://${nodeReq.headers.host ?? `${host}:${port}`}${nodeReq.url}`, {
          method: nodeReq.method ?? "GET",
          headers,
        }),
      );
      const body = Buffer.from(await res.arrayBuffer());
      nodeRes.writeHead(res.status, Object.fromEntries(res.headers));
      nodeRes.end(nodeReq.method === "HEAD" ? undefined : body);
    } catch {
      nodeRes.writeHead(500).end("internal error"); // unhandled route crash — the old bun driver answered 500 too
    }
  });
  let bound = port;
  // node listen is async (bun's old serve API bound synchronously): await bind so port/host are real on return
  await new Promise<void>((ok) =>
    server.listen(port, host, () => {
      bound = (server.address() as AddressInfo).port;
      console.error(`tsk serve → http://${host}:${bound}/`);
      ok();
    }),
  );
  return {
    hostname: host,
    get port() {
      return bound;
    },
    stop: (closeActive = true) => {
      if (closeActive) server.closeAllConnections(); // Bun stop(true) semantics
      server.close();
    },
  };
};
