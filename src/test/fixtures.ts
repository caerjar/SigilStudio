import { ENGINES } from "../lib/engines";
import type { Component } from "../lib/marks/segment";
import { DEFAULT_PARAMS, type RenderParams } from "../lib/params";
import { blank, makeFakeImage, setPixels, type Bitmap } from "./fakeCanvas";

/** Opaque white background, so nothing depends on the flatten step by accident. */
export function paper(w: number, h: number): Bitmap {
  const bmp = blank(w, h);
  bmp.data.fill(255);
  return bmp;
}

function put(bmp: Bitmap, x: number, y: number, rgba: [number, number, number, number]): void {
  if (x < 0 || x >= bmp.w || y < 0 || y >= bmp.h) return;
  const i = (y * bmp.w + x) * 4;
  bmp.data[i] = rgba[0];
  bmp.data[i + 1] = rgba[1];
  bmp.data[i + 2] = rgba[2];
  bmp.data[i + 3] = rgba[3];
}

export function fillRect(
  bmp: Bitmap,
  x0: number,
  y0: number,
  w: number,
  h: number,
  rgba: [number, number, number, number],
): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) put(bmp, x, y, rgba);
  }
}

/**
 * A photo-ish source: a light-to-dark gradient with a mid-grey disc on it, so
 * every engine has both smooth tone and a closed edge to find.
 */
export function photo(w = 240, h = 180): HTMLImageElement {
  const bmp = paper(w, h);
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.3;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const g = Math.round(255 * (1 - x / w));
      const inDisc = (x - cx) ** 2 + (y - cy) ** 2 < r * r;
      const v = inDisc ? 64 : g;
      put(bmp, x, y, [v, v, v, 255]);
    }
  }
  return makeFakeImage(bmp);
}

/**
 * A handwriting sheet with `count` separate strokes.
 *
 * `transparent: true` gives black ink on a fully transparent background — what a
 * PNG exported from a drawing app actually looks like, and the fixture that
 * makes the flatten-on-white invariant observable.
 *
 * Gaps are generous because `extractMarks` upscales to SHEET_LONG = 700 and
 * segmentation is 8-connected: nearest-neighbour upscaling can bridge marks that
 * were only a pixel or two apart.
 */
export function sheet(count = 4, transparent = false): HTMLImageElement {
  const w = 240;
  const h = 80;
  const bmp = transparent ? blank(w, h) : paper(w, h);
  const ink: [number, number, number, number] = [0, 0, 0, 255];
  for (let i = 0; i < count; i++) {
    // 14px marks with 26px of clear space between them
    fillRect(bmp, 20 + i * 40, 30, 14, 20, ink);
  }
  return makeFakeImage(bmp);
}

/** A single connected blob far larger than any recursive flood fill could take. */
export function bigBlob(side = 300, pad = 10): { ink: Uint8Array; w: number; h: number } {
  const w = side + pad * 2;
  const h = side + pad * 2;
  const ink = new Uint8Array(w * h);
  for (let y = pad; y < pad + side; y++) {
    for (let x = pad; x < pad + side; x++) ink[y * w + x] = 1;
  }
  return { ink, w, h };
}

/** A Component with a solid rectangular mask — enough for trace/readingOrder. */
export function box(x0: number, y0: number, w: number, h: number): Component {
  return {
    x0,
    y0,
    x1: x0 + w - 1,
    y1: y0 + h - 1,
    w,
    h,
    area: w * h,
    mask: new Uint8Array(w * h).fill(1),
  };
}

/**
 * Params with a fixed seed and real text, overridable per test.
 *
 * `detail` follows the mode, exactly as the app does when you switch engines —
 * DEFAULT_PARAMS carries contour's 7, and handing that to halftone means a
 * 7-cell grid that no glyph budget could ever bind.
 */
export function params(over: Partial<RenderParams> = {}): RenderParams {
  const mode = over.mode ?? DEFAULT_PARAMS.mode;
  return {
    ...DEFAULT_PARAMS,
    text: "the quick brown fox jumps over the lazy dog",
    seed: 1977,
    detail: ENGINES[mode].detail.def,
    ...over,
  };
}

export { makeFakeImage, setPixels, blank };
