// Turn segmented ink blobs into vector marks.
//
// Same pipeline the contour engine already runs on the source image (d3-contour
// -> simplify), just at a single threshold over a binary mask instead of tonal
// bands. So this needs no new dependency.
//
// Marks MUST end up as geometry, not as a reference to the uploaded file: the
// PNG export rasterises through SVG-as-image, which blocks external loads, so
// anything still pointing at a blob: URL renders in the preview and then
// silently vanishes from the exported PNG.

import { contours as d3contours } from "d3-contour";
import simplify from "simplify-js";
import type { Component } from "./segment";
import type { Pt } from "../noise";

/**
 * Marks are authored in a box this tall and scaled at the <use> site. It is 100
 * rather than 1 because svg.ts `subpath` rounds to one decimal — a 0..1 unit box
 * would collapse to a handful of distinct coordinates and the mark would turn
 * into a blocky mess.
 */
export const MARK_UNIT = 100;

export interface Mark {
  d: string; // path data, centred on (0,0), height ≈ MARK_UNIT * (h / refH)
  w: number;
  h: number;
  advance: number; // horizontal pitch this mark wants, in mark units
}

export interface MarkSet {
  marks: Mark[];
  unit: number; // = MARK_UNIT; scale a mark with size / unit
  meanAdvance: number; // in units of `unit` — the CHAR_ADVANCE analogue
}

export const EMPTY_MARKSET: MarkSet = { marks: [], unit: MARK_UNIT, meanAdvance: 0.5 };

/** One ink blob -> one path, centred on the origin so rotation pivots sanely. */
function traceComponent(c: Component, scale: number, tolerance: number): Mark | null {
  // Pad by one cell so blobs touching the bbox edge still close into a ring.
  const gw = c.w + 2;
  const gh = c.h + 2;
  const values = new Float64Array(gw * gh);
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      values[(y + 1) * gw + (x + 1)] = c.mask[y * c.w + x];
    }
  }

  const multi = d3contours().size([gw, gh]).thresholds([0.5])(Array.from(values));
  if (multi.length === 0) return null;

  // centre the mark on its own bbox
  const cx = (c.w / 2 + 1) * scale;
  const cy = (c.h / 2 + 1) * scale;

  const subpaths: string[] = [];
  for (const polygon of multi[0].coordinates) {
    // polygon[0] is the outer ring, polygon[1..] are holes. d3 winds them
    // oppositely, so a single path with fill-rule="nonzero" renders the holes.
    for (const ring of polygon) {
      let pts: Pt[] = ring.map(([x, y]) => ({ x: x * scale - cx, y: y * scale - cy }));
      if (pts.length < 4) continue;
      if (tolerance > 0) pts = simplify(pts, tolerance, true);
      if (pts.length < 3) continue;
      subpaths.push(ringPath(pts));
    }
  }
  if (subpaths.length === 0) return null;

  const w = c.w * scale;
  const h = c.h * scale;
  return { d: subpaths.join(""), w, h, advance: w };
}

/** Closed ring as path data. Two decimals — marks are small-coordinate shapes. */
function ringPath(points: Pt[]): string {
  const parts: string[] = [`M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`];
  for (let i = 1; i < points.length; i++) {
    parts.push(`L${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`);
  }
  parts.push("Z");
  return parts.join("");
}

/**
 * Vectorise every blob with ONE shared scale, so relative sizes survive: if you
 * wrote a tall 'l' and a short 'o', the 'l' stays taller. Normalising each mark
 * to fill the box independently would flatten them to the same height and
 * destroy the handwriting.
 *
 * The reference is the median height, so one outsized blob (a stray line, a
 * smudge) can't shrink the whole alphabet.
 */
export function traceAll(comps: Component[], tolerance = 0.8): MarkSet {
  if (comps.length === 0) return EMPTY_MARKSET;

  const heights = comps.map((c) => c.h).sort((a, b) => a - b);
  const refH = heights[heights.length >> 1] || 1;
  const scale = MARK_UNIT / refH;

  const marks: Mark[] = [];
  for (const c of comps) {
    const m = traceComponent(c, scale, tolerance);
    if (m) marks.push(m);
  }
  if (marks.length === 0) return EMPTY_MARKSET;

  // The CHAR_ADVANCE analogue: mean pitch as a fraction of the unit box. The
  // glyph-budget maths needs this, and a Georgia constant would be wrong here.
  const meanAdvance =
    marks.reduce((s, m) => s + m.advance, 0) / marks.length / MARK_UNIT;

  return { marks, unit: MARK_UNIT, meanAdvance: Math.max(0.05, meanAdvance) };
}
