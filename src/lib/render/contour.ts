// Contour engine: trace the image's tonal outlines, and draw along them — as
// tiny wobbling script (the transfinite sigil, generalized), or as your own
// uploaded marks. The drawing itself is draw.ts; this file only finds the lines.

import { contours as d3contours } from "d3-contour";
import simplify from "simplify-js";
import { buildNoise, wobblePolyline, type Pt } from "../noise";
import { mulberry32 } from "../rng";
import type { RenderParams } from "../params";
import { blurField, imageToField } from "./imageField";
import { outputSize, polylineLength, svgClose, svgOpen } from "./svg";
import { drawAlong, makeLine, type Line } from "./draw";
import { makeInk } from "./ink";

export interface ContourResult {
  svg: string;
  contourCount: number;
  totalPathLen: number;
  glyphCount: number;
  budgetBound: boolean;
}

export function renderContour(
  img: CanvasImageSource,
  srcW: number,
  srcH: number,
  p: RenderParams,
): ContourResult {
  const out = outputSize(srcW, srcH, p.canvasLong);

  // Field at a modest resolution; contour cost scales with grid size.
  const fieldLong = Math.min(220, p.canvasLong);
  let field = imageToField(img, srcW, srcH, fieldLong, p.invert);
  field = blurField(field, p.blur);

  // detail (3..14) -> that many evenly spaced threshold bands in 0..255
  const bands = Math.max(2, Math.round(p.detail));
  const thresholds: number[] = [];
  for (let i = 1; i <= bands; i++) thresholds.push((255 * i) / (bands + 1));

  const gen = d3contours().size([field.width, field.height]).thresholds(thresholds);
  const multi = gen(Array.from(field.lum));

  const sx = out.width / field.width;
  const sy = out.height / field.height;

  const noise = buildNoise(p.seed, p.wobbleScale, p.octaves);

  const lines: Line[] = [];
  let totalLen = 0;

  for (const contour of multi) {
    for (const polygon of contour.coordinates) {
      for (const ring of polygon) {
        let pts: Pt[] = ring.map(([x, y]) => ({ x: x * sx, y: y * sy }));
        if (pts.length < 4) continue;
        if (p.simplifyTolerance > 0) pts = simplify(pts, p.simplifyTolerance, true);
        if (polylineLength(pts) < p.minContourLen) continue;
        const wob = wobblePolyline(pts, noise, true);
        const len = polylineLength(wob);
        lines.push(makeLine(wob, len, true));
        totalLen += len;
      }
    }
  }

  const rng = mulberry32(p.seed ^ 0x9e3779b9);
  const ink = makeInk(p, field, sx, sy);
  const drawn = drawAlong(lines, totalLen, p, rng, ink);

  const svg = svgOpen(out, p.palette, p.fontFamily) + drawn.body + svgClose();
  return {
    svg,
    contourCount: lines.length,
    totalPathLen: totalLen,
    glyphCount: drawn.count,
    budgetBound: drawn.budgetBound,
  };
}
