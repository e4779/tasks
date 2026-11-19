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

export const renderMd = (body: string): string => checkboxes(md.render(wikify(body)));
