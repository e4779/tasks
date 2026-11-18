#!/usr/bin/env bun
// One-time taskmd→tsk corpus conversion — contract: tasks/migrate-taskmd-corpora.md.
// Usage: bun tools/migrate-taskmd.mjs <corpus-root> [more-roots...]
//
// Frontmatter-only rewrite (line surgery, no YAML re-dump — untouched keys keep
// their bytes, dates stay dates); body untouched wherever an h1 exists:
//   dependencies: [ids] → blocked-by: [./same-dir-paths] via a per-run id→path
//                   table; bare numeric refs are same-prefix shorthand ("002"
//                   in bcf013 → bcf002); empty list → key dropped
//   id:             → dropped (path is identity)
//   title:          → dropped when the body has an h1 (h1 wins); a card without
//                     h1 gets one materialized from title, else from filename
//   status:         completed→done, blocked→pending (blocked is derived in tsk,
//                     never written); pending/in-progress/cancelled pass through
//   parent: <id>    → kept as free field, value rewritten id→path
// All other keys pass through untouched (operator ruling 2026-11-20: only
// id/dependencies/title/status transform).
//
// A card = md file whose frontmatter id matches its filename stem (hmlb002 in
// hmlb002-*.md). That binding keeps meta files (AGENTS.md/TASKMD_SPEC.md) and
// foreign examples out; after conversion no id: remains, so a rerun writes
// nothing (idempotent by construction). All-or-nothing per run: any error —
// duplicate ids, unresolved refs, unexpected line layout — means zero writes.

import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, relative } from "node:path";
import matter from "gray-matter";
import { glob } from "tinyglobby";

const DISCOVER = "**/{tasks,todos}/**/*.md";

const isCard = (name, data) =>
  typeof data.id === "string" && (name === `${data.id}.md` || name.startsWith(`${data.id}-`));

const ownPrefix = (id) => id.replace(/\d+$/, "");

export const mapStatus = (status) =>
  status === "completed" ? "done" : status === "blocked" ? "pending" : status;

export const buildIdTable = (cards) => {
  const table = new Map();
  const dup = [];
  for (const c of cards) {
    if (table.has(c.data.id)) dup.push(`${c.data.id}: ${table.get(c.data.id)} AND ${c.path}`);
    else table.set(c.data.id, c.path);
  }
  return dup.length
    ? { ok: false, e: `duplicate ids:\n  ${dup.join("\n  ")}` }
    : { ok: true, v: table };
};

export const resolveRef = (ref, ownId, table) => {
  const hit = table.get(ref);
  if (hit) return { ok: true, v: hit };
  if (/^\d+$/.test(ref)) {
    const hits = [...table].filter(([id]) => id.startsWith(ownPrefix(ownId)) && id.endsWith(ref));
    if (hits.length === 1) return { ok: true, v: hits[0][1] };
    if (hits.length > 1)
      return {
        ok: false,
        e: `ambiguous numeric ref "${ref}" (from ${ownId}): ${hits.map((h) => h[0]).join(", ")}`,
      };
  }
  return { ok: false, e: `unresolved ref "${ref}" (from ${ownId})` };
};

const relRef = (fromFile, target) => {
  const r = relative(dirname(fromFile), target);
  return r.startsWith(".") ? r : `./${r}`;
};

// shortcut: bare-unquoted numeric deps parse as yaml ints and none exist live; upgrade by stringifying with padding if one appears
const depPathsOf = (path, data, table) => {
  if (!Array.isArray(data.dependencies) || data.dependencies.some((d) => typeof d !== "string"))
    return { ok: false, e: `${path}: dependencies must be a list of id strings` };
  const paths = [];
  for (const ref of data.dependencies) {
    const r = resolveRef(ref, data.id, table);
    if (!r.ok) return { ok: false, e: `${path}: ${r.e}` };
    paths.push(relRef(path, r.v));
  }
  return { ok: true, v: paths };
};

