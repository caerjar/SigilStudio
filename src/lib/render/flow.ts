// Flow-field engine: strokes that follow the form.
//
// Contour mode draws the image's level sets as closed rings. This draws the
// same field as open streamlines, hatched at an even spacing — the way an
// engraver lays lines across a face so the lines themselves describe the shape.
//
// The field is the image's gradient, rotated 90°, so strokes run ALONG level
// sets (around a form) rather than straight down its steepest slope.
//
// Two things make this work rather than look like spaghetti:
//
//  - It is a LINE field, not a vector field: at any point the stroke may run
//    either way along the same axis, and the Sobel sign is arbitrary. Each step
//    must be flipped to agree with the previous one or the streamline doubles
//    back on itself.
//  - Streamlines must be kept apart. Seeded naively they bunch into dark clumps
//    and leave holes. An occupancy grid rejects any step that comes too near an
//    existing line (Jobard & Lefebvre's even-spacing idea, simplified).

import { buildNoise, wobblePolyline, type Pt } from "../noise";
import { mulberry32, uniform } from "../rng";
import type { RenderParams } from "../params";
import { blurField, imageToField, type LumField } from "./imageField";
import { outputSize, polylineLength, svgClose, svgOpen } from "./svg";
import { drawAlong, makeLine, maxSizeFactor, primitive, type Line } from "./draw";
import { makeInk } from "./ink";

export interface FlowResult {
  svg: string;
  lineCount: number;
  spacing: number;
  totalPathLen: number;
  glyphCount: number;
  budgetBound: boolean;
}

/** Integration step, px. */
const STEP = 3;
/** Glyph height as a fraction of the hatch spacing — see spiral.ts's FILL. */
const FILL = 0.85;
/** Give up on a streamline after this many steps. */
const MAX_STEPS = 400;
/** Discard streamlines shorter than this many spacings — they read as litter. */
const MIN_LEN_SPACINGS = 2.5;

interface Grad {
  gx: Float64Array;
  gy: Float64Array;
  width: number;
  height: number;
}

/** Sobel gradient of the luminance field. */
function sobel(field: LumField): Grad {
  const { width, height, lum } = field;
  const gx = new Float64Array(width * height);
  const gy = new Float64Array(width * height);
  const at = (x: number, y: number) =>
    lum[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
      const l = at(x - 1, y), r = at(x + 1, y);
      const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);
      gx[y * width + x] = tr + 2 * r + br - (tl + 2 * l + bl);
      gy[y * width + x] = bl + 2 * b + br - (tl + 2 * t + tr);
    }
  }
  return { gx, gy, width, height };
}

function sampleGrad(g: Grad, x: number, y: number): { x: number; y: number } {
  const cx = Math.min(g.width - 1, Math.max(0, x));
  const cy = Math.min(g.height - 1, Math.max(0, y));
  const i = Math.round(cy) * g.width + Math.round(cx);
  return { x: g.gx[i], y: g.gy[i] };
}

