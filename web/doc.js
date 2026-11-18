import { el } from "./dom.js";

// the API is the authority: unknown/missing path → inline not-found, never a crash
class TskDoc extends HTMLElement {
  async update({ path, back }) {
    this.replaceChildren(document.createTextNode("loading…"));
    const r = await fetch(`/api/doc?path=${encodeURIComponent(path ?? "")}`);
    const doc = r.ok ? await r.json() : null;
    this.replaceChildren(
      el("a", { href: back ?? "#/list", class: "back" }, "← back"),
      el("h2", {}, doc?.title ?? "not found"),
      doc
        ? el("pre", {}, doc.source)
        : el("p", { class: "path" }, "no document in the current corpus for this path"),
    );
  }
}
customElements.define("tsk-doc", TskDoc);
