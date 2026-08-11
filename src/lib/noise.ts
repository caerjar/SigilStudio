// Layered value-noise (fractal Brownian motion) along arc-length — ported from
// build_transfinite_sigil.py. NOT a sine: each octave is a random meander at a
// different wavelength; summed they give lazy irregular bends plus fine
// idiosyncratic jitter that never repeats. Applied along a path's local normal.

import { mulberry32, triangular, type Rng } from "./rng";

export interface Octave {
  wavelength: number; // px per lattice cell
  amplitude: number; // px of normal displacement
}

// Coarse -> fine. Same defaults the .svg shipped with.
export const DEFAULT_OCTAVES: Octave[] = [
  { wavelength: 140.0, amplitude: 5.0 }, // big lazy bends
  { wavelength: 62.0, amplitude: 4.0 }, // broad irregular sway
  { wavelength: 30.0, amplitude: 3.8 }, // main busyness
  { wavelength: 16.0, amplitude: 2.8 }, // busy nervous hand
  { wavelength: 9.5, amplitude: 1.8 }, // sharp wiggle
  { wavelength: 5.5, amplitude: 0.95 }, // fine jitter
  { wavelength: 3.2, amplitude: 0.45 }, // micro-tremor / kinks
];

const MAX_ARC = 8000.0; // upper bound on path length for lattice sizing

function smoothstep(t: number): number {
  return t * t * (3.0 - 2.0 * t);
}

export type NoiseFn = (s: number) => number;

/**
 * Build a value-noise function of arc-length. `scale` multiplies every octave
 * amplitude (the single "wobble amount" knob); `octaves` overrides the bands.
 */
export function buildNoise(
  seed: number,
  scale = 1.0,
  octaves: Octave[] = DEFAULT_OCTAVES,
): NoiseFn {
  const rng: Rng = mulberry32(seed);
  const layers = octaves.map(({ wavelength, amplitude }) => {
    const n = Math.floor(MAX_ARC / wavelength) + 3;
    const vals = new Array<number>(n);
    for (let i = 0; i < n; i++) vals[i] = triangular(rng);
    return { wavelength, amplitude: amplitude * scale, vals };
  });

  return (s: number): number => {
    let total = 0.0;
    for (const { wavelength, amplitude, vals } of layers) {
      const u = s / wavelength;
      let i = Math.floor(u);
      const frac = u - i;
      // clamp defensively so a path longer than MAX_ARC never indexes past end
      if (i < 0) i = 0;
      if (i >= vals.length - 1) i = vals.length - 2;
      const a = vals[i];
      const b = vals[i + 1];
      total += amplitude * (a + (b - a) * smoothstep(frac));
    }
    return total;
  };
}

export interface Pt {
  x: number;
  y: number;
}

/** Unit tangent at vertex `i`, averaged from its neighbours. */
export function tangentAt(points: Pt[], i: number, closed: boolean): Pt {
  const n = points.length;
  const prev = points[i === 0 ? (closed ? n - 2 : 0) : i - 1];
  const next = points[i === n - 1 ? (closed ? 1 : n - 1) : i + 1];
  const tx = next.x - prev.x;
  const ty = next.y - prev.y;
  const len = Math.hypot(tx, ty) || 1;
  return { x: tx / len, y: ty / len };
}

/** Outward unit normal at vertex `i` — the tangent rotated -90°. */
export function normalAt(points: Pt[], i: number, closed: boolean): Pt {
  const t = tangentAt(points, i, closed);
  return { x: t.y, y: -t.x };
}

/** Arc-length at each vertex. */
export function arcLengths(points: Pt[]): Float64Array {
  const s = new Float64Array(points.length);
  for (let i = 1; i < points.length; i++) {
    s[i] = s[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return s;
}

/**
 * Displace a polyline along its local normal by noise(arc-length). Arc-length
 * accumulates continuously so the noise phase is seamless along the whole path.
 * `closed` wraps the normal at the ends (for rings).
 */
export function wobblePolyline(
  points: Pt[],
  noise: NoiseFn,
  closed: boolean,
): Pt[] {
  const n = points.length;
  if (n < 2) return points.slice();

  const s = arcLengths(points);
  const out: Pt[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const nrm = normalAt(points, i, closed);
    const d = noise(s[i]);
    out[i] = { x: points[i].x + nrm.x * d, y: points[i].y + nrm.y * d };
  }
  return out;
}
