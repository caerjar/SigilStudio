// Top-level orchestration: given a loaded image and params, produce the SVG.

import type { RenderParams } from "./params";
import { ENGINES } from "./engines";

export interface RenderOutput {
  svg: string;
  stats: string; // short human-readable summary for the status line
}

/**
 * A decoded image reduced to a working size. Every engine samples the image down
 * to a small luminance field anyway (contour traces at 220px; halftone takes ~2
 * samples per cell; spiral and flow read the same reduced field), so nothing
 * downstream can use more than this — but a full-size bitmap
 * would be re-scaled by the browser on every render and pinned in memory the
 * whole session. A 4000x3000 upload is 46MB decoded; at 1600 it is 7MB, and the
 * output is identical.
 */
export interface Source {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  srcWidth: number; // the original upload's dimensions, for the status line
  srcHeight: number;
}

export const WORK_MAX = 1600;

/**
 * `flattenOn` composites the image onto a solid colour first. Required for
 * anything with transparency: `imageToField` reads only RGB and ignores alpha,
 * so a transparent-background PNG of handwriting arrives as luminance 0 —
 * indistinguishable from solid ink, and the whole sheet reads as one giant mark.
 */
export function prepareSource(
  img: HTMLImageElement,
  flattenOn?: string,
  max = WORK_MAX,
): Source {
  const srcWidth = img.naturalWidth || img.width;
  const srcHeight = img.naturalHeight || img.height;
  const scale = Math.min(1, max / Math.max(srcWidth, srcHeight));
  const width = Math.max(1, Math.round(srcWidth * scale));
  const height = Math.max(1, Math.round(srcHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get a 2D context");
  if (flattenOn) {
    ctx.fillStyle = flattenOn;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);

  return { canvas, width, height, srcWidth, srcHeight };
}

/** Long side of the drop-zone preview, in px. */
export const THUMB_MAX = 72;

/**
 * A small preview of an upload, as a data URL.
 *
 * A data URL rather than the object URL on purpose: App revokes that the moment
 * the image is decoded, and drops the full bitmap with it, so anything still
 * holding the `blob:` reference would show a broken image a second later. The
 * "never base64" rule is about carrying the whole upload as a string — at 72px
 * this is a couple of KB, and it is what lets the full-size copy be released.
 *
 * Composited on white for the same reason the handwriting sheet is: a
 * transparent PNG would otherwise preview as a solid black square.
 */
export function makeThumbnail(
  src: CanvasImageSource,
  srcW: number,
  srcH: number,
  max = THUMB_MAX,
): string {
  // min(1, …): never upscale a tiny upload into a blurry thumbnail
  const scale = Math.min(1, max / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get a 2D context");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", 0.8);
}

export function render(src: Source, p: RenderParams): RenderOutput {
  const t0 = performance.now();
  const r = ENGINES[p.mode].run(src.canvas, src.width, src.height, p);
  const ms = Math.round(performance.now() - t0);

  // Log performance for debugging
  if (ms > 1000) {
    console.warn(`Slow render detected: ${ms}ms for ${r.glyphCount} glyphs in mode ${p.mode}`);
  }

  // The mode-specific halves come from the engine; the glyph count and the timing
  // are the same in every mode. Empty parts drop out, so halftone (which has no
  // lead) reads "5,000 glyphs · 42ms" rather than leading with a stray separator.
  const stats = [
    r.lead,
    `${r.glyphCount.toLocaleString()} glyphs`,
    `${ms}ms`,
    r.budgetBound ? r.boundNote : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return { svg: r.svg, stats };
}

/** Load an object URL (or data URL) into an HTMLImageElement. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}
