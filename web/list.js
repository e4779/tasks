import { el } from "./dom.js";

// same order as next.ts: path only
const key = (n) => n.path;
const undone = (n) => n.status === "pending" || n.status === "in-progress" || n.status === null;

class TskList extends HTMLElement {
  update({ nodes }) {
    const rows = [...nodes]
      .sort((a, b) => Number(undone(b)) - Number(undone(a)) || (key(a) < key(b) ? -1 : 1))
      .map((n) => {
        const row = el(
          "tr",
          {},
          el("td", { class: `st ${n.status ?? "none"}` }, n.status ?? "none"),
          el("td", {}, n.title),
          el("td", { class: "path" }, n.path),
        );
        row.addEventListener("click", () => {
          location.hash = `#/doc?path=${encodeURIComponent(n.path)}`;
        });
        return row;
      });
    this.replaceChildren(
      el(
        "table",
        {},
        el(
          "thead",
          {},
          el("tr", {}, el("th", {}, "status"), el("th", {}, "title"), el("th", {}, "path")),
        ),
        el("tbody", {}, ...rows),
      ),
    );
  }
}
customElements.define("tsk-list", TskList);
