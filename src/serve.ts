import { readFileSync } from "node:fs";
import { basename, resolve, sep } from "node:path";
import matter from "gray-matter";
import { DEFAULT_TERMINALS, loadConfig, terminalsOf } from "./config";
import { discover } from "./discover";
import type { Graph } from "./graph";
import { buildGraph } from "./graph";
import { hardBlocked } from "./next";
import { parseFile } from "./parse";

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
  "elk.bundled.js": "elkjs/lib/elk.bundled.js",
  "markdown-it.umd.min.js": "markdown-it/dist/browser/markdown-it.umd.min.js",
  "normalize.min.css": "open-props/normalize.min.css",
  "theme.dark.switch.min.css": "open-props/theme.dark.switch.min.css",
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

// snapshot is recomputed per request: discover → parseFile → buildGraph, no caching
// unauthenticated read-only server — bind wider than loopback only on trusted LAN
export const startServer = (roots: string[], port: number, host = "127.0.0.1") => {
  const server = Bun.serve({
    hostname: host,
    port,
    fetch: async (req) => {
      if (req.method !== "GET" && req.method !== "HEAD")
        return new Response("method not allowed", { status: 405 });
      const url = new URL(req.url);
      const pathname = url.pathname;
      if (pathname === "/favicon.ico")
        // 204: a real response with zero bytes on the wire — kills the 404 console noise
        return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
      if (pathname === "/api/snapshot") {
        const rs = roots.length > 0 ? roots : ["."];
        const conf = loadConfig(rs);
        const files = await discover(rs);
        const tasks = files.flatMap((f) => {
          const r = parseFile(f, rs, conf);
          return r.ok ? [r.v] : [];
        });
        return Response.json(snapshot(buildGraph(tasks), terminalsOf(conf)));
      }
      if (pathname === "/api/doc") {
        const p = url.searchParams.get("path") ?? "";
        // trust boundary: only corpus members (recomputed per request), ?path never reaches the fs raw
        const files = await discover(roots.length > 0 ? roots : ["."]);
        if (!files.includes(p)) return new Response("not found", { status: 404 });
        const r = parseFile(p, roots);
        const source = readFileSync(p, "utf8");
        // same gray-matter split parse.ts runs, so client and parser agree on the body;
        // first ^# line dropped server-side — it is the very line parse.ts shows as title
        const body = matter(source).content.replace(/^# .+\n?/m, "");
        return Response.json({
          path: p,
          title: r.ok ? r.v.title : basename(p, ".md"),
          source,
          body,
        });
      }
      if (pathname.startsWith("/vendor/")) {
        const rel = VENDOR[pathname.slice("/vendor/".length) as keyof typeof VENDOR];
        const f = rel && Bun.file(resolve(import.meta.dir, "..", "node_modules", rel));
        return f && (await f.exists())
          ? new Response(f, { headers: { "cache-control": "no-store" } })
          : new Response("not found", { status: 404 });
      }
      const file = safeWebFile(pathname === "/" ? "index.html" : pathname.slice(1));
      return file && (await file.exists())
        ? new Response(file, { headers: { "cache-control": "no-store" } })
        : new Response("not found", { status: 404 });
    },
  });
  console.error(`tsk serve → http://${host}:${server.port}/`);
  return server;
};
