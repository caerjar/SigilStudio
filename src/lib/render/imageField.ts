// Shared first stage: decode an image into a downscaled luminance field.
// Both engines read this scalar field (contour extraction / per-cell tone).

export interface LumField {
  width: number; // field grid width
  height: number; // field grid height
  lum: Float64Array; // row-major luminance, 0..255 (higher = brighter)
}

// Rec. 601 luma.
function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Draw the image into an offscreen canvas at a target long-side resolution and
 * return its luminance grid. `targetLong` keeps the field small (fast contour /
 * halftone regardless of source size). `invert` flips light/dark.
 */
export function imageToField(
  img: CanvasImageSource,
  srcW: number,
  srcH: number,
  targetLong: number,
  invert: boolean,
): LumField {
  const scale = targetLong / Math.max(srcW, srcH);
  const width = Math.max(2, Math.round(srcW * scale));
  const height = Math.max(2, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.drawImage(img, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;

  const lum = new Float64Array(width * height);
  for (let i = 0; i < width * height; i++) {
    let v = luma(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    if (invert) v = 255 - v;
    lum[i] = v;
  }
  return { width, height, lum };
}

/** Separable box blur, `radius` px, in place-safe copy. Smooths speckle. */
export function blurField(field: LumField, radius: number): LumField {
  const r = Math.max(0, Math.round(radius));
  if (r === 0) return field;
  const { width, height, lum } = field;
  const tmp = new Float64Array(width * height);
  const out = new Float64Array(width * height);
  const win = 2 * r + 1;

  // horizontal
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) {
        const xx = Math.min(width - 1, Math.max(0, x + k));
        sum += lum[y * width + xx];
      }
      tmp[y * width + x] = sum / win;
    }
  }
  // vertical
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) {
        const yy = Math.min(height - 1, Math.max(0, y + k));
        sum += tmp[yy * width + x];
      }
      out[y * width + x] = sum / win;
    }
  }
  return { width, height, lum: out };
}

/** Bilinear sample of the field at fractional grid coords. */
export function sampleField(field: LumField, gx: number, gy: number): number {
  const { width, height, lum } = field;
  const x = Math.min(width - 1, Math.max(0, gx));
  const y = Math.min(height - 1, Math.max(0, gy));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const a = lum[y0 * width + x0];
  const b = lum[y0 * width + x1];
  const c = lum[y1 * width + x0];
  const d = lum[y1 * width + x1];
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}
