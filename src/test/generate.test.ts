// Not a test: a generator. Runs the real engines over the real default image and
// writes SVGs to disk, so the demo page can show genuine output rather than
// staged pictures. Guarded on GENERATE_OUT so it no-ops in a normal test run.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENGINES, MODES } from "../lib/engines";
import { prepareSource } from "../lib/studio";
import { DEFAULT_PARAMS, DEFAULT_TEXT, type RenderParams } from "../lib/params";
import { makeFakeImage, type Bitmap } from "./fakeCanvas";

const OUT = process.env.GENERATE_OUT;
const BMP = process.env.GENERATE_BMP;

/** Minimal 24-bit uncompressed BMP reader — enough to get real pixels in. */
function readBmp(path: string): Bitmap {
  const buf = readFileSync(path);
  const dataOffset = buf.readUInt32LE(10);
  const w = buf.readInt32LE(18);
  const h = buf.readInt32LE(22);
  if (buf.readUInt16LE(28) !== 24) throw new Error("expected 24bpp BMP");
  const flip = h > 0; // positive height = bottom-up rows
  const H = Math.abs(h);
  const rowSize = Math.floor((24 * w + 31) / 32) * 4;
  const data = new Uint8ClampedArray(w * H * 4);
  for (let y = 0; y < H; y++) {
    let o = dataOffset + (flip ? H - 1 - y : y) * rowSize;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      data[i + 2] = buf[o++];
      data[i + 1] = buf[o++];
      data[i] = buf[o++];
      data[i + 3] = 255;
    }
  }
  return { w, h: H, data };
}

describe.runIf(OUT && BMP)("generate demo frames", () => {
  it("renders each engine from the real default image", () => {
    const src = prepareSource(makeFakeImage(readBmp(BMP as string)));
    mkdirSync(OUT as string, { recursive: true });

    const report: Record<string, string> = {};
    for (const mode of MODES) {
      const p: RenderParams = {
        ...DEFAULT_PARAMS,
        text: DEFAULT_TEXT,
        mode,
        detail: ENGINES[mode].detail.def,
        glyphBudget: 1800, // demo-weight: enough to read, light enough to animate
        canvasLong: 900,
      };
      const r = ENGINES[mode].run(src.canvas, src.width, src.height, p);
      writeFileSync(`${OUT}/${mode}.svg`, r.svg);
      report[mode] = `${r.glyphCount} glyphs, ${Math.round(r.svg.length / 1024)}KB`;
    }
    expect(report).toBeTruthy();
    writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  });
});
