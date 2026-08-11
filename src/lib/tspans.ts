// Per-letter idiosyncrasy — ported from build_transfinite_sigil.py build_tspans.
// Every character becomes its own <tspan> with slightly different size, weight
// (faked via an ink-coloured stroke over the fill) and ink density than the one
// before it: a hand-set, uneven, neurodivergent hand rather than uniform type.

import { uniform, type Rng } from "./rng";

export interface JitterRanges {
  sizeMin: number; // multiplier on base font-size
  sizeMax: number;
  // Perceived boldness, as a FRACTION of the render's strokeWidth — not px.
  // It used to be absolute px, which meant the same number produced wildly
  // different boldness in each engine (the em is ~3px in contour, ~cell-sized
  // in halftone) and could never reach "thick". Now strokeWidth sets the ink
  // weight and these only say how much it varies letter to letter.
  weightMin: number;
  weightMax: number;
  opacityMin: number; // fill-opacity (ink darkness)
  opacityMax: number;
}

export const DEFAULT_JITTER: JitterRanges = {
  sizeMin: 0.78,
  sizeMax: 1.22,
  weightMin: 0.0,
  weightMax: 1.0,
  opacityMin: 0.7,
  opacityMax: 1.0,
};

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Wrap every char of `text` in a jittered <tspan>. Size jitters symmetrically
 * (mean ~1.0) so total advance stays ~unchanged; weight and opacity vary
 * independently. Returns an SVG string.
 */
export function buildTspans(
  text: string,
  baseSize: number,
  rng: Rng,
  j: JitterRanges = DEFAULT_JITTER,
  strokeWidth = 0.15,
  /** Per-glyph ink multipliers — tone and pen pressure at glyph `i`. */
  inkAt?: (i: number) => { weight: number; size: number },
): string {
  // This runs once per glyph and there can be tens of thousands, so each tspan
  // is kept as short as it can be: coarse rounding (sub-0.01px is invisible at
  // this scale) and attributes omitted when they are no-ops.
  const parts: string[] = [];
  let i = 0;
  for (const ch of text) {
    const mod = inkAt ? inkAt(i) : null;
    const size = baseSize * uniform(rng, j.sizeMin, j.sizeMax) * (mod ? mod.size : 1);
    const weight = strokeWidth * uniform(rng, j.weightMin, j.weightMax) * (mod ? mod.weight : 1);
    const density = uniform(rng, j.opacityMin, j.opacityMax);
    let attrs = ` font-size="${size.toFixed(2)}"`;
    if (weight >= 0.005) attrs += ` stroke-width="${weight.toFixed(2)}"`;
    if (density <= 0.995) attrs += ` fill-opacity="${density.toFixed(2)}"`;
    parts.push(`<tspan${attrs}>${xmlEscape(ch)}</tspan>`);
    i++;
  }
  return parts.join("");
}
