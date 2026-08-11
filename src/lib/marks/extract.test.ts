import { describe, expect, it } from "vitest";
import { extractMarks } from "./extract";
import { prepareSource } from "../studio";
import { sheet } from "../../test/fixtures";

/**
 * imageToField reads only RGB and ignores alpha, so a transparent-background
 * sheet — what a drawing app exports — arrives as luminance 0 everywhere:
 * indistinguishable from solid ink. The whole page then reads as one giant mark.
 *
 * This is the invariant the fake canvas exists to make testable. It is only
 * observable as an interaction between fillRect, drawImage's source-over blend
 * and getImageData, so it cannot be checked by asserting "prepareSource called
 * fillRect" — that passes even if the fill happens after the draw.
 */
describe("transparent sheets must be flattened onto white", () => {
  it("reads an unflattened transparent sheet as one giant mark", () => {
    const s = prepareSource(sheet(4, true));
    const r = extractMarks(s.canvas, s.width, s.height);
    expect(r.found).toBe(1);
  });

  it("recovers every mark when flattened onto white", () => {
    const s = prepareSource(sheet(4, true), "#ffffff");
    const r = extractMarks(s.canvas, s.width, s.height);
    expect(r.found).toBe(4);
    expect(r.markSet.marks).toHaveLength(4);
  });

  it("leaves an already-opaque sheet alone", () => {
    // proves the flatten is fixing the alpha case and not masking something else
    const plain = extractMarks(
      ...(() => {
        const s = prepareSource(sheet(4, false));
        return [s.canvas, s.width, s.height] as const;
      })(),
    );
    const flattened = extractMarks(
      ...(() => {
        const s = prepareSource(sheet(4, false), "#ffffff");
        return [s.canvas, s.width, s.height] as const;
      })(),
    );
    expect(plain.found).toBe(4);
    expect(flattened.found).toBe(4);
  });

  it("reports speckle separately from marks", () => {
    const s = prepareSource(sheet(4, false), "#ffffff");
    const r = extractMarks(s.canvas, s.width, s.height);
    expect(r.dropped).toBe(0);
    expect(r.threshold).toBeGreaterThanOrEqual(0);
  });
});

describe("reading the sheet by hand", () => {
  const src = () => prepareSource(sheet(4, false), "#ffffff");

  it("honours an explicit threshold instead of Otsu", () => {
    const s = src();
    expect(extractMarks(s.canvas, s.width, s.height, { threshold: 200 }).threshold).toBe(200);
    // null is the "decide for me" signal, not "use 0"
    expect(extractMarks(s.canvas, s.width, s.height, { threshold: null }).threshold).not.toBe(200);
  });

  it("still finds pure black ink at a threshold of 0", () => {
    // The threshold is inclusive, so 0 means "only absolute black is ink" — and
    // absolute black ink qualifies. An exclusive test here was the bug that made
    // a perfectly bimodal sheet read as blank.
    const s = src();
    expect(extractMarks(s.canvas, s.width, s.height, { threshold: 0 }).found).toBe(4);
  });

  it("keeps the marks when the threshold sits between the ink and the paper", () => {
    const s = src();
    expect(extractMarks(s.canvas, s.width, s.height, { threshold: 128 }).found).toBe(4);
  });

  it("swallows the sheet when the threshold reaches the paper", () => {
    // the other failure mode the controls make reachable: everything is ink, so
    // the page segments as one blob rather than as marks
    const s = src();
    expect(extractMarks(s.canvas, s.width, s.height, { threshold: 255 }).found).toBe(1);
  });

  it("bins more as speckle as the smallest-mark floor rises", () => {
    // This is the lever for an alphabet that comes back short: lower it to keep
    // the dot of an i, raise it to reject scanner grain.
    const s = src();
    const counts = [0.00001, 0.001, 0.02].map(
      (minAreaFrac) => extractMarks(s.canvas, s.width, s.height, { minAreaFrac }).found,
    );
    expect(counts[0]).toBeGreaterThanOrEqual(counts[1]);
    expect(counts[1]).toBeGreaterThan(counts[2]);
    expect(counts[2]).toBe(0); // everything binned
  });

  it("counts every rejected blob as a speck", () => {
    const s = src();
    const r = extractMarks(s.canvas, s.width, s.height, { minAreaFrac: 0.02 });
    expect(r.found + r.dropped).toBe(4);
    expect(r.dropped).toBe(4);
  });
});
