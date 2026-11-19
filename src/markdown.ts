// Server-side markdown for /doc pages: markdown-it (npm) with its safe
// defaults — html:false escapes raw html in source to inert text, and the
// built-in validateLink drops javascript:/vbscript:/data: hrefs, so rendered
// output needs no post-hoc scrubbing (defense held by tests).

import MarkdownIt from "markdown-it";

const md = new MarkdownIt();

// shortcut: wikilinks inside code fences are rewritten too (same shortcut parse.ts carries); upgrade when cards grow fenced examples
const wikify = (s: string): string => s.replace(/\[\[([^\]|]+)\]\]/g, "[$1](./$1.md)");

// checkboxes render STATIC (viewer never mutates the corpus): CommonMark
// leaves "[ ]" as literal text in the li; swap the leading marker for a
// disabled input — our own md output, so the rewrite is deterministic
const checkboxes = (html: string): string =>
  html.replace(
    /<li>\[([ xX])\] /g,
    (_m, c: string) =>
      `<li><input type="checkbox" disabled="disabled"${c === " " ? "" : ' checked="checked"'}/> `,
  );

// D7 permalinks: h2/h3 get a unicode slug id + hover-revealed ¶ anchor.
// shortcut: duplicate headings collide on the id, upgrade when corpora repeat titles
const slugify = (s: string): string =>
  s
    .replace(/<[^>]+>/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "section";

const permalinks = (html: string): string =>
  html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_m, lvl: string, inner: string) => {
    const id = slugify(inner);
    return `<h${lvl} id="${id}"><a class="anchor" href="#${id}">¶</a>${inner}</h${lvl}>`;
  });

export const renderMd = (body: string): string => permalinks(checkboxes(md.render(wikify(body))));
