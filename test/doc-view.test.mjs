import { expect, test } from "bun:test";
import mk from "markdown-it";

// shim the browser globals doc.js touches at module top, then import it
globalThis.window = { markdownit: mk };
globalThis.HTMLElement = class {};
globalThis.customElements = { define: () => {} };
const { safeHref } = await import("../web/doc.js");

test("safeHref: http/https/relative pass; every other scheme is inert", () => {
  for (const h of ["http://x", "https://x/y", "./a.md", "a.md", "#frag", "/abs", "//host/p"])
    expect(safeHref(h)).toBeTrue();
  for (const h of [
    "javascript:alert(1)",
    "data:text/html,hi",
    "vbscript:x",
    "file:///etc",
    "mailto:a@b",
  ])
    expect(safeHref(h)).toBeFalse();
});

test("markdown-it html:false default holds: raw html in source escapes to inert text", () => {
  const html = mk().render('<script>evil()</script> <img onerror="x">');
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
});
