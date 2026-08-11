// A line with real, varying thickness.
//
// SVG cannot vary stroke-width along a single stroked path, so a brush ribbon
// has to be built as a filled polygon: offset the line by ±w(s)/2 along its
// normal and close the two sides into one shape.

import { arcLengths, normalAt, type Pt } from "../noise";

/** `w(s, i)` returns the full ribbon width at arc-length `s` / vertex `i`. */
export type WidthFn = (s: number, i: number) => number;

function poly(points: Pt[], close: boolean): string {
  const parts: string[] = [`M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`];
  for (let i = 1; i < points.length; i++) {
    parts.push(`L${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`);
  }
  if (close) parts.push("Z");
  return parts.join("");
}

/**
 * Ribbon path data for a polyline.
 *
 * Open lines close into a single loop (down one side, back the other). Closed
 * rings become an annulus — an outer ring and an inner ring — which must be one
 * path with fill-rule="evenodd" so the middle stays hollow rather than filling
 * in as a solid disc.
 */
export function ribbonPath(points: Pt[], width: WidthFn, closed: boolean): string {
  const n = points.length;
  if (n < 2) return "";
  const s = arcLengths(points);

  const left: Pt[] = new Array(n);
  const right: Pt[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const nrm = normalAt(points, i, closed);
    const h = Math.max(0, width(s[i], i)) / 2;
    left[i] = { x: points[i].x + nrm.x * h, y: points[i].y + nrm.y * h };
    right[i] = { x: points[i].x - nrm.x * h, y: points[i].y - nrm.y * h };
  }

  if (closed) return poly(left, true) + poly(right.reverse(), true);
  return poly(left.concat(right.reverse()), true);
}

/** `fill-rule` a ribbon needs for the given topology. */
export function ribbonFillRule(closed: boolean): string {
  return closed ? "evenodd" : "nonzero";
}
