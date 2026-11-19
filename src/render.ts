// Page layout + body renderers for the server-rendered viewer: function
// includes, NOT a template engine (card ruling). Every task-derived string
// goes through esc() — layout strings and data never mix raw.

import type { Snapshot, SnapshotNode } from "./serve.ts";

export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&apos;",
  );

// doc URLs are corpus-root-relative file addresses with .md kept — URL = file
const hrefOf = (rel: string): string => `/doc/${encodeURI(rel)}`;

const NAV = [
  ["list", "/list"],
  ["next", "/next"],
  ["graph", "/graph"],
] as const;

// filter chips: status-only quick filters as stateless submit buttons (the
// htmx-swap card may later key off data-swap; the hook ships now)
const CHIPS = ["pending", "in-progress", "done", "cancelled"] as const;

/**
 * shared page wrapper: head (Open Props links, light+dark switch, d3 only on
 * /graph), nav (plain links — "tabs" are aria-current CSS), filter form
 * OUTSIDE <main> (fragment-swap hook: <main id="main"> is the swap target).
 */
export const page = ({
  active,
  title,
  body,
  zoom = false,
  filters = "",
  cls = "",
}: Readonly<{
  active: "" | "list" | "next" | "graph";
  title: string;
  body: string;
  zoom?: boolean;
  filters?: string;
  cls?: string;
}>): string =>
  `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<link rel="stylesheet" href="/vendor/normalize.min.css"/>
<link rel="stylesheet" href="/vendor/theme.dark.switch.min.css"/>
<link rel="stylesheet" href="/vendor/theme.light.switch.min.css"/>
<link rel="stylesheet" href="/vendor/sizes.min.css"/>
<link rel="stylesheet" href="/vendor/colors.min.css"/>
<link rel="stylesheet" href="/vendor/shadows.min.css"/>
<link rel="stylesheet" href="/vendor/easings.min.css"/>
<link rel="stylesheet" href="/style.css"/>
${zoom ? '<script src="/vendor/d3.min.js" defer></script>\n' : ""}<script>if(localStorage.getItem("theme")==="light")document.documentElement.dataset.theme="light"</script>
<script src="/main.js" defer></script>
</head>
<body${cls ? ` class="${cls}"` : ""}>
<nav>
<ul>${NAV.map(([name, href]) => `<li><a href="${href}"${active === name ? ' aria-current="page"' : ""}>${name}</a></li>`).join("")}</ul>
<button id="theme" type="button" aria-label="toggle light/dark theme">◐</button>
</nav>
${filters}
<main id="main">
${body}
</main>
</body>
</html>`;

/** GET filter form: filters are URL arguments — shareable, bookmarkable, curl-able */
export const filterForm = (action: "list" | "graph", q: string, status: string | null): string => `
<form id="filters" method="get" action="/${action}" data-swap="main">
<input id="q" type="search" name="q" placeholder="search title or path" autocomplete="off" value="${esc(q)}"/>
<button type="submit" name="status" value="" data-chip="all" aria-pressed="${status === null}">all</button>
${CHIPS.map((c) => `<button type="submit" name="status" value="${c}" data-chip="${c}" aria-pressed="${status === c}">${c}</button>`).join("")}
</form>`;

/**
 * swap-fragment answer (client glue tags its fetch `x-fragment: main`): the
 * same <main> the page() wraps plus the title and the query-fresh filter form
 * — no <html>, no nav, no page chrome. The glue lifts #main + <title> from it
 * and re-syncs the OUTSIDE-<main> chips' aria-pressed from the fresh form.
 */
export const mainFragment = (title: string, body: string, filters = ""): string =>
  `<title>${esc(title)}</title>
${filters}<main id="main">
${body}
</main>`;

/**
 * shared q+status filter: q matches title or path (case-insensitive), status
 * filters exact (null = all). Ghosts only survive when asked for (graph keeps
 * its ghost edges; list never shows them).
 */
