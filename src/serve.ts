import { readFileSync } from "node:fs";
import { basename, resolve, sep } from "node:path";
import { discover } from "./discover";
import type { Graph } from "./graph";
import { buildGraph } from "./graph";
import { hardBlocked } from "./next";
import { parseFile } from "./parse";

export type SnapshotNode = Readonly<{
  path: string;
  title: string;
  status: string | null;
  priority: string | null;
  blocked: boolean;
  ghost: boolean;
}>;
export type Snapshot = Readonly<{
  nodes: SnapshotNode[];
  edges: Readonly<{ from: string; to: string; kind: "soft" | "hard" }>[];
}>;

export const snapshot = (graph: Graph): Snapshot => {
  const blocked = hardBlocked(graph);
  return {
    nodes: graph.nodes.map((n) => ({
      path: n.path,
      title: n.title,
      status: n.status,
      priority: typeof n.attrs.priority === "string" ? n.attrs.priority : null,
      blocked: blocked.has(n.path),
      ghost: graph.ghosts.includes(n.path),
    })),
    edges: graph.edges,
  };
};

const webRoot = resolve(import.meta.dir, "..", "web");

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
        const files = await discover(roots.length > 0 ? roots : ["."]);
        const tasks = files.flatMap((f) => {
          const r = parseFile(f, roots);
          return r.ok ? [r.v] : [];
        });
        return Response.json(snapshot(buildGraph(tasks)));
      }
      if (pathname === "/api/doc") {
        const p = url.searchParams.get("path") ?? "";
        // trust boundary: only corpus members (recomputed per request), ?path never reaches the fs raw
        const files = await discover(roots.length > 0 ? roots : ["."]);
        if (!files.includes(p)) return new Response("not found", { status: 404 });
        const r = parseFile(p, roots);
        return Response.json({
          path: p,
          title: r.ok ? r.v.title : basename(p, ".md"),
          source: readFileSync(p, "utf8"),
        });
      }
      // vendor: constant pathname → constant node_modules file, nothing user-controlled to traverse
      if (pathname === "/vendor/force-graph.min.js") {
        const f = Bun.file(
          resolve(import.meta.dir, "..", "node_modules/force-graph/dist/force-graph.min.js"),
        );
        return (await f.exists())
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
