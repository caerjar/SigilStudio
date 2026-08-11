/**
 * A software canvas, just big enough for the render pipeline.
 *
 * jsdom's `getContext` returns null without the native `canvas` package, and
 * both `imageField.ts` and `studio.ts` throw on null — so nothing downstream is
 * testable without a stand-in. This one keeps a real RGBA buffer and composites
 * for real, rather than answering `getImageData` procedurally.
 *
 * That matters for one invariant in particular. "Transparent uploads must be
 * flattened onto white" is only observable as an interaction between `fillRect`,
 * `drawImage`'s source-over blend and `getImageData`. A stub whose pixels ignore
 * what was drawn reduces that to "did prepareSource call fillRect", which still
 * passes if the fill happens *after* the draw — i.e. it passes with the bug
 * fully reintroduced. Ninety lines of blending buys a real assertion.
 */

export interface Bitmap {
  w: number;
  h: number;
  /** RGBA, non-premultiplied, row-major. */
  data: Uint8ClampedArray;
}

/** Pixels for anything that can be a drawImage source: fake images and canvases. */
const buffers = new WeakMap<object, Bitmap>();

export function blank(w: number, h: number): Bitmap {
  return { w, h, data: new Uint8ClampedArray(w * h * 4) };
}

export function setPixels(src: object, bmp: Bitmap): void {
  buffers.set(src, bmp);
}

export function getPixels(src: object): Bitmap | undefined {
  return buffers.get(src);
}

function parseHex(colour: string): [number, number, number] {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour.trim());
  if (!m) throw new Error(`fake canvas: unsupported fillStyle ${JSON.stringify(colour)}`);
  const hex =
    m[1].length === 3
      ? m[1]
          .split("")
          .map((c) => c + c)
          .join("")
      : m[1];
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

class FakeCtx2D {
  fillStyle = "#000000";
  imageSmoothingEnabled = true;
  imageSmoothingQuality = "low";

  constructor(private readonly canvas: HTMLCanvasElement) {}

  /**
   * Re-checked on every operation: in a real browser assigning `canvas.width`
   * reallocates the bitmap AND clears it to transparent black. Matching that
   * means the fake can never hand back a stale-sized buffer.
   */
  private buf(): Bitmap {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const prev = buffers.get(this.canvas);
    if (prev && prev.w === w && prev.h === h) return prev;
    const next = blank(w, h);
    buffers.set(this.canvas, next);
    return next;
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    const buf = this.buf();
    const [r, g, b] = parseHex(this.fillStyle);
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(buf.w, Math.floor(x + w));
    const y1 = Math.min(buf.h, Math.floor(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const i = (py * buf.w + px) * 4;
        buf.data[i] = r;
        buf.data[i + 1] = g;
        buf.data[i + 2] = b;
        buf.data[i + 3] = 255;
      }
    }
  }

  /** Nearest-neighbour scale, then source-over. Only the 3- and 5-arg forms exist. */
  drawImage(src: object, dx: number, dy: number, dw?: number, dh?: number): void {
    const s = buffers.get(src);
    if (!s) throw new Error("fake canvas: drawImage source has no registered pixels");
    const dst = this.buf();
    const tw = dw ?? s.w;
    const th = dh ?? s.h;

    for (let ty = 0; ty < th; ty++) {
      const py = Math.floor(dy) + ty;
      if (py < 0 || py >= dst.h) continue;
      const sy = Math.min(s.h - 1, Math.floor((ty * s.h) / th));
      for (let tx = 0; tx < tw; tx++) {
        const px = Math.floor(dx) + tx;
        if (px < 0 || px >= dst.w) continue;
        const sx = Math.min(s.w - 1, Math.floor((tx * s.w) / tw));

        const si = (sy * s.w + sx) * 4;
        const di = (py * dst.w + px) * 4;
        const sa = s.data[si + 3] / 255;
        if (sa === 0) continue; // fully transparent leaves the destination alone

        const da = dst.data[di + 3] / 255;
        const outA = sa + da * (1 - sa);
        for (let c = 0; c < 3; c++) {
          // non-premultiplied source-over
          const sc = s.data[si + c];
          const dc = dst.data[di + c];
          dst.data[di + c] = outA === 0 ? 0 : (sc * sa + dc * da * (1 - sa)) / outA;
        }
        dst.data[di + 3] = outA * 255;
      }
    }
  }

  getImageData(x: number, y: number, w: number, h: number): ImageData {
    const buf = this.buf();
    const out = new Uint8ClampedArray(w * h * 4);
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const sxi = x + px;
        const syi = y + py;
        if (sxi < 0 || sxi >= buf.w || syi < 0 || syi >= buf.h) continue;
        const si = (syi * buf.w + sxi) * 4;
        const di = (py * w + px) * 4;
        out[di] = buf.data[si];
        out[di + 1] = buf.data[si + 1];
        out[di + 2] = buf.data[si + 2];
        out[di + 3] = buf.data[si + 3];
      }
    }
    // imageField.ts only reads `.data`; a plain object avoids depending on
    // jsdom's ImageData constructor.
    return { data: out, width: w, height: h, colorSpace: "srgb" } as ImageData;
  }
}

const contexts = new WeakMap<HTMLCanvasElement, FakeCtx2D>();

export function fakeGetContext(canvas: HTMLCanvasElement, kind: string): FakeCtx2D | null {
  if (kind !== "2d") return null;
  let ctx = contexts.get(canvas);
  if (!ctx) {
    ctx = new FakeCtx2D(canvas);
    contexts.set(canvas, ctx);
  }
  return ctx;
}

/**
 * A stand-in for a decoded <img>.
 *
 * Deliberately a plain object rather than a jsdom `Image`: `naturalWidth` and
 * `naturalHeight` are prototype getters with no setter, so assigning them throws
 * under ESM strict mode. `prepareSource` only ever reads `naturalWidth || width`
 * and `naturalHeight || height`, then hands the object to `drawImage` — so this
 * is the entire surface it touches. If that ever changes, this comment is the
 * thing that should have been updated.
 */
export function makeFakeImage(bmp: Bitmap): HTMLImageElement {
  const img = {
    naturalWidth: bmp.w,
    naturalHeight: bmp.h,
    width: bmp.w,
    height: bmp.h,
  };
  setPixels(img, bmp);
  return img as unknown as HTMLImageElement;
}
