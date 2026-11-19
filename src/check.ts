import { existsSync } from "node:fs";
import { basename } from "node:path";
import { loadConfig, type TskConf } from "./config.ts";
import { discover } from "./discover.ts";
import { buildGraph } from "./graph.ts";
import { parseFile } from "./parse.ts";

export type Finding = Readonly<{ level: "ERROR" | "WARN" | "INFO"; path: string; detail: string }>;

const RANK: Record<Finding["level"], number> = { ERROR: 0, WARN: 1, INFO: 2 };
const EXTERNAL = /^[a-z][a-z0-9+.-]*:/i; // any URI scheme — parse only special-cases http/mailto, the rest resolve to junk paths
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// severity ruling: ERROR is machine-of-format only — unreadable file or
// unparsable frontmatter, both arriving as parseFile ok:false; every semantic
// finding is a warning/info and never fails the run
export const check = async (
  roots: string[],
  conf: TskConf = loadConfig(roots),
): Promise<readonly Finding[]> => {
  const findings: Finding[] = [];
  const tasks = [];
  for (const f of await discover(roots)) {
    const r = parseFile(f, roots, conf);
    if (!r.ok) {
      findings.push({ level: "ERROR", path: f, detail: r.e });
      continue;
    }
    tasks.push(r.v);
    const stem = basename(f, ".md");
    if (!KEBAB.test(stem)) findings.push({ level: "WARN", path: f, detail: "non-kebab filename" });
    // shortcut: h1 detected as title===stem — a card whose h1 equals its stem false-positives; upgrade when parse exposes hasH1
    if (r.v.title === stem)
      findings.push({ level: "INFO", path: f, detail: "no h1 — title falls back to file stem" });
    for (const w of r.v.warnings) findings.push({ level: "WARN", path: f, detail: w });
    for (const l of r.v.links) {
      if (EXTERNAL.test(l.raw)) continue;
      if (l.resolved === f)
        findings.push({ level: "WARN", path: f, detail: `self-link: ${l.raw}` });
      else if (!existsSync(l.resolved))
        findings.push({ level: "WARN", path: f, detail: `broken prose link: ${l.raw}` });
    }
  }
  const graph = buildGraph(tasks);
  const ghosts = new Set(graph.ghosts);
  const statusOf = new Map(graph.nodes.map((n) => [n.path, n.status]));
  for (const e of graph.edges) {
    if (e.kind !== "hard") continue;
    if (e.from === e.to)
      findings.push({ level: "WARN", path: e.from, detail: "self-link: blocked-by self" });
    else if (ghosts.has(e.to))
      findings.push({
        level: "WARN",
        path: e.from,
        detail: existsSync(e.to)
          ? `non-task blocker: ${e.to} (on disk, outside the corpus)`
          : `ghost blocker: ${e.to} (missing — blocks forever)`,
      });
    else if (statusOf.get(e.to) === "cancelled")
      findings.push({
        level: "WARN",
        path: e.from,
        detail: `blocker cancelled: ${e.to} — edge is dead weight`,
      });
  }
  for (const c of graph.cycles)
    findings.push({
      level: "WARN",
      path: c[0] ?? "",
      detail: `cycle: ${c.map((p) => basename(p, ".md")).join(" -> ")}`,
    });
  return [...findings].sort(
    (a, b) =>
      RANK[a.level] - RANK[b.level] ||
      (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) ||
      (a.detail < b.detail ? -1 : 1),
  );
};
