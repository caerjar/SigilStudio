// Seeded, reproducible PRNG (mulberry32). Replaces Python's random module so
// the same seed reproduces the same idiosyncratic squiggle every render.

export type Rng = () => number; // returns float in [0, 1)

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform draw in [lo, hi). */
export function uniform(rng: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * rng();
}

/**
 * Skewed triangular draw in roughly [-1, 1], mean ~0 — the same shape the
 * Python generator used: (r + r + r) / 1.5 - 1. Faintly biased so the wander
 * isn't tidily symmetric about the ideal path.
 */
export function triangular(rng: Rng): number {
  return (rng() + rng() + rng()) / 1.5 - 1.0;
}
