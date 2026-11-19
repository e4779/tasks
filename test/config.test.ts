import { expect, test } from "bun:test";
import { join } from "node:path";
import {
  aliasMap,
  collectRcFiles,
  loadConfig,
  parseIni,
  splitList,
  terminalsOf,
} from "../src/config";
import { discover } from "../src/discover";
import { buildGraph } from "../src/graph";
import { nextUp } from "../src/next";
import { parseFile } from "../src/parse";

const CFG = join(import.meta.dir, "fixtures", "config");
const L1 = join(CFG, "l1");
const L2 = join(L1, "l2");
const L3 = join(L2, "l3");
const FXC = join(import.meta.dir, "fixtures-conf");

test("parseIni: comments, blanks, spaces, in-file duplicate → later line wins", () => {
  expect(
    parseIni(
      [
        "# full comment",
        "; also a comment",
        "",
        "  statuses = pending , done  ",
        "statuses=done",
        "novalue",
        "k = v # inline comments are NOT stripped",
      ].join("\n"),
    ),
  ).toEqual({ statuses: "done", k: "v # inline comments are NOT stripped" });
});

test("splitList: commas at brace depth zero only, per-piece trim", () => {
  expect(splitList("**/{tasks,todos}/**/*.md, !**/{tasks,todos}/AGENTS.md")).toEqual([
    "**/{tasks,todos}/**/*.md",
    "!**/{tasks,todos}/AGENTS.md",
  ]);
  expect(splitList("**/{tasks,todos}/**/*.md")).toHaveLength(1);
  expect(splitList("a,{b,[c,d]},e")).toEqual(["a", "{b,[c,d]}", "e"]);
  expect(splitList(" x , ,y ")).toEqual(["x", "y"]);
});

test("collectRcFiles: filesystem root down to the corpus root, shallow → deep", () => {
  expect(collectRcFiles("/a/b")).toEqual(["/.tsk.conf", "/a/.tsk.conf", "/a/b/.tsk.conf"]);
});

test("cascade is per-key: l3 overrides discover, inherits l1 statuses and l2 terminals", () => {
  const m = loadConfig([L3]);
  expect(m.discover).toBe("**/cards/**/*.md, !**/cards/AGENTS.md"); // OVERRIDE at l3
  expect(m.statuses).toBe("pending, in-progress, done, cancelled, archived"); // INHERIT from l1
  expect(m["status.terminals"]).toBe("done"); // INHERIT from l2
  expect(loadConfig([L2]).discover).toBe("**/cards/**/*.md"); // INHERIT from l1
});

test("unknown keys warn and are ignored; known keys in the same file survive", () => {
  const errs: string[] = [];
  const orig = console.error;
  console.error = (m: string) => errs.push(m);
  try {
    const conf = loadConfig([join(CFG, "unknown")]);
    // key-level assert: ancestors' keys (repo-root .tsk.conf discover since
    // f3b244d) correctly cascade DOWN into this chain — deep-equality would
    // wrongly assume a child dir has no ancestors
    expect(conf.statuses).toBe("pending, done");
    expect(Object.keys(conf)).not.toContain("bogus");
  } finally {
    console.error = orig;
  }
  expect(errs.join("\n")).toContain("unknown key 'bogus'");
});

test("discover: config list negation subtracts; explicit pattern arg beats config", async () => {
  expect(await discover([L3])).toEqual([join(L3, "cards", "a.md")]); // AGENTS.md negated at l3
  expect(await discover([L1])).toEqual(
    [join(L3, "cards", "AGENTS.md"), join(L3, "cards", "a.md")].sort(),
  ); // l1 list has no negation → meta file included
  expect(await discover([L3], "**/cards/**/*.md")).toEqual(
    [join(L3, "cards", "AGENTS.md"), join(L3, "cards", "a.md")].sort(),
  ); // explicit arg ignores the config key entirely
});

const task = (p: string, roots: string[]) => {
  const r = parseFile(p, roots);
  if (!r.ok) throw new Error(r.e);
  return r.v;
};

test("status keys via fixtures-conf: alias applies before validation, omitted vocab warns", () => {
  const beta = task(join(FXC, "tasks", "beta.md"), [FXC]);
  expect(beta.status).toBe("done"); // finished → done via status.aliases
  expect(beta.warnings).toEqual([]);
  const going = task(join(FXC, "tasks", "in-progress-card.md"), [FXC]);
  expect(going.status).toBe("in-progress"); // unknown status passes through…
  expect(going.warnings).toEqual(["unknown status: in-progress"]); // …as a warning only
});

test("zero-config (roots=[]): defaults reproduce the pre-config hardcodes", () => {
  expect(task(join(FXC, "tasks", "beta.md"), []).status).toBe("finished"); // no alias without config
  expect(task(join(FXC, "tasks", "beta.md"), []).warnings).toEqual(["unknown status: finished"]);
  const done = task(join(import.meta.dir, "fixtures", "tasks", "completed-card.md"), []);
  expect(done.status).toBe("done"); // default alias completed → done
  expect(done.warnings).toEqual([]);
});

test("aliasMap: default completed→done; config pairs; pair without from:to skipped", () => {
  expect(aliasMap({}).get("completed")).toBe("done");
  expect(aliasMap({ "status.aliases": "finished:done, wip:in-progress" }).get("wip")).toBe(
    "in-progress",
  );
  expect(aliasMap({ "status.aliases": "broken" }).size).toBe(0);
});

const confTasks = (await discover([FXC])).flatMap((f) => {
  const r = parseFile(f, [FXC]);
  return r.ok ? [r.v] : [];
});
const confGraph = buildGraph(confTasks);
const ALPHA = join(FXC, "tasks", "alpha.md");

test("status.terminals discriminates: cancelled blocks under done-only, frees under default", () => {
  expect(terminalsOf(loadConfig([FXC]))).toEqual(["done"]);
  expect(nextUp(confGraph, terminalsOf(loadConfig([FXC]))).map((t) => t.path)).not.toContain(ALPHA); // cancelled blocker is no longer terminal → alpha is hard-blocked
  expect(nextUp(confGraph).map((t) => t.path)).toContain(ALPHA); // default done,cancelled → free
});