export const filtered = (
  snap: Snapshot,
  q: string,
  status: string | null,
  withGhosts: boolean,
): { nodes: SnapshotNode[]; edges: Snapshot["edges"] } => {
  const ql = q.toLowerCase();
  const keep = (n: SnapshotNode): boolean =>
    (ql === "" || n.title.toLowerCase().includes(ql) || n.path.toLowerCase().includes(ql)) &&
    (status === null || n.status === status) &&
    (withGhosts || !n.ghost);
  const nodes = snap.nodes.filter(keep);
  const seen = new Set(nodes.map((n) => n.path));
  return { nodes, edges: snap.edges.filter((e) => seen.has(e.from) && seen.has(e.to)) };
};

// same order as nextUp: undone (pending/in-progress/statusless) first, then path
const undone = (n: SnapshotNode): boolean =>
  n.status === null || n.status === "pending" || n.status === "in-progress";

export const listTable = (
  nodes: readonly SnapshotNode[],
  relOf: (abs: string) => string,
): string => {
  const rows = [...nodes]
    .sort((a, b) => Number(undone(b)) - Number(undone(a)) || (a.path < b.path ? -1 : 1))
    .map(
      (n) =>
        `<tr><td class="st ${n.status ?? "none"}">${n.status ?? "none"}</td><td><a href="${hrefOf(relOf(n.path))}">${esc(n.title)}</a></td><td class="path">${esc(relOf(n.path))}</td></tr>`,
    )
    .join("\n");
  return `<table>
<thead><tr><th>status</th><th>title</th><th>path</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`;
};

export const listPage = (
  snap: Snapshot,
  relOf: (abs: string) => string,
  q: string,
  status: string | null,
): string =>
  page({
    active: "list",
    title: "list — tsk",
    body: listTable(filtered(snap, q, status, false).nodes, relOf),
    filters: filterForm("list", q, status),
  });

export const nextPage = (
  items: readonly { title: string; path: string }[],
  relOf: (abs: string) => string,
): string =>
  page({
    active: "next",
    title: "next — tsk",
    body: items
      .map(
        (t) =>
          `<div class="next-item"><a href="${hrefOf(relOf(t.path))}"><strong>${esc(t.title)}</strong></a><span class="path">${esc(relOf(t.path))}</span></div>`,
      )
      .join("\n"),
  });

// marginnote rows (D3): only the four pinned keys render; a blocked-by entry
// becomes a /doc link only when the resolver names a corpus member. YAML dates
// arrive as Date objects — ISO, not the noisy Date.toString
const listOf = (v: unknown): readonly string[] => {
  if (Array.isArray(v)) return v.map(String);
  if (v === undefined || v === null || v === "") return [];
  return [v instanceof Date ? v.toISOString().slice(0, 10) : String(v)];
};

const metaRow = (
  label: string,
  items: readonly string[],
  linkOf: (raw: string) => string | null,
): string =>
  items.length === 0
    ? ""
    : `<div><span class="mm-label">${esc(label)}</span> ${items
        .map((t) => {
          const href = linkOf(t);
          return href ? `<a href="${href}">${esc(t)}</a>` : `<span>${esc(t)}</span>`;
        })
        .join(", ")}</div>`;

export const docPage = (
  doc: Readonly<{
    title: string;
    html: string;
    source: string;
    next: string | null;
    status: string | null;
    attrs: Record<string, unknown>;
    linkOf: (raw: string) => string | null;
  }>,
): string => {
  const note = [
    metaRow("status", doc.status === null ? [] : [doc.status], () => null),
    metaRow("blocked-by", listOf(doc.attrs["blocked-by"]), doc.linkOf),
    metaRow("tags", listOf(doc.attrs.tags), () => null),
    metaRow("created_at", listOf(doc.attrs.created_at), () => null),
  ].join("");
  return `<a class="back" href="/list">← back</a>
<h1 class="doc-title">${esc(doc.title)}</h1>
<div class="doc">
<article class="md">
${doc.html}
</article>
<details><summary>raw source</summary><pre>${esc(doc.source)}</pre></details>
${doc.next ? `<a class="next" href="${doc.next}">next →</a>` : ""}
${note === "" ? "" : `<aside class="marginnote">${note}</aside>`}
</div>`;
};

export const notFoundBody = (what: string): string =>
  `<p class="path">no document in the current corpus for this path: ${esc(what)}</p>`;

export const notFoundPage = (what: string): string =>
  page({ active: "", title: "not found — tsk", body: notFoundBody(what) });
