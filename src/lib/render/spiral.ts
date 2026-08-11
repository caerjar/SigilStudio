// Spiral engine: the whole image as ONE unbroken line, wound from the centre,
// its ink swelling wherever the picture is dark. The classic single-line
// portrait — and the same choice the original transfinite sigil made, where the
// passage ran as one continuous stream through both circles and the line
// joining them.
//
// The line is all this file makes; the drawing along it is draw.ts, so a spiral
// gets your uploaded marks, tone, pressure and ribbons for free.

import { buildNoise, wobblePolyline, type Pt } from "../noise";
import { mulberry32 } from "../rng";
import type { RenderParams } from "../params";
import { blurField, imageToField } from "./imageField";
import { outputSize, polylineLength, svgClose, svgOpen } from "./svg";
import { drawAlong, makeLine, maxSizeFactor, primitive } from "./draw";
import { makeInk } from "./ink";

export interface SpiralResult {
  svg: string;
  turns: number;
  pitch: number;
  totalPathLen: number;
  glyphCount: number;
  budgetBound: boolean;
}

/** Arc-length between sampled vertices, px. Small enough to stay smooth. */
const STEP = 2.5;

/**
 * Glyph height as a fraction of the turn spacing, at its largest.
 *
 * On a spiral the pitch IS the line height — the turn above is the line above.
 * So the biggest a glyph can ever get (after jitter and tone have inflated it)
 * has to fit inside the pitch, or it laps into the neighbouring turn and the
 * picture turns to mud. Measured before this existed: pitch 22px, glyphs up to
 * 40.2px.
 */
const FILL = 0.85;

export function renderSpiral(
  img: CanvasImageSource,
  srcW: number,
  srcH: number,
  p: RenderParams,
): SpiralResult {
  const out = outputSize(srcW, srcH, p.canvasLong);

  const fieldLong = Math.min(220, p.canvasLong);
  let field = imageToField(img, srcW, srcH, fieldLong, p.invert);
  field = blurField(field, p.blur);

  const sx = out.width / field.width;
  const sy = out.height / field.height;

  const cx = out.width / 2;
  const cy = out.height / 2;
  // Half the diagonal, so the corners are reached. The parts that fall outside
  // the canvas are clipped by the viewBox.
  const maxR = Math.hypot(out.width, out.height) / 2;

  // Archimedean spiral r = b*theta: successive turns sit a constant `pitch`
  // apart, which is what makes it read as even hatching rather than a vortex.
  // `detail` is that pitch, in px.
  //
  // Pitch is the only real knob here, because it sets everything else at once:
  // the line's total length (~pi*maxR^2/pitch) AND the glyph size (pitch*FILL /
  // maxSizeFactor). So the glyph count follows from the pitch alone:
  //
  //   glyphs = totalLen / (size * advance) = pi*maxR^2*k / (pitch^2 * advance)
  //
  // which means the budget is kept by WIDENING THE TURNS, never by inflating
  // the type past its line height. Contour mode can afford to grow the type
  // because its lines don't run parallel to each other; a spiral's do.
  const { advance } = primitive(p);
  const sizePerPitch = FILL / maxSizeFactor(p);
  const budget = Math.max(500, p.glyphBudget);
  const minPitch = Math.sqrt((Math.PI * maxR * maxR) / (budget * sizePerPitch * advance));

  const wantPitch = Math.max(4, p.detail);
  const pitch = Math.max(wantPitch, minPitch);
  const budgetBound = minPitch > wantPitch;
  const baseSize = pitch * sizePerPitch;
  const b = pitch / (2 * Math.PI);

  const pts: Pt[] = [];
  let theta = 0;
  // ds = sqrt(r^2 + b^2) dtheta, so stepping by arc-length keeps the vertex
  // spacing even from the tight middle to the long outer turns.
  for (let guard = 0; guard < 400_000; guard++) {
    const r = b * theta;
    if (r > maxR) break;
    pts.push({ x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) });
    theta += STEP / Math.hypot(r, b);
  }

  const turns = theta / (2 * Math.PI);
  const noise = buildNoise(p.seed, p.wobbleScale, p.octaves);
  // open, not closed: it is one line with two ends, and wrapping the normals
  // would kink the start against the finish
  const wob = wobblePolyline(pts, noise, false);
  const totalLen = polylineLength(wob);
  const lines = pts.length >= 2 ? [makeLine(wob, totalLen, false)] : [];

  const rng = mulberry32(p.seed ^ 0x9e3779b9);
  const ink = makeInk(p, field, sx, sy);
  const drawn = drawAlong(lines, totalLen, p, rng, ink, baseSize);

  const svg = svgOpen(out, p.palette, p.fontFamily) + drawn.body + svgClose();
  return {
    svg,
    turns,
    pitch,
    totalPathLen: totalLen,
    glyphCount: drawn.count,
    budgetBound,
  };
}
