import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { discover } from "../src/discover";
import { buildGraph } from "../src/graph";
import { parseFile } from "../src/parse";
import { snapshot, startServer } from "../src/serve";

const tasks = (await discover([join(import.meta.dir, "fixtures")])).flatMap((f) => {
  const r = parseFile(f, []);
  return r.ok ? [r.v] : [];
});
const snap = snapshot(buildGraph(tasks));
const by = (suffix: string) => snap.nodes.find((n) => n.path.endsWith(suffix));

test("snapshot shape: every node carries exactly the viewer contract fields", () => {
  expect(snap.nodes.length).toBe(8); // 7 fixture tasks + missing-dep ghost
  for (const n of snap.nodes)
    expect(Object.keys(n).sort()).toEqual([
      "blocked",
      "ghost",
      "path",
      "priority",
      "status",
      "title",
    ]);
  for (const e of snap.edges) expect(["soft", "hard"]).toContain(e.kind);
});

test("snapshot flags ghosts, blocked cards, priorities; ghost hard edge survives", () => {
  expect(by("missing-dep.md")?.ghost).toBeTrue();
  expect(by("normal-card.md")?.ghost).toBeFalse();
  expect(by("blocked-card.md")?.blocked).toBeTrue(); // hard edge to pending + ghost
  expect(by("cyclic-a.md")?.blocked).toBeTrue(); // mutual hard-block
  expect(by("normal-card.md")?.blocked).toBeFalse();
  expect(by("no-h1.md")?.priority).toBe("10");
  expect(snap.edges.some((e) => e.kind === "hard" && e.to.endsWith("missing-dep.md"))).toBeTrue();
});

const server = startServer([join(import.meta.dir, "fixtures")], 0);
const base = `http://${server.hostname}:${server.port}`;
afterAll(() => server.stop(true));

test("vendor: force-graph UMD bundle is served from node_modules", async () => {
  const r = await fetch(`${base}/vendor/force-graph.min.js`);
  expect(r.status).toBe(200);
  expect(r.headers.get("content-type")).toContain("javascript");
  expect((await r.text()).slice(0, 40)).toContain("force-graph");
});

test("favicon.ico gets a real response, not a 404", async () => {
  const r = await fetch(`${base}/favicon.ico`);
  expect(r.status).toBe(204);
});

test("api/doc: corpus member returns {path,title,source}; everything else is 404", async () => {
  const p = by("normal-card.md")?.path ?? "";
  const r = await fetch(`${base}/api/doc?path=${encodeURIComponent(p)}`);
  expect(r.status).toBe(200);
  const doc = await r.json();
  expect(doc.path).toBe(p);
  expect(doc.title.length).toBeGreaterThan(0);
  expect(doc.source).toContain("status:"); // raw markdown, frontmatter included
});

test("api/doc trust boundary: non-corpus and empty paths never reach the fs", async () => {
  expect((await fetch(`${base}/api/doc?path=${encodeURIComponent("/etc/passwd")}`)).status).toBe(
    404,
  );
  expect((await fetch(`${base}/api/doc?path=`)).status).toBe(404);
  expect((await fetch(`${base}/api/doc`)).status).toBe(404);
});
