import { el } from "./dom.js";

// receives the already-computed nextUp view: pending/in-progress, unblocked, sorted
class TskNext extends HTMLElement {
  update({ nodes }) {
    this.replaceChildren(
      ...nodes.map((n) =>
        el(
          "div",
          { class: "next-item" },
          el("strong", {}, n.title),
          el("span", { class: "path" }, n.path),
        ),
      ),
    );
  }
}
customElements.define("tsk-next", TskNext);
