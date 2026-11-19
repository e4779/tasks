import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { discover } from "../src/discover";
import { buildGraph } from "../src/graph";
import { parseFile } from "../src/parse";
import { snapshot, startServer } from "../src/serve";

const FX = join(import.meta.dir, "fixtures");
const tasks = (await discover([FX])).flatMap((f) => {
  const r = parseFile(f, [FX]);
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

const server = startServer([FX], 0);
const base = `http://${server.hostname}:${server.port}`;
const get = (p: string) => fetch(`${base}${p}`);
afterAll(() => server.stop(true));

test("/ redirects 303 to /list", async () => {
  const r = await fetch(`${base}/`, { redirect: "manual" });
  expect(r.status).toBe(303);
  expect(r.headers.get("location")).toBe("/list");
  expect((await get("/list")).status).toBe(200);
});

test("/list: server-rendered table — ghosts stay out, undone first, rows link to /doc relpaths", async () => {
  const html = await (await get("/list")).text();
  expect(html).toContain("<table>");
  expect(html).toContain('<td class="st pending">pending</td>');
  expect(html).toContain('href="/doc/tasks/normal-card.md"');
  expect(html).not.toContain("missing-dep.md"); // ghost never lists
  expect(html.indexOf("/doc/tasks/no-h1.md")).toBeLessThan(
    html.indexOf("/doc/tasks/completed-card.md"),
  ); // undone first
  expect(html).toContain('aria-current="page"');
});

test("/list filters are URL arguments: ?status=… and ?q=… filter server-side", async () => {
  const done = await (await get("/list?status=done")).text();
  expect(done).toContain("/doc/tasks/completed-card.md");
  expect(done).not.toContain("/doc/tasks/normal-card.md");
  const q = await (await get("/list?q=cyclic")).text();
  expect(q).toContain("/doc/tasks/cyclic-a.md");
  expect(q).not.toContain("/doc/tasks/normal-card.md");
});

test("/next: server-rendered nextUp output, linked", async () => {
  const html = await (await get("/next")).text();
  expect(html).toContain("no-h1");
  expect(html).toContain("Normal Card");
  expect(html).toContain('href="/doc/tasks/normal-card.md"');
  expect(html).not.toContain("Blocked Card"); // hard-blocked cards never surface
});

test("/graph: inline SVG with elk geometry in data attrs, legend, d3 only here", async () => {
  const html = await (await get("/graph")).text();
  expect(html).toContain("<svg data-zoom data-edges=");
  expect(html).toMatch(
    /<g class="card st-pending[^"]*" data-path="[^"]*normal-card\.md" data-x="-?\d/,
  );
  expect(html).toContain('class="tsk-legend"');
  expect(html).toContain('src="/vendor/d3.min.js"'); // zoom script on the graph page only
  const list = await (await get("/list")).text();
  expect(list).not.toContain("d3.min.js");
});

test("/doc relpath protocol: every corpus file renders 200; abs/…/missing 404", async () => {
  for (const f of await discover([FX])) {
    const rel = f.slice(`${FX}/`.length);
    const r = await get(`/doc/${rel}`);
    expect(r.status, rel).toBe(200);
    expect(await r.text(), rel).toContain('<article class="md">');
  }
  expect((await get("/doc//etc/passwd")).status).toBe(404); // absolute path
  expect((await get("/doc/tasks/%2e%2e/%2e%2e/package.json")).status).toBe(404); // .. escapes the root
  expect((await get("/doc/tasks/nope.md")).status).toBe(404); // missing member
  expect((await get("/doc/tasks/normal-card.md/x")).status).toBe(404); // not a file
});

test("/doc page: frontmatter hidden, leading h1 skipped, md+wikilinks live, source behind details", async () => {
  const html = await (await get("/doc/tasks/normal-card.md")).text();
  const article = html.slice(html.indexOf('<article class="md">'), html.indexOf("<details>"));
  expect(article).not.toContain("status:"); // frontmatter stripped
  expect(article).not.toContain("# Normal Card"); // the h1 IS the page title, never duplicated
  expect(article).toContain('href="./cyclic-a.md"'); // md links verbatim — URL=file makes them doc routes
  expect(article).toContain('href="./completed-card.md"'); // wikilink resolved
  expect(article).toContain('<input type="checkbox" disabled="disabled"/>'); // static task list
  expect(article).toContain('checked="checked"'); // [x] state preserved
  expect(html).toContain('<h1 class="doc-title">Normal Card</h1>');
  expect(html).toContain("<pre>---"); // raw source (frontmatter included) behind details
});

test("/doc D3+D8: marginnote carries status/blocked-by, resolves corpus members only, next → footer", async () => {
  const blocked = await (await get("/doc/tasks/blocked-card.md")).text();
  expect(blocked).toContain('<aside class="marginnote">');
  expect(blocked).toContain('<span class="mm-label">status</span> <span>pending</span>');
  expect(blocked).toContain('href="/doc/tasks/normal-card.md"'); // corpus member → live /doc link
  expect(blocked).toContain(">./missing-dep.md<"); // not in the corpus → inert text
  expect(blocked.slice(blocked.indexOf("<aside"))).not.toContain("priority"); // only the four pinned keys render
  const normal = await (await get("/doc/tasks/normal-card.md")).text();
  // cyclic-a/b and blocked-card are blocked, completed is done → nextUp[0] = no-h1
  expect(normal).toContain('<a class="next" href="/doc/tasks/no-h1.md">next →</a>');
});

test("/doc escaping: task-derived text never reaches the page raw", async () => {
  const html = await (await get("/doc/tasks/normal-card.md")).text();
  expect(html).not.toMatch(/<script>alert/);
});

test("vendor: d3 UMD + open-props css (dark AND light switch) served; dead UMDs stay 404", async () => {
  const d3 = await get("/vendor/d3.min.js");
  expect(d3.status).toBe(200);
  expect((await d3.text()).slice(0, 40)).toContain("d3js.org"); // the real UMD bundle
  for (const f of [
    "normalize",
    "theme.dark.switch",
    "theme.light.switch",
    "sizes",
    "colors",
    "shadows",
    "easings",
  ]) {
    const r = await get(`/vendor/${f}.min.css`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("css");
  }
  // the SPA era's client bundles are gone for good
  expect((await get("/vendor/markdown-it.umd.min.js")).status).toBe(404);
  expect((await get("/vendor/elk.bundled.js")).status).toBe(404);
  expect((await get("/vendor/..%2Fpackage.json")).status).toBe(404);
});

test("the /api JSON layer is dead: snapshot and doc endpoints 404", async () => {
  expect((await get("/api/snapshot")).status).toBe(404);
  expect((await get("/api/doc?path=/etc/passwd")).status).toBe(404);
});

test("web assets + favicon: style.css and main.js served, no-store", async () => {
  for (const f of ["style.css", "main.js"]) {
    const r = await get(`/${f}`);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
  }
  const fav = await get("/favicon.ico");
  expect(fav.status).toBe(204);
});
