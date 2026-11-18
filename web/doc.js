import { el } from "./dom.js";

const md = window.markdownit(); // html:false by default — raw html in source stays inert text

// shortcut: wikilinks inside code fences are rewritten too (same shortcut parse.ts carries); upgrade when cards grow fenced examples
const wikify = (s) => s.replace(/\[\[([^\]|]+)\]\]/g, "[$1](./$1.md)");

// http/https/relative only — any other scheme (javascript:, data:, mailto:, …) renders inert
export const safeHref = (h) => !/^[a-z][a-z0-9+.-]*:/i.test(h) || /^https?:/i.test(h);

// defense in depth: html:false already escapes raw html; this holds should the config ever loosen
const DROP = new Set(["script", "style", "iframe", "object", "embed"]);
const scrub = (root) => {
  for (const n of [...root.querySelectorAll("*")]) {
    if (DROP.has(n.tagName.toLowerCase())) n.remove();
    else {
      for (const a of [...n.attributes]) if (/^on/i.test(a.name)) n.removeAttribute(a.name);
      if (n.tagName === "A" && !safeHref(n.getAttribute("href") ?? ""))
        n.replaceWith(document.createTextNode(n.textContent));
    }
  }
};

// checkboxes render STATIC (viewer never mutates the corpus): CommonMark leaves "[ ]" as
// literal text in the li; swap the leading marker for a disabled input
const checkboxes = (root) => {
  for (const li of root.querySelectorAll("li")) {
    const t = li.firstChild;
    const m = t instanceof Text && /^\[([ xX])\] /.exec(t.data);
    if (m) {
      t.data = t.data.slice(m[0].length);
      li.prepend(
        el(
          "input",
          m[1] === " "
            ? { type: "checkbox", disabled: "" }
            : { type: "checkbox", disabled: "", checked: "" },
        ),
      );
    }
  }
};

// body arrives pre-split (server gray-matter) and minus its first h1 line — the same
// line the h2 above already shows as title; source stays reachable behind <details>
const render = (doc) => {
  const body = el("div", { class: "md" });
  body.innerHTML = md.render(wikify(doc.body ?? ""));
  scrub(body);
  checkboxes(body);
  return [body, el("details", {}, el("summary", {}, "raw source"), el("pre", {}, doc.source))];
};

// the API is the authority: unknown/missing path → inline not-found, never a crash
class TskDoc extends HTMLElement {
  async update({ path, back }) {
    this.replaceChildren(document.createTextNode("loading…"));
    const r = await fetch(`/api/doc?path=${encodeURIComponent(path ?? "")}`);
    const doc = r.ok ? await r.json() : null;
    this.replaceChildren(
      el("a", { href: back ?? "#/list", class: "back" }, "← back"),
      el("h2", {}, doc?.title ?? "not found"),
      ...(doc
        ? render(doc)
        : [el("p", { class: "path" }, "no document in the current corpus for this path")]),
    );
  }
}
customElements.define("tsk-doc", TskDoc);
