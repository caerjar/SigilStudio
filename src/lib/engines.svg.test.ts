import { describe, expect, it } from "vitest";
import { ENGINES, MODES } from "./engines";
import { extractMarks } from "./marks/extract";
import { prepareSource } from "./studio";
import { params, photo, sheet } from "../test/fixtures";
import { auditRefs, expectWellFormedHeader, parseSvg } from "../test/svgAssert";
import type { MarkSet } from "./marks/trace";

const src = () => prepareSource(photo());

function marksFixture(): MarkSet {
  const s = prepareSource(sheet(4), "#ffffff");
  const r = extractMarks(s.canvas, s.width, s.height);
  expect(r.markSet.marks.length).toBeGreaterThan(0);
  return r.markSet;
}

describe.each(MODES)("%s engine — SVG integrity", (mode) => {
  it("emits a well-formed, self-contained document", () => {
    const s = src();
    const { svg } = ENGINES[mode].run(s.canvas, s.width, s.height, params({ mode }));
    const doc = expectWellFormedHeader(svg);
    auditRefs(doc);
  });

  it("names itself with a <title> as the first child", () => {
    const s = src();
    const { svg } = ENGINES[mode].run(s.canvas, s.width, s.height, params({ mode }));
    const root = parseSvg(svg).documentElement;
    // Must be first: a <title> anywhere else is a tooltip, not the document title.
    expect(root.firstElementChild?.nodeName).toBe("title");
    expect(root.firstElementChild?.textContent).toBeTruthy();
    expect(root.getAttribute("role")).toBe("img");
  });

  it("escapes hostile text and still parses", () => {
    const s = src();
    const nasty = 'a<b & c"d ]]> \u{1F600}';
    const { svg } = ENGINES[mode].run(s.canvas, s.width, s.height, params({ mode, text: nasty }));
    const doc = expectWellFormedHeader(svg);
    // the characters survive the round trip rather than being dropped
    expect(doc.documentElement.textContent).toContain("<");
    expect(doc.documentElement.textContent).toContain("&");
  });

  it("survives degenerate input without throwing", () => {
    const tiny = prepareSource(photo(1, 1));
    expect(() =>
      ENGINES[mode].run(tiny.canvas, tiny.width, tiny.height, params({ mode })),
    ).not.toThrow();

    const sliver = prepareSource(photo(400, 1));
    expect(() =>
      ENGINES[mode].run(sliver.canvas, sliver.width, sliver.height, params({ mode })),
    ).not.toThrow();
  });

  it("draws no glyphs for empty text but still emits a valid document", () => {
    const s = src();
    const r = ENGINES[mode].run(s.canvas, s.width, s.height, params({ mode, text: "" }));
    expect(r.glyphCount).toBe(0);
    expectWellFormedHeader(r.svg);
  });
});

/**
 * The defs/use emission exists in TWO places — draw.ts (contour, spiral, flow)
 * and halftone.ts. Asserting both in one table is the cheapest guard against the
 * "fixed one, forgot the other" failure the harness notes warn about.
 */
describe.each(MODES)("%s engine — marks are geometry, not references", (mode) => {
  it("stamps marks as <defs> paths referenced by <use>", () => {
    const markSet = marksFixture();
    const s = src();
    const { svg } = ENGINES[mode].run(
      s.canvas,
      s.width,
      s.height,
      params({ mode, markSet, markSource: "sequence" }),
    );
    const doc = parseSvg(svg);

    expect(doc.querySelectorAll("defs path").length).toBeGreaterThan(0);
    const { uses } = auditRefs(doc);
    expect(uses).toBeGreaterThan(0);
  });

  it("carries vector-effect=non-scaling-stroke on every defs mark path", () => {
    const markSet = marksFixture();
    const s = src();
    const { svg } = ENGINES[mode].run(
      s.canvas,
      s.width,
      s.height,
      params({ mode, markSet, markSource: "sequence" }),
    );
    const doc = parseSvg(svg);

    // Without this, a mark scaled to 0.25x strokes at 0.25x too.
    const defsPaths = doc.querySelectorAll("defs path");
    const scaled = doc.querySelectorAll('defs path[vector-effect="non-scaling-stroke"]');
    expect(defsPaths.length).toBeGreaterThan(0);
    expect(scaled.length).toBe(defsPaths.length);
  });
});
