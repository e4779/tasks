import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// v0 key set is closed: an unknown key in a .tsk.conf warns and is ignored
const KNOWN_KEYS = new Set([
  "discover",
  "statuses",
  "status.terminals",
  "status.aliases",
  "reduction",
]);

export type TskConf = Readonly<Record<string, string>>;

// INI subset (gitconfig lineage): `key = value`, full-line #/; comments,
// blank-skip, trim; a duplicate key inside one file → later line wins.
// Inline comments are NOT stripped — glob values may legally carry # and ;.
export const parseIni = (text: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
};

// comma split at brace/bracket depth zero, per-piece trim: `a/{x,y}/z, !b` is
// TWO patterns — a naive split shreds the default discover pattern itself
export const splitList = (value: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of value) {
    if (ch === "{" || ch === "[") depth += 1;
    else if (ch === "}" || ch === "]") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p !== "");
};

// ancestor .tsk.conf chain of one root: filesystem root down to the root
// itself (~/.tsk.conf and ~/projects/.tsk.conf are just chain members)
export const collectRcFiles = (root: string): string[] => {
  const dirs: string[] = [];
  for (let d = resolve(root); ; d = dirname(d)) {
    dirs.push(d);
    if (d === dirname(d)) break;
  }
  return dirs.reverse().map((d) => resolve(d, ".tsk.conf"));
};

// per-key merge, shallow → deep; with several roots, later roots win per key
export const loadConfig = (roots: readonly string[]): TskConf => {
  const merged: Record<string, string> = {};
  for (const file of roots.flatMap(collectRcFiles)) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue; // most chain members simply do not exist
    }
    for (const [k, v] of Object.entries(parseIni(text))) {
      if (!KNOWN_KEYS.has(k)) {
        console.error(`tsk.conf: unknown key '${k}' ignored (${file})`);
        continue;
      }
      merged[k] = v;
    }
  }
  return merged;
};

export const DEFAULT_DISCOVER = "**/{tasks,todos}/**/*.md";
export const DEFAULT_TERMINALS: readonly string[] = ["done", "cancelled"];
const DEFAULT_STATUSES = ["pending", "in-progress", "done", "cancelled"];
const DEFAULT_ALIASES = ["completed:done"];

export const statusesOf = (conf: TskConf): ReadonlySet<string> =>
  new Set(conf.statuses ? splitList(conf.statuses) : DEFAULT_STATUSES);

export const terminalsOf = (conf: TskConf): readonly string[] =>
  conf["status.terminals"] ? splitList(conf["status.terminals"]) : DEFAULT_TERMINALS;

// transitive reduction of the /graph picture (tasks/transitive-reduction.md);
// the literal "off" restores the full edge set, everything else renders reduced
export const reductionOf = (conf: TskConf): boolean => conf.reduction !== "off";

export const aliasMap = (conf: TskConf): ReadonlyMap<string, string> =>
  new Map(
    (conf["status.aliases"] ? splitList(conf["status.aliases"]) : DEFAULT_ALIASES).flatMap(
      (pair) => {
        const i = pair.indexOf(":");
        if (i <= 0) {
          console.error(`tsk.conf: alias '${pair}' has no from:to — ignored`);
          return [];
        }
        return [[pair.slice(0, i), pair.slice(i + 1)] as [string, string]];
      },
    ),
  );
