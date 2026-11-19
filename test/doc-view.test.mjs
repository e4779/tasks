import { expect, test } from "bun:test";
import { renderMd } from "../src/markdown";

test("markdown-it html:false default holds: raw html in source escapes to inert text", () => {
  const html = renderMd('<script>evil()</script> <img onerror="x">');
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("<img");
});

test("link policy: http passes, scheme-hijacked hrefs render inert (validateLink)", () => {
  const html = renderMd(
    "[ok](https://x/y) [x](javascript:alert(1)) [y](data:text/html,hi) [z](vbscript:x)",
  );
  expect(html).toContain('href="https://x/y"');
  // blocked links degrade to literal text — never a live anchor
  expect(html).not.toContain('<a href="javascript:');
  expect(html).not.toContain('<a href="data:');
  expect(html).not.toContain('<a href="vbscript:');
});

test("wikilinks become relative md links — URL=file makes them doc routes", () => {
  const html = renderMd("see [[completed-card]]");
  expect(html).toContain('href="./completed-card.md"');
});

test("checkboxes render static: disabled inputs, [x] checked, never mutable", () => {
  const html = renderMd("- [ ] first\n- [x] second\n- [X] third\n- plain");
  expect(html).toContain('<input type="checkbox" disabled="disabled"/> first');
  expect(html).toContain('<input type="checkbox" disabled="disabled" checked="checked"/> second');
  expect(html).toContain('<input type="checkbox" disabled="disabled" checked="checked"/> third');
  expect(html.match(/<input/g)?.length).toBe(3);
});

test("code fences: the wikify pass rewrites them too (parse.ts-carried shortcut), but they stay text", () => {
  const html = renderMd("```\n[[not-a-link]]\n```");
  expect(html).toContain("[not-a-link](./not-a-link.md)"); // visible rewritten text inside the fence
  expect(html).not.toContain('href="./not-a-link.md"'); // never a live link
});
