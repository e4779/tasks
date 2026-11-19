// The COMPLETE client surface after wave C: a theme toggle (persisted) and
// d3-zoom over the static server SVG — everything else is server-rendered.
const root = document.documentElement;
if (localStorage.getItem("theme") === "light") root.dataset.theme = "light";
document.getElementById("theme")?.addEventListener("click", () => {
  root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
  localStorage.setItem("theme", root.dataset.theme);
});

const svg = document.querySelector("svg[data-zoom]");
if (svg && globalThis.d3)
  // progressive enhancement: the graph is fully readable with JS off
  d3.select(svg).call(
    // wheel/pinch/dblclick zoom + drag pan; d3 stores the live transform on
    // the element itself (svg.__zoom) where the probe reads it
    d3.zoom().on("zoom", (e) => svg.querySelector("g")?.setAttribute("transform", e.transform)),
  );
