import { describe, expect, it } from "vitest";
import { binarize, connectedComponents, otsuThreshold, readingOrder } from "./segment";
import type { LumField } from "../render/imageField";
import { bigBlob, box } from "../../test/fixtures";

describe("flood fill", () => {
  it("fills a blob far larger than a recursive implementation could take", () => {
    // 90,000 connected pixels. A recursive flood fill blows Node's ~10k-frame
    // stack long before this, so a rewrite to recursion fails here with
    // RangeError rather than silently working on the small cases.
    const { ink, w, h } = bigBlob(300);
    const comps = connectedComponents(ink, w, h, 1);
    expect(comps).toHaveLength(1);
    expect(comps[0].area).toBe(300 * 300);
  });

  it("separates blobs that do not touch", () => {
    const w = 40;
    const h = 10;
    const ink = new Uint8Array(w * h);
    const dot = (x0: number) => {
      for (let y = 2; y < 6; y++) for (let x = x0; x < x0 + 4; x++) ink[y * w + x] = 1;
    };
    dot(2);
    dot(20);
    expect(connectedComponents(ink, w, h, 1)).toHaveLength(2);
  });
});

describe("binarize", () => {
  const field = (values: number[], width: number): LumField => ({
    width,
    height: values.length / width,
    lum: Float64Array.from(values),
  });

  it("treats the Otsu level itself as ink", () => {
    // Otsu accumulates its dark class as hist[0..t], so the level it returns is
    // the last one INSIDE that class. An exclusive test breaks on a perfectly
    // bimodal sheet (a 1-bit PNG, or any scaling without smoothing): Otsu
    // correctly returns 0, nothing matches, and the sheet reads as blank.
    const f = field([0, 0, 255, 255], 2);
    const t = otsuThreshold(f);
    expect(t).toBe(0);
    const ink = binarize(f, t);
    expect([...ink]).toEqual([1, 1, 0, 0]);
  });
});

describe("readingOrder", () => {
  it("orders top-to-bottom, then left-to-right", () => {
    // two rows of three, fed in deliberately scrambled order
    const r0c0 = box(0, 0, 10, 20);
    const r0c1 = box(30, 0, 10, 20);
    const r0c2 = box(60, 0, 10, 20);
    const r1c0 = box(0, 60, 10, 20);
    const r1c1 = box(30, 60, 10, 20);
    const r1c2 = box(60, 60, 10, 20);
    const scrambled = [r1c1, r0c2, r1c0, r0c0, r1c2, r0c1];

    const ordered = readingOrder(scrambled);
    expect(ordered).toEqual([r0c0, r0c1, r0c2, r1c0, r1c1, r1c2]);
    // guard against the test passing vacuously
    expect(ordered).not.toEqual(scrambled);
  });

  it("keeps a tall and a short mark on the same line together", () => {
    // A raster-order sort interleaves marks that share scanlines and scrambles
    // an alphabet; rows are grouped by vertical overlap for exactly this case.
    const tallL = box(0, 0, 6, 40);
    const shortO = box(20, 24, 10, 12); // overlaps the l's band, sits low
    const nextLine = box(0, 80, 10, 20);

    const ordered = readingOrder([nextLine, shortO, tallL]);
    expect(ordered).toEqual([tallL, shortO, nextLine]);
  });
});
