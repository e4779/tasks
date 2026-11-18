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
    expect(Object.keys(n).sort()).toEqual(["blocked", "ghost", "path", "status", "title"]);
  for (const e of snap.edges) expect(["soft", "hard"]).toContain(e.kind);
});

test("snapshot flags ghosts, blocked cards; ghost hard edge survives", () => {
  expect(by("missing-dep.md")?.ghost).toBeTrue();
  expect(by("normal-card.md")?.ghost).toBeFalse();
  expect(by("blocked-card.md")?.blocked).toBeTrue(); // hard edge to pending + ghost
  expect(by("cyclic-a.md")?.blocked).toBeTrue(); // mutual hard-block
  expect(by("normal-card.md")?.blocked).toBeFalse();
  expect(snap.edges.some((e) => e.kind === "hard" && e.to.endsWith("missing-dep.md"))).toBeTrue();
});

const server = startServer([join(import.meta.dir, "fixtures")], 0);
const base = `http://${server.hostname}:${server.port}`;
afterAll(() => server.stop(true));

test("vendor: d3 UMD bundle is served from node_modules", async () => {
  const r = await fetch(`${base}/vendor/d3.min.js`);
  expect(r.status).toBe(200);
  expect(r.headers.get("content-type")).toContain("javascript");
  const body = await r.text();
  expect(body.slice(0, 40)).toContain("d3js.org"); // the real UMD bundle header
  expect(body.length).toBeGreaterThan(200_000); // ~280 KB minified
  expect((await fetch(`${base}/vendor/force-graph.min.js`)).status).toBe(404); // gone for good
});

test("vendor: elkjs bundled layout engine is served from node_modules", async () => {
  const r = await fetch(`${base}/vendor/elk.bundled.js`);
  expect(r.status).toBe(200);
  expect(r.headers.get("content-type")).toContain("javascript");
  const body = await r.text();
  expect(body).toContain("org.eclipse.elk.layered"); // the layered algorithm is in
  expect(body.length).toBeGreaterThan(1_000_000); // the real 1.65 MB bundle
});

test("vendor: open-props css subsets are served; unknown vendor paths stay 404", async () => {
  for (const f of ["normalize", "theme.dark.switch", "sizes", "colors", "shadows", "easings"]) {
    const r = await fetch(`${base}/vendor/${f}.min.css`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("css");
  }
  const colors = await (await fetch(`${base}/vendor/colors.min.css`)).text();
  expect(colors).toContain("--orange-6"); // the status ramps the viewer resolves
  expect((await fetch(`${base}/vendor/nope.css`)).status).toBe(404);
  expect((await fetch(`${base}/vendor/..%2Fpackage.json`)).status).toBe(404);
});

test("vendor: markdown-it UMD bundle is served (doc renderer)", async () => {
  const r = await fetch(`${base}/vendor/markdown-it.umd.min.js`);
  expect(r.status).toBe(200);
  expect(r.headers.get("content-type")).toContain("javascript");
  const body = await r.text();
  expect(body).toContain("markdownit"); // the real UMD bundle (global markdownit)
  expect(body.length).toBeGreaterThan(50_000); // ~100 KB minified
  expect((await fetch(`${base}/vendor/markdown-it.js`)).status).toBe(404);
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

test("api/doc body: server-side split — frontmatter and title h1 gone, fallback cards keep whole body", async () => {
  const get = async (suffix: string) =>
    await (
      await fetch(`${base}/api/doc?path=${encodeURIComponent(by(suffix)?.path ?? "")}`)
    ).json();
  const doc = await get("normal-card.md");
  expect(doc.body).not.toContain("status:"); // frontmatter stripped
  expect(doc.body).not.toContain("# Normal Card"); // the h1 IS the h2 title, never duplicated
  expect(doc.body).toContain("[cyclic-a](./cyclic-a.md)"); // md links verbatim for the client
  expect(doc.body).toContain("[[completed-card]]"); // wikilink preprocessing stays client-side
  expect(await (await get("no-h1.md")).body).toContain("Body only."); // no h1 → whole body
});

test("api/doc trust boundary: non-corpus and empty paths never reach the fs", async () => {
  expect((await fetch(`${base}/api/doc?path=${encodeURIComponent("/etc/passwd")}`)).status).toBe(
    404,
  );
  expect((await fetch(`${base}/api/doc?path=`)).status).toBe(404);
  expect((await fetch(`${base}/api/doc`)).status).toBe(404);
});
