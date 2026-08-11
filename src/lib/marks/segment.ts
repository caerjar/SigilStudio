// Segment a sheet of handwriting / drawn marks into individual marks.
//
// The user uploads a page with strokes on it. We binarize it into ink/paper,
// find each connected blob of ink, and hand the blobs to trace.ts to become
// vector paths. One blob = one mark = one thing you drew.

import type { LumField } from "../render/imageField";

export interface Component {
  x0: number; // bbox, inclusive, in field-grid coords
  y0: number;
  x1: number;
  y1: number;
  w: number;
  h: number;
  area: number; // ink pixels, not bbox area
  mask: Uint8Array; // w*h, row-major, 1 = ink. Only THIS component's pixels.
}

/**
 * Otsu's method: pick the ink/paper split that maximises between-class
 * variance. Handles a grey pencil scan or a black marker equally without the
 * user having to find the threshold by hand — they can still override it.
 */
export function otsuThreshold(field: LumField): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < field.lum.length; i++) {
    const v = field.lum[i];
    hist[Math.min(255, Math.max(0, Math.round(v)))]++;
  }
  const total = field.lum.length;
  if (total === 0) return 128;

  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestT = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      bestT = t;
    }
  }
  return bestT;
}

/**
 * 1 where the pixel is ink (`threshold` or darker), 0 where it is paper.
 *
 * Inclusive on purpose: `otsuThreshold` accumulates class B as hist[0..t], so
 * the level it returns is the last one *inside* the dark class. With an
 * exclusive test, a perfectly bimodal sheet — a 1-bit PNG, or anything scaled
 * without smoothing, where the only values are 0 and 255 — makes Otsu correctly
 * return 0 and then matches nothing at all, so the whole sheet extracts as zero
 * marks and the user is told it looks blank. On a normal scan this is a
 * one-level difference nobody can see.
 */
export function binarize(field: LumField, threshold: number): Uint8Array {
  const ink = new Uint8Array(field.width * field.height);
  for (let i = 0; i < ink.length; i++) ink[i] = field.lum[i] <= threshold ? 1 : 0;
  return ink;
}

/**
 * Label 8-connected blobs of ink and return one Component per blob bigger than
 * `minArea` (which drops scanner speckle and paper grain).
 *
 * The flood fill is iterative with an explicit stack on purpose — a recursive
 * one overflows on any blob of real size, and a long pen stroke is exactly that.
 */
export function connectedComponents(
  ink: Uint8Array,
  width: number,
  height: number,
  minArea: number,
): Component[] {
  const labels = new Int32Array(width * height).fill(-1);
  const boxes: { x0: number; y0: number; x1: number; y1: number; area: number }[] = [];
  const stack: number[] = [];

  for (let start = 0; start < ink.length; start++) {
    if (ink[start] === 0 || labels[start] !== -1) continue;

    const id = boxes.length;
    const box = {
      x0: start % width,
      y0: (start / width) | 0,
      x1: start % width,
      y1: (start / width) | 0,
      area: 0,
    };
    labels[start] = id;
    stack.push(start);

    while (stack.length > 0) {
      const i = stack.pop() as number;
      const x = i % width;
      const y = (i / width) | 0;
      box.area++;
      if (x < box.x0) box.x0 = x;
      if (x > box.x1) box.x1 = x;
      if (y < box.y0) box.y0 = y;
      if (y > box.y1) box.y1 = y;

      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const j = ny * width + nx;
          if (ink[j] === 1 && labels[j] === -1) {
            labels[j] = id;
            stack.push(j);
          }
        }
      }
    }
    boxes.push(box);
  }

  // Second pass builds each kept blob's own mask from the label grid. Doing it
  // this way rather than accumulating pixel lists during the fill keeps memory
  // proportional to the image, not to the sum of every blob's pixels.
  const out: Component[] = [];
  for (let id = 0; id < boxes.length; id++) {
    const b = boxes[id];
    if (b.area < minArea) continue;
    const w = b.x1 - b.x0 + 1;
    const h = b.y1 - b.y0 + 1;
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // only this component — neighbouring marks overlapping the bbox stay out
        if (labels[(b.y0 + y) * width + (b.x0 + x)] === id) mask[y * w + x] = 1;
      }
    }
    out.push({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, w, h, area: b.area, mask });
  }
  return out;
}

/**
 * Sort marks the way you'd read them: rows top to bottom, left to right within
 * each row. Load-bearing for "mapped" mode, where mark #1 must be the first
 * thing you wrote — flood-fill order is raster order, which interleaves marks
 * that share scanlines and would scramble an alphabet.
 *
 * Rows are grouped by vertical overlap rather than by centre distance, so a
 * tall letter and a short one on the same line still land in the same row.
 */
export function readingOrder(comps: Component[]): Component[] {
  if (comps.length === 0) return [];
  const sorted = [...comps].sort((a, b) => a.y0 - b.y0);

  const rows: Component[][] = [];
  let row: Component[] = [sorted[0]];
  let top = sorted[0].y0;
  let bottom = sorted[0].y1;

  for (let i = 1; i < sorted.length; i++) {
    const c = sorted[i];
    const overlap = Math.min(bottom, c.y1) - Math.max(top, c.y0);
    // same row if it shares more than a third of its height with the band
    if (overlap > c.h * 0.33) {
      row.push(c);
      top = Math.min(top, c.y0);
      bottom = Math.max(bottom, c.y1);
    } else {
      rows.push(row);
      row = [c];
      top = c.y0;
      bottom = c.y1;
    }
  }
  rows.push(row);

  return rows.flatMap((r) => r.sort((a, b) => a.x0 - b.x0));
}
