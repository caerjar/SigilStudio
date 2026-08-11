// How heavy the ink is at a given place on the page.
//
// Two things modulate it:
//
// - TONE. The contour engine puts outlines in the right places but drew every
//   mark identically, so the result read as a flat map rather than a picture.
//   Sampling the image's own luminance where each mark lands gives the drawing
//   its light and shade back.
// - PRESSURE. A real nib swells and tapers as the hand moves. That is noise
//   along arc-length, not per-mark randomness — neighbouring marks must vary
//   *together* or it reads as jitter instead of a stroke.

import { buildNoise, type NoiseFn, type Octave, type Pt } from "../noise";
import type { RenderParams } from "../params";
import { sampleField, type LumField } from "./imageField";

/** Short wavelengths only: pressure varies within a stroke, not across the page. */
export const PRESSURE_OCTAVES: Octave[] = [
  { wavelength: 90, amplitude: 0.5 },
  { wavelength: 31, amplitude: 0.3 },
  { wavelength: 11, amplitude: 0.15 },
];

export interface InkMod {
  weight: number; // multiplier on strokeWidth
  size: number; // multiplier on the primitive's scale
}

export const NEUTRAL: InkMod = { weight: 1, size: 1 };

export interface Ink {
  /** Ink at output-space point (x, y), at arc-length s along its path. */
  at(x: number, y: number, s: number): InkMod;
  /** Darkness 0 (paper) .. 1 (ink) at an output-space point. */
  darknessAt(x: number, y: number): number;
  /** Ribbon half-width multiplier at arc-length s — pressure only. */
  pressureAt(s: number): number;
  /** False when every knob is off, so callers can skip per-mark attributes. */
  active: boolean;
}

/**
 * `sx`/`sy` convert output space back to field-grid coords — the field is a
 * small downscale of the image, and sampleField wants grid coordinates.
 */
export function makeInk(
  p: RenderParams,
  field: LumField,
  sx: number,
  sy: number,
): Ink {
  const press: NoiseFn = buildNoise(p.seed ^ 0x27d4eb2f, 1, PRESSURE_OCTAVES);

  const darknessAt = (x: number, y: number) => 1 - sampleField(field, x / sx, y / sy) / 255;

  return {
    darknessAt,
    pressureAt: (s: number) => 1 + p.pressure * press(s),
    active: p.toneToWeight > 0 || p.toneToSize > 0 || p.pressure > 0,
    at(x, y, s) {
      // -1 on white, +1 on black
      const t = darknessAt(x, y) * 2 - 1;
      const pw = 1 + p.pressure * press(s);
      return {
        weight: Math.max(0, (1 + p.toneToWeight * t) * pw),
        size: Math.max(0.05, 1 + p.toneToSize * t),
      };
    },
  };
}

/**
 * Look a point up by arc-length along a polyline.
 *
 * Needed because <textPath> places glyphs for us and never tells us where they
 * landed — so to sample tone under a glyph we reconstruct its position from how
 * far along the stream it is. Approximate (it assumes the mean advance), but the
 * tone field is smooth and heavily blurred, so a fraction of a glyph's error
 * changes nothing visible.
 */
export function makeArcLookup(points: Pt[]): (s: number) => Pt {
  const n = points.length;
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    cum[i] = cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  const total = cum[n - 1] || 1;

  return (s: number): Pt => {
    if (n === 0) return { x: 0, y: 0 };
    if (n === 1) return points[0];
    let t = s % total;
    if (t < 0) t += total;
    // binary search for the segment containing t
    let lo = 0;
    let hi = n - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= t) lo = mid;
      else hi = mid;
    }
    const segLen = cum[lo + 1] - cum[lo] || 1;
    const f = (t - cum[lo]) / segLen;
    return {
      x: points[lo].x + (points[lo + 1].x - points[lo].x) * f,
      y: points[lo].y + (points[lo + 1].y - points[lo].y) * f,
    };
  };
}
