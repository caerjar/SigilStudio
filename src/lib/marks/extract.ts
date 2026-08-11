// Uploaded sheet -> MarkSet. Runs ONCE per upload, never per render: it is far
// more expensive than a frame, and App's render effect re-runs on every param
// change.

import { imageToField } from "../render/imageField";
import { binarize, connectedComponents, otsuThreshold, readingOrder } from "./segment";
import { traceAll, type MarkSet } from "./trace";

/**
 * Field resolution for the handwriting sheet. Higher than the 220 the render
 * engines use, because a pen stroke is a few pixels wide and we are tracing its
 * shape rather than its tone.
 */
export const SHEET_LONG = 700;

export interface ExtractOptions {
  threshold?: number | null; // null / undefined = Otsu
  minAreaFrac?: number; // ink pixels, as a fraction of the sheet, below which a blob is speckle
  tolerance?: number; // simplification, in mark units
}

export interface ExtractResult {
  markSet: MarkSet;
  threshold: number;
  found: number; // blobs kept
  dropped: number; // blobs rejected as speckle
}

export function extractMarks(
  canvas: CanvasImageSource,
  width: number,
  height: number,
  opts: ExtractOptions = {},
): ExtractResult {
  // invert=false: imageToField returns luminance, and we treat DARK as ink.
  const field = imageToField(canvas, width, height, SHEET_LONG, false);

  const threshold = opts.threshold ?? otsuThreshold(field);
  const ink = binarize(field, threshold);

  const total = field.width * field.height;
  const minArea = Math.max(4, Math.round(total * (opts.minAreaFrac ?? 0.00004)));

  const all = connectedComponents(ink, field.width, field.height, 1);
  const kept = all.filter((c) => c.area >= minArea);
  const ordered = readingOrder(kept);

  return {
    markSet: traceAll(ordered, opts.tolerance ?? 0.8),
    threshold,
    found: ordered.length,
    dropped: all.length - kept.length,
  };
}
