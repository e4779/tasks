import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import matter from "gray-matter";

export type Link = Readonly<{ raw: string; resolved: string }>;
export type ParsedTask = Readonly<{
  path: string;
  title: string;
  attrs: Record<string, unknown>;
  links: Link[];
  checkboxes: number;
  status: string | null;
  warnings: string[];
}>;
export type ParseResult = Readonly<{ ok: true; v: ParsedTask } | { ok: false; e: string }>;

const KNOWN_STATUS = new Set(["pending", "in-progress", "done", "cancelled", "completed"]);
// shortcut: links inside code fences are counted too; upgrade when cards carry fenced examples
const MD_LINK = /\[[^\]]*\]\((?<raw>[^)\s]+)\)/g;
// shortcut: no [[path|alias]] and no md targets with spaces; upgrade when the corpus uses them
const WIKI_LINK = /\[\[(?<raw>[^\]|]+)\]\]/g;

const withExt = (raw: string, ext: string) => (ext && !raw.endsWith(ext) ? `${raw}${ext}` : raw);

export const parseFile = (absPath: string, _roots: string[]): ParseResult => {
  // roots deliberately unused in v0: every link kind resolves against the file's own dir
  try {
    const { data: attrs, content } = matter(readFileSync(absPath, "utf8"));
    const dir = dirname(absPath);
    const resolveLink = (raw: string, ext: string): Link => {
      const bare = withExt(raw.split("#")[0] ?? raw, ext);
      return { raw, resolved: /^(https?:|mailto:)/.test(bare) ? bare : resolve(dir, bare) };
    };
    const collect = (re: RegExp, ext = "") =>
      [...content.matchAll(re)].flatMap((m) => {
        const raw = m.groups?.raw;
        return raw ? [resolveLink(raw, ext)] : [];
      });

    const rawStatus = typeof attrs.status === "string" ? attrs.status : null;
    return {
      ok: true,
      v: {
        path: absPath,
        title: content.match(/^# (.+)$/m)?.[1] ?? basename(absPath, ".md"),
        attrs,
        links: [...collect(MD_LINK), ...collect(WIKI_LINK, ".md")],
        checkboxes: (content.match(/^\s*[-*] \[[ xX]\]/gm) ?? []).length,
        status: rawStatus === "completed" ? "done" : rawStatus,
        warnings:
          rawStatus !== null && !KNOWN_STATUS.has(rawStatus)
            ? [`unknown status: ${rawStatus}`]
            : [],
      },
    };
  } catch (e) {
    return { ok: false, e: `${absPath}: ${String(e)}` };
  }
};
