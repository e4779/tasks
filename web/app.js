import { el } from "./dom.js";
import "./graph.js";
import "./list.js";
import "./next.js";
import "./doc.js";

const CHIPS = ["pending", "in-progress", "done", "cancelled", "blocked"];
const TABS = { "#/list": "tsk-list", "#/next": "tsk-next", "#/graph": "tsk-graph" };

class TskApp extends HTMLElement {
  connectedCallback() {
    // static structure only: template literals never carry task-derived data
    this.innerHTML = `
      <nav>
        <a href="#/list">list</a><a href="#/next">next</a><a href="#/graph">graph</a>
      </nav>
      <form id="filters">
        <input id="q" type="search" placeholder="search title or path" autocomplete="off">
        <div id="chips"></div>
      </form>
      <main></main>`;
    this.state = {
      snap: null,
      q: "",
      chips: Object.fromEntries(CHIPS.map((c) => [c, true])),
      lastTab: "#/list",
    };

    const chips = this.querySelector("#chips");
    for (const c of CHIPS) {
      const b = el("button", { type: "button", "data-chip": c, "aria-pressed": "true" }, c);
      b.addEventListener("click", () => {
        this.state.chips[c] = !this.state.chips[c];
        b.setAttribute("aria-pressed", String(this.state.chips[c]));
        this.render();
      });
      chips.append(b);
    }
    this.querySelector("#q").addEventListener("input", (e) => {
      this.state.q = e.target.value;
      this.render();
    });
    window.addEventListener("hashchange", () => this.render());

    fetch("/api/snapshot")
      .then((r) => r.json())
      .then((snap) => {
        this.state.snap = snap;
        this.render();
      })
      .catch((e) => this.querySelector("main").replaceChildren(document.createTextNode(String(e))));
  }

  render() {
    const main = this.querySelector("main");
    const { snap, q, chips } = this.state;
    if (!snap) {
      main.replaceChildren(document.createTextNode("loading…"));
      return;
    }
    const hash = location.hash || "#/list";
    const [route, query] = hash.split("?");
    for (const a of this.querySelectorAll("nav a"))
      a.classList.toggle("active", a.getAttribute("href") === route);

    if (route === "#/doc") {
      const tab = document.createElement("tsk-doc");
      tab.update({ path: new URLSearchParams(query).get("path"), back: this.state.lastTab });
      main.replaceChildren(tab);
      return;
    }
    this.state.lastTab = route;

    const ql = q.toLowerCase();
    const match = (n) => n.title.toLowerCase().includes(ql) || n.path.toLowerCase().includes(ql);
    // status chips apply to real statuses; ghosts and statusless cards stay, blocked chip gates the flag
    const visible = (n) =>
      match(n) && (n.status === null || chips[n.status] !== false) && (!n.blocked || chips.blocked);
    const isNext = (n) =>
      !n.ghost && (n.status === "pending" || n.status === "in-progress") && !n.blocked;

    const views = {
      "#/list": () => ({ nodes: snap.nodes.filter((n) => visible(n) && !n.ghost) }),
      "#/next": () => ({
        nodes: snap.nodes
          .filter((n) => isNext(n) && match(n))
          .sort((a, b) => (a.path < b.path ? -1 : 1)), // path order, same as next.ts
      }),
      "#/graph": () => {
        const nodes = snap.nodes.filter(visible);
        const seen = new Set(nodes.map((n) => n.path));
        return { nodes, edges: snap.edges.filter((e) => seen.has(e.from) && seen.has(e.to)) };
      },
    };
    const view = (views[route] ?? views["#/list"])();
    const tab = document.createElement(TABS[route] ?? "tsk-list");
    tab.update(view);
    main.replaceChildren(tab);
  }
}
customElements.define("tsk-app", TskApp);
