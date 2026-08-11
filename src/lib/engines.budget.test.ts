import { describe, expect, it } from "vitest";
import { ENGINES, MODES } from "./engines";
import { renderContour } from "./render/contour";
import { renderFlow } from "./render/flow";
import { renderSpiral } from "./render/spiral";
import { prepareSource } from "./studio";
import { params, photo } from "../test/fixtures";
import { parseSvg } from "../test/svgAssert";

const TIGHT = 2000;
const LOOSE = 60000;

const src = () => prepareSource(photo());
const run = (mode: (typeof MODES)[number], glyphBudget: number) => {
  const s = src();
  return ENGINES[mode].run(s.canvas, s.width, s.height, params({ mode, glyphBudget }));
};

describe.each(MODES)("%s engine — the glyph budget", (mode) => {
  it("reports budgetBound only when the budget actually binds", () => {
    expect(run(mode, TIGHT).budgetBound).toBe(true);
    expect(run(mode, LOOSE).budgetBound).toBe(false);
  });

  it("draws fewer glyphs as the budget tightens", () => {
    // The assertion that actually catches a regression: tightening the budget
    // has to reduce the count. Loosening it past the point where it binds is
    // only required not to reduce it — halftone in particular is then capped by
    // Detail (its grid), so 6k and 60k give exactly the same picture.
    const tight = run(mode, TIGHT).glyphCount;
    const mid = run(mode, 6000).glyphCount;
    const loose = run(mode, LOOSE).glyphCount;
    expect(tight).toBeLessThan(mid);
    expect(mid).toBeLessThanOrEqual(loose);
  });

  it("keeps the budget approximately, and never wildly overshoots", () => {
    // Deliberately NOT asserted as a hard ceiling, because it isn't one. Two
    // sources of slack:
    //   1. fitText's fillToLength asks for `+4` characters per line, while the
    //      engines size for exactly `totalLen / (budget * advance)`.
    //   2. spiral and flow estimate their own length analytically (a spiral's
    //      arc length from πR²/pitch; flow's from area/spacing), and the
    //      estimate is approximate.
    // Measured on the standard fixture: contour 1.01x, spiral 1.09x (the worst),
    // flow 0.89x, halftone 0.86x. 1.15 leaves headroom without being vacuous —
    // it still fails immediately if an engine stops sizing to the budget at all.
    for (const budget of [TIGHT, 6000]) {
      expect(run(mode, budget).glyphCount).toBeLessThanOrEqual(budget * 1.15);
    }
  });
});

/**
 * Each engine keeps the budget its own documented way. These assert the
 * mechanism directly, so "fixing" the budget by cutting the composition short
 * fails here even if the glyph count still looks right.
 */
describe("the budget is kept by resizing, not by cutting the picture", () => {
  it("contour: the type grows and the geometry is untouched", () => {
    const s = src();
    const tight = renderContour(s.canvas, s.width, s.height, params({ glyphBudget: TIGHT }));
    const loose = renderContour(s.canvas, s.width, s.height, params({ glyphBudget: LOOSE }));

    const fontSize = (svg: string) =>
      Number(parseSvg(svg).querySelector("text")?.getAttribute("font-size"));
    expect(fontSize(tight.svg)).toBeGreaterThan(fontSize(loose.svg));

    // The composition survives: same contours, same total path, same number of
    // text runs. Only the type got bigger.
    expect(tight.contourCount).toBe(loose.contourCount);
    expect(tight.totalPathLen).toBeCloseTo(loose.totalPathLen, 6);
    const textPaths = (svg: string) => parseSvg(svg).querySelectorAll("textPath").length;
    expect(textPaths(tight.svg)).toBe(textPaths(loose.svg));
  });

  it("spiral: the turns widen", () => {
    const s = src();
    const tight = renderSpiral(s.canvas, s.width, s.height, params({ glyphBudget: TIGHT }));
    const loose = renderSpiral(s.canvas, s.width, s.height, params({ glyphBudget: LOOSE }));
    expect(tight.pitch).toBeGreaterThan(loose.pitch);
    expect(tight.turns).toBeLessThan(loose.turns);
  });

  it("flow: the hatch opens up", () => {
    const s = src();
    const tight = renderFlow(s.canvas, s.width, s.height, params({ glyphBudget: TIGHT }));
    const loose = renderFlow(s.canvas, s.width, s.height, params({ glyphBudget: LOOSE }));
    expect(tight.spacing).toBeGreaterThan(loose.spacing);
    expect(tight.lineCount).toBeLessThan(loose.lineCount);
  });

  it("halftone: the grid coarsens but still covers the canvas", () => {
    const s = src();
    const tight = ENGINES.halftone.run(
      s.canvas,
      s.width,
      s.height,
      params({ mode: "halftone", glyphBudget: TIGHT }),
    );
    const loose = ENGINES.halftone.run(
      s.canvas,
      s.width,
      s.height,
      params({ mode: "halftone", glyphBudget: LOOSE }),
    );
    expect(tight.glyphCount).toBeLessThan(loose.glyphCount);

    // Coarser cells, not a smaller picture: the ink still reaches the far edge.
    const doc = parseSvg(tight.svg);
    const width = Number(doc.documentElement.getAttribute("width"));
    const xs = [...doc.querySelectorAll("text")].map((t) => Number(t.getAttribute("x")));
    expect(Math.max(...xs)).toBeGreaterThan(width * 0.85);
  });
});
