import { expect, test } from "bun:test";
import { join } from "node:path";
import { parseFile } from "../src/parse";

const fx = (name: string) => join(import.meta.dir, "fixtures", "tasks", name);
const task = (name: string) => {
  const r = parseFile(fx(name), []);
  if (!r.ok) throw new Error(r.e);
  return r.v;
};

test("title: first h1 wins", () => {
  expect(task("normal-card.md").title).toBe("Normal Card");
});

test("title: falls back to the file stem when there is no h1", () => {
  expect(task("no-h1.md").title).toBe("no-h1");
});

test("links: md link and wikilink, both resolved against the file dir", () => {
  const links = task("normal-card.md").links;
  expect(
    links.some((l) => l.raw === "./cyclic-a.md" && l.resolved === fx("cyclic-a.md")),
  ).toBeTrue();
  expect(
    links.some((l) => l.raw === "completed-card" && l.resolved === fx("completed-card.md")),
  ).toBeTrue();
});

test("checkboxes are counted", () => {
  expect(task("normal-card.md").checkboxes).toBe(2);
});

test("status: unknown vocab warns but passes through", () => {
  const t = task("broken-link.md");
  expect(t.status).toBe("blocked");
  expect(t.warnings).toEqual(["unknown status: blocked"]);
});

test("status: completed is aliased to done without warning", () => {
  const t = task("completed-card.md");
  expect(t.status).toBe("done");
  expect(t.warnings).toEqual([]);
});

test("missing file: ok=false, no throw", () => {
  const r = parseFile(fx("nope.md"), []);
  expect(r.ok).toBeFalse();
});
