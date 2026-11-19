import { readFileSync } from "node:fs";
import { basename, relative, resolve, sep } from "node:path";
import matter from "gray-matter";
import { DEFAULT_TERMINALS, loadConfig, terminalsOf } from "./config";
import { discover } from "./discover";
import type { Graph } from "./graph";
import { buildGraph } from "./graph";
import { renderGraph } from "./graph-view";
import { renderMd } from "./markdown";
import { hardBlocked, nextUp } from "./next";
import { parseFile } from "./parse";
import { docPage, filtered, filterForm, listTable, nextPage, notFoundPage, page } from "./render";

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

const webRoot = resolve(import.meta.dir, "..", "web");

// vendor: constant pathname → constant node_modules file, nothing user-controlled to traverse
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
  return abs.startsWith(`${webRoot}${sep}`) ? Bun.file(abs) : null;
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
export const startServer = (roots: string[], port: number, host = "127.0.0.1") => {
  const server = Bun.serve({
    hostname: host,
    port,
    fetch: async (req) => {
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
        if (p === "/list") {
          const { nodes } = filtered(m.snap, q, status, false);
          return html(
            page({
              active: "list",
              title: "list — tsk",
              body: listTable(nodes, rel),
              filters: filterForm("list", q, status),
            }),
          );
        }
        const { nodes, edges } = filtered(m.snap, q, status, true); // graph keeps ghosts (ghost edges included)
        return html(
          page({
            active: "graph",
            title: "graph — tsk",
            body: await renderGraph(nodes, edges, docHref),
            zoom: true,
            filters: filterForm("graph", q, status),
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
          return html(
            page({
              active: "",
              title: `${title} — tsk`,
              body: docPage({ title, html: renderMd(body), source }),
            }),
          );
        } catch {
          return html(notFoundPage(rest), 404); // vanished mid-request — same answer as never-existed
        }
      }

      if (p.startsWith("/vendor/")) {
        const rel = VENDOR[p.slice("/vendor/".length) as keyof typeof VENDOR];
        const f = rel && Bun.file(resolve(import.meta.dir, "..", "node_modules", rel));
        return f && (await f.exists())
          ? new Response(f, { headers: { "cache-control": "no-store" } })
          : new Response("not found", { status: 404 });
      }

      const file = safeWebFile(p.slice(1));
      return file && (await file.exists())
        ? new Response(file, { headers: { "cache-control": "no-store" } })
        : html(notFoundPage(p), 404);
    },
  });
  console.error(`tsk serve → http://${host}:${server.port}/`);
  return server;
};