export function renderFlow(
  img: CanvasImageSource,
  srcW: number,
  srcH: number,
  p: RenderParams,
): FlowResult {
  const out = outputSize(srcW, srcH, p.canvasLong);

  const fieldLong = Math.min(220, p.canvasLong);
  let field = imageToField(img, srcW, srcH, fieldLong, p.invert);
  // Blur hard before differentiating: a gradient amplifies noise, and speckle
  // in the field becomes streamlines thrashing about at pixel scale.
  field = blurField(field, Math.max(1, p.blur));
  const grad = sobel(field);

  const sx = out.width / field.width;
  const sy = out.height / field.height;

  // Like the spiral's pitch, the hatch spacing sets both how much line there is
  // (~area/spacing) and how tall a glyph may be, so the budget is kept by
  // opening the hatch out rather than by inflating the type past its own line.
  const { advance } = primitive(p);
  const sizePerSpacing = FILL / maxSizeFactor(p);
  const budget = Math.max(500, p.glyphBudget);
  const minSpacing = Math.sqrt(
    (out.width * out.height) / (budget * sizePerSpacing * advance),
  );
  const wantSpacing = Math.max(3, p.detail);
  const spacing = Math.max(wantSpacing, minSpacing);
  const budgetBound = minSpacing > wantSpacing;
  const baseSize = spacing * sizePerSpacing;

  // Occupancy grid holding the points already laid down, so a new streamline
  // can be stopped before it crowds an existing one.
  //
  // The cell MUST be at least the rejection distance. We only search the 3x3
  // neighbourhood, which reaches one cell in each direction — so with a smaller
  // cell, a point further away than one cell but nearer than minDist sits
  // outside the search and is never seen. The spacing then silently stops being
  // enforced and the lines pile up on each other.
  const minDist = spacing * 0.8;
  const cell = minDist;
  const gw = Math.max(1, Math.ceil(out.width / cell) + 1);
  const gh = Math.max(1, Math.ceil(out.height / cell) + 1);
  const occupied: Pt[][] = Array.from({ length: gw * gh }, () => []);
  const minDist2 = minDist * minDist;

  const tooClose = (x: number, y: number): boolean => {
    const cxi = Math.floor(x / cell);
    const cyi = Math.floor(y / cell);
    for (let j = cyi - 1; j <= cyi + 1; j++) {
      if (j < 0 || j >= gh) continue;
      for (let i = cxi - 1; i <= cxi + 1; i++) {
        if (i < 0 || i >= gw) continue;
        for (const q of occupied[j * gw + i]) {
          const dx = q.x - x;
          const dy = q.y - y;
          if (dx * dx + dy * dy < minDist2) return true;
        }
      }
    }
    return false;
  };
  const occupy = (x: number, y: number) => {
    const i = Math.floor(x / cell);
    const j = Math.floor(y / cell);
    if (i < 0 || i >= gw || j < 0 || j >= gh) return;
    occupied[j * gw + i].push({ x, y });
  };

  /** Unit stroke direction: the gradient turned 90°, flipped to agree with `prev`. */
  const dirAt = (x: number, y: number, prev: Pt | null): Pt | null => {
    const g = sampleGrad(grad, x / sx, y / sy);
    let vx = -g.y;
    let vy = g.x;
    const m = Math.hypot(vx, vy);
    // Flat ground has no gradient and therefore no direction to follow. Rather
    // than invent one, stop — that is what leaves paper as paper.
    if (m < 1e-3) return null;
    vx /= m;
    vy /= m;
    // A line field has no sign: keep it pointing the way we were already going.
    if (prev && vx * prev.x + vy * prev.y < 0) {
      vx = -vx;
      vy = -vy;
    }
    return { x: vx, y: vy };
  };

  /**
   * Walk from `seed` until we leave the canvas, crowd another line, or run out
   * of gradient. `sign` only chooses which way to set off; after the first step
   * the direction carries itself forward via `prev`.
   *
   * It must NOT also multiply each step, which is the trap here: `prev` already
   * encodes which way we are travelling, so aligning to it AND flipping by
   * `sign` makes every step undo the last, and the backward half of every line
   * oscillates on the spot instead of going anywhere. It still passes a length
   * check — a zigzag is long — so it fails as hundreds of dense 18px stubs
   * rather than as an obvious error.
   */
  const trace = (seed: Pt, sign: number): Pt[] => {
    const pts: Pt[] = [];
    let pos = { ...seed };
    let prev: Pt | null = null;
    for (let n = 0; n < MAX_STEPS; n++) {
      let d1 = dirAt(pos.x, pos.y, prev);
      if (!d1) break;
      if (n === 0 && sign < 0) d1 = { x: -d1.x, y: -d1.y };
      // RK2 (midpoint): a plain Euler step drifts off curved flow badly.
      const mid = { x: pos.x + d1.x * STEP * 0.5, y: pos.y + d1.y * STEP * 0.5 };
      const d2 = dirAt(mid.x, mid.y, d1) ?? d1;
      const next = { x: pos.x + d2.x * STEP, y: pos.y + d2.y * STEP };
      if (next.x < 0 || next.y < 0 || next.x >= out.width || next.y >= out.height) break;
      if (tooClose(next.x, next.y)) break;
      pts.push(next);
      prev = d2;
      pos = next;
    }
    return pts;
  };

  const rng = mulberry32(p.seed ^ 0x2545f491);
  const lines: Line[] = [];
  let totalLen = 0;
  const minLen = spacing * MIN_LEN_SPACINGS;

  // Seed on a jittered grid: a regular one makes the hatch visibly gridded.
  for (let sy0 = spacing / 2; sy0 < out.height; sy0 += spacing) {
    for (let sx0 = spacing / 2; sx0 < out.width; sx0 += spacing) {
      const seed = {
        x: sx0 + uniform(rng, -spacing * 0.3, spacing * 0.3),
        y: sy0 + uniform(rng, -spacing * 0.3, spacing * 0.3),
      };
      if (seed.x < 0 || seed.y < 0 || seed.x >= out.width || seed.y >= out.height) continue;
      if (tooClose(seed.x, seed.y)) continue;

      const fwd = trace(seed, 1);
      const back = trace(seed, -1);
      const pts = back.reverse().concat([seed], fwd);
      if (pts.length < 3) continue;
      const len = polylineLength(pts);
      if (len < minLen) continue;

      for (const q of pts) occupy(q.x, q.y);
      const noise = buildNoise(p.seed + lines.length, p.wobbleScale, p.octaves);
      const wob = wobblePolyline(pts, noise, false);
      const wlen = polylineLength(wob);
      lines.push(makeLine(wob, wlen, false));
      totalLen += wlen;
    }
  }

  const ink = makeInk(p, field, sx, sy);
  const drawn = drawAlong(lines, totalLen, p, mulberry32(p.seed ^ 0x9e3779b9), ink, baseSize);

  const svg = svgOpen(out, p.palette, p.fontFamily) + drawn.body + svgClose();
  return {
    svg,
    lineCount: lines.length,
    spacing,
    totalPathLen: totalLen,
    glyphCount: drawn.count,
    budgetBound,
  };
}
