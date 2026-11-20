// The COMPLETE client surface after wave C: a theme toggle (persisted) and
// d3-zoom over the static server SVG — everything else is server-rendered.
// stored theme already applied pre-paint by the inline head script (src/render.ts)
const root = document.documentElement;
document.getElementById("theme")?.addEventListener("click", () => {
  root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
  localStorage.setItem("theme", root.dataset.theme);
});

// (re)bindable so the fragment swap can re-attach zoom to the fresh svg
const bindZoom = () => {
  const svg = document.querySelector("svg[data-zoom]");
  if (svg && globalThis.d3) {
    // LOD labels (tasks/lod-labels.md): transform.k is in viewBox units — scale
    // by the viewBox→viewport meet ratio so the band reads in on-screen scale.
    // One --lod write on the svg root per zoom event; css does the per-text
    // work. Band 0.45..0.65 tuned on the homelab fit view (~70-card corpus).
    const vb = svg.viewBox.baseVal;
    const meet = Math.min(svg.clientWidth / vb.width, svg.clientHeight / vb.height);
    const lod = (k) => Math.min(Math.max((k * meet - 0.45) / 0.2, 0), 1);
    svg.style.setProperty("--lod", lod(1)); // fit view: faded before any zoom
    // progressive enhancement: the graph is fully readable with JS off
    d3.select(svg).call(
      // wheel/pinch/dblclick zoom + drag pan; d3 stores the live transform on
      // the element itself (svg.__zoom) where the probe reads it
      d3.zoom().on("zoom", (e) => {
        svg.querySelector("g")?.setAttribute("transform", e.transform);
        svg.style.setProperty("--lod", lod(e.transform.k));
      }),
    );
  }
};
bindZoom();

// filter fragment swap (htmx-style, hand-rolled — no htmx dep, no new deps).
// Trust boundary: the fetch is a same-origin relative URL taken from the
// form's own action; the response is OUR server-rendered sanitized HTML that
// WE generated (src/render.ts escapes every task-derived string), so swapping
// it into our DOM stays inside the boundary. This covers only our own SSR
// output — it does not relax the /doc resolution/sanitization rules. The glue
// itself never interpolates task-derived strings into HTML: per-node reads go
// through DOM APIs (textContent for <title>), and the swapped nodes arrive as
// parsed DOM, not string-built markup.
const form = document.getElementById("filters");
if (form?.dataset.swap === "main") {
  const swapMain = async (url) => {
    const r = await fetch(url, { headers: { "x-fragment": "main" } });
    if (!r.ok) throw new Error(`swap: ${r.status}`);
    const doc = new DOMParser().parseFromString(await r.text(), "text/html");
    const fresh = doc.getElementById("main");
    const live = document.getElementById("main");
    if (!fresh || !live) throw new Error("swap: no #main in response");
    live.replaceWith(fresh);
    const t = doc.querySelector("title");
    if (t?.textContent) document.title = t.textContent;
    // chips sit OUTSIDE <main>: re-sync aria-pressed from the fetched form so
    // the pressed state can't go stale after a chip-driven swap (the q value
    // needs no sync — the fetch echoed exactly what the form holds)
    const chips = form.querySelectorAll("button[data-chip]");
    doc.querySelectorAll("#filters button[data-chip]").forEach((b, i) => {
      const chip = chips[i];
      if (chip) chip.setAttribute("aria-pressed", b.getAttribute("aria-pressed") ?? "false");
    });
    bindZoom(); // graph pages: attach zoom to the swapped-in svg
  };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    // submitter rides along: chip-button name/value land in the query string
    const url = `${form.action}?${new URLSearchParams(new FormData(form, e.submitter))}`;
    swapMain(url).then(
      () => history.pushState(null, "", url),
      // fetch failed / non-2xx → native GET; submit() bypasses the listener,
      // so there is no recursion and the page loads fully as wave C shipped
      () => form.submit(),
    );
  });
  // back/forward walks the filter history; no pushState here, and a dead
  // fetch reloads the restored URL natively instead of a dead UI
  addEventListener("popstate", () => swapMain(location.href).catch(() => location.reload()));
}