export const convertCard = ({ path, text, data, table }) => {
  const lines = text.split("\n");
  const close = lines.indexOf("---", 1);
  if (lines[0] !== "---" || close < 0) return { ok: false, e: `${path}: frontmatter not found` };
  const body = lines.slice(close + 1).join("\n");
  const hasH1 = /^# /m.test(body);

  const deps =
    data.dependencies === undefined ? { ok: true, v: [] } : depPathsOf(path, data, table);
  if (!deps.ok) return deps;
  let parentPath = null;
  if (data.parent !== undefined) {
    if (typeof data.parent !== "string")
      return { ok: false, e: `${path}: parent must be an id string` };
    const r = resolveRef(data.parent, data.id, table);
    if (!r.ok) return { ok: false, e: `${path}: ${r.e}` };
    parentPath = relRef(path, r.v);
  }
  const statusTo = typeof data.status === "string" ? mapStatus(data.status) : null;

  const seen = {};
  const want = {};
  for (const k of ["id", "title", "status", "dependencies", "parent"]) {
    seen[k] = 0;
    want[k] = data[k] === undefined ? 0 : 1;
  }
  const fm = [];
  for (const line of lines.slice(1, close)) {
    if (line.startsWith("id:")) {
      seen.id += 1;
      continue;
    }
    if (line.startsWith("title:")) {
      seen.title += 1;
      continue;
    }
    if (line.startsWith("status:")) {
      if (statusTo === null) return { ok: false, e: `${path}: status line but no parseable value` };
      fm.push(`status: ${statusTo}`);
      seen.status += 1;
      continue;
    }
    if (line.startsWith("dependencies:")) {
      // a block-style list would leave its continuation lines behind; none live
      if (!line.includes("["))
        return { ok: false, e: `${path}: block-style dependencies unsupported` };
      if (deps.v.length > 0) fm.push(`blocked-by: [${deps.v.join(", ")}]`);
      seen.dependencies += 1;
      continue;
    }
    if (line.startsWith("parent:")) {
      fm.push(`parent: ${parentPath}`);
      seen.parent += 1;
      continue;
    }
    fm.push(line);
  }
  for (const k of Object.keys(want))
    if (seen[k] !== want[k])
      return {
        ok: false,
        e: `${path}: ${seen[k]} '${k}:' line(s) but parsed data says ${want[k]} — refusing to rewrite`,
      };

  const head =
    typeof data.title === "string" && data.title !== "" ? data.title : basename(path, ".md");
  const newBody = hasH1 ? body : `\n# ${head}\n${body}`;
  return {
    ok: true,
    v: {
      text: `---\n${fm.join("\n")}\n---\n${newBody}`,
      stats: {
        deps: deps.v.length,
        parent: parentPath !== null,
        titleDropped: data.title !== undefined,
        h1Materialized: !hasH1,
        statusFrom: typeof data.status === "string" ? data.status : null,
        statusTo,
      },
    },
  };
};

export const planCorpus = (entries) => {
  const cards = [];
  let noId = 0;
  let stemMismatch = 0;
  for (const { path, text } of entries) {
    const { data } = matter(text);
    if (data.id === undefined)
      noId += 1; // meta or already converted
    else if (!isCard(basename(path), data)) stemMismatch += 1;
    else cards.push({ path, text, data });
  }
  const t = buildIdTable(cards);
  if (!t.ok) return t;
  const writes = [];
  const errors = [];
  for (const c of cards) {
    const r = convertCard({ path: c.path, text: c.text, data: c.data, table: t.v });
    if (r.ok) writes.push({ path: c.path, text: r.v.text, stats: r.v.stats });
    else errors.push(r.e);
  }
  return errors.length
    ? { ok: false, e: errors.join("\n") }
    : { ok: true, v: { writes, skipped: { noId, stemMismatch } } };
};

export const migrateCorpus = async (root) => {
  const files = (await glob([DISCOVER], { cwd: root, absolute: true })).sort();
  const plan = planCorpus(files.map((f) => ({ path: f, text: readFileSync(f, "utf8") })));
  if (!plan.ok) return plan;
  for (const w of plan.v.writes) writeFileSync(w.path, w.text);
  const s = plan.v.writes.reduce(
    (acc, w) => ({
      edges: acc.edges + w.stats.deps,
      titlesDropped: acc.titlesDropped + (w.stats.titleDropped ? 1 : 0),
      blockedStripped: acc.blockedStripped + (w.stats.statusFrom === "blocked" ? 1 : 0),
      completedToDone: acc.completedToDone + (w.stats.statusFrom === "completed" ? 1 : 0),
      parentsRewritten: acc.parentsRewritten + (w.stats.parent ? 1 : 0),
      h1Materialized: acc.h1Materialized + (w.stats.h1Materialized ? 1 : 0),
    }),
    {
      edges: 0,
      titlesDropped: 0,
      blockedStripped: 0,
      completedToDone: 0,
      parentsRewritten: 0,
      h1Materialized: 0,
    },
  );
  return {
    ok: true,
    v: {
      root,
      discovered: files.length,
      rewritten: plan.v.writes.length,
      ...plan.v.skipped,
      ...s,
    },
  };
};

if (import.meta.main) {
  const roots = Bun.argv.slice(2);
  if (roots.length === 0) {
    console.error("usage: bun tools/migrate-taskmd.mjs <corpus-root> [more-roots...]");
    process.exit(2);
  }
  let failed = false;
  for (const root of roots) {
    const r = await migrateCorpus(root);
    if (!r.ok) {
      console.error(`${root}:\n${r.e}`);
      failed = true;
      continue;
    }
    const v = r.v;
    console.log(
      `${v.root}: discovered ${v.discovered}, rewritten ${v.rewritten}, skipped ${v.noId} without id + ${v.stemMismatch} id≠stem — blocked-by edges ${v.edges}, titles dropped ${v.titlesDropped}, blocked→pending ${v.blockedStripped}, completed→done ${v.completedToDone}, parent id→path ${v.parentsRewritten}, h1 materialized ${v.h1Materialized}`,
    );
  }
  process.exit(failed ? 1 : 0);
}
