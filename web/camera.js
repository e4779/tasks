/**
 * Fit-planning for the graph camera: pure math, no DOM (unit-tested).
 *
 * zoomToFit gives a padded fit: the binding axis fills ~(size - 2*pad), but a
 * tall-narrow dag in a wide canvas leaves the other axis nearly empty. The
 * stretch factors widen the slack axis so the fitted graph covers target
 * fractions of BOTH canvas axes — stretching a slack axis never changes the
 * fit scale, so nothing clips.
 */

/** @typedef {Readonly<{x?: number, y?: number}>} PosNode */
/** @typedef {Readonly<{x0: number, x1: number, y0: number, y1: number}>} BBox */
/** @typedef {Readonly<{w: number, h: number}>} Dim */

/**
 * @param {readonly PosNode[]} nodes
 * @returns {BBox | null} bounds of the nodes with numeric coords, null if none
 */
export const bboxOf = (nodes) => {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const n of nodes) {
    if (typeof n.x !== "number" || typeof n.y !== "number") continue;
    x0 = Math.min(x0, n.x);
    x1 = Math.max(x1, n.x);
    y0 = Math.min(y0, n.y);
    y1 = Math.max(y1, n.y);
  }
  return x0 === Infinity ? null : { x0, x1, y0, y1 };
};

/**
 * @param {BBox} bbox node-centre bounds in engine coords
 * @param {Dim} dim canvas size in CSS px
 * @param {{pad?: number, coverX?: number, coverY?: number}} opts
 *   pad mirrors zoomToFit's padding; cover* targets sit ~2% above the
 *   acceptance floors (0.50/0.70) to absorb node-radius slack in getGraphBbox
 * @returns {{sx: number, sy: number}} stretch factors, ≥1, applied around the bbox centre
 */
export const fitStretch = (bbox, dim, { pad = 40, coverX = 0.54, coverY = 0.74 } = {}) => {
  const bw = bbox.x1 - bbox.x0;
  const bh = bbox.y1 - bbox.y0;
  // same clamp zoomToFit applies, so a degenerate canvas cannot produce a negative factor
  const k = Math.min(
    1e12,
    Math.max(
      1e-12,
      Math.min(
        bw > 0 ? (dim.w - 2 * pad) / bw : Infinity,
        bh > 0 ? (dim.h - 2 * pad) / bh : Infinity,
      ),
    ),
  );
  // shortcut: a zero-extent axis cannot be stretched to cover anything; single-row/column corpora stay unfixed
  const sx = bw > 0 && (k * bw) / dim.w < coverX ? (coverX * dim.w) / (k * bw) : 1;
  const sy = bh > 0 && (k * bh) / dim.h < coverY ? (coverY * dim.h) / (k * bh) : 1;
  return { sx, sy };
};
