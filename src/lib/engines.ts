// Engine registry. One entry per mode — the chip label, the Detail range, how the
// glyph budget binds, and the render call itself. Everything the app needs to know
// about a mode lives here, so adding an engine is one entry plus the `Mode` union.
//
// It used to be four places (the union, a dispatch if-chain, the chip labels, a
// detailRange function), and they drifted: spiral and flow shipped while the Glyph
// budget hint still told you the budget "caps the grid" — which is halftone's
// behaviour, not theirs. Typing ENGINES as Record<Mode, Engine> makes that a build
// error instead: extend the union and tsc demands the entry.

import type { Mode, RenderParams } from "./params";
import { renderContour } from "./render/contour";
import { renderHalftone } from "./render/halftone";
import { renderSpiral } from "./render/spiral";
import { renderFlow } from "./render/flow";

/**
 * What every engine hands back. `lead` and `boundNote` are the mode-specific halves
 * of the status line — the engine formats them because only it knows what its
 * numbers mean (turns, hatch lines, contours). Normalising here rather than exposing
 * each engine's own result type keeps the registry free of generics: the specific
 * result stays fully typed inside the closure that produced it.
 */
export interface EngineRun {
  svg: string;
  glyphCount: number;
  budgetBound: boolean;
  lead: string; // status-line fragment before the glyph count; "" if the mode has none
  boundNote: string; // appended when budgetBound — how this engine made room
}

export interface Engine {
  label: string; // mode chip
  /**
   * What this engine does and when to reach for it. Lives here rather than in
   * the help screen's prose so the two can't drift — the same drift that left
   * the README describing two engines long after there were four.
   */
  blurb: string;
  /** `detail` means something different per mode, so its range moves with the mode. */
  detail: { min: number; max: number; def: number };
  /** Glyph budget hint: every engine keeps the budget a different way. */
  budgetHint: string;
  run(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    p: RenderParams,
  ): EngineRun;
}

const BUDGET = "Ceiling on total letters.";

export const ENGINES: Record<Mode, Engine> = {
  contour: {
    label: "Contour trace",
    blurb:
      "Traces the boundaries between light and shade as separate lines, the way " +
      "a contour map traces height. Best for faces and anything with clear edges; " +
      "it keeps a likeness at small sizes. Start here.",
    detail: { min: 3, max: 14, def: 7 },
    budgetHint: `${BUDGET} Raise for finer script, at the cost of speed.`,
    run(canvas, width, height, p) {
      const r = renderContour(canvas, width, height, p);
      return {
        svg: r.svg,
        glyphCount: r.glyphCount,
        budgetBound: r.budgetBound,
        lead: `${r.contourCount} contours`,
        boundNote: "type enlarged to fit the glyph budget",
      };
    },
  },

  spiral: {
    label: "Spiral",
    blurb:
      "Draws the whole picture as one unbroken line winding out from the centre, " +
      "thickening where the image is dark. Best for a single centred subject, and " +
      "the only engine whose output is one continuous stroke — good for pen plotters.",
    detail: { min: 6, max: 80, def: 22 },
    budgetHint: `${BUDGET} Widens the turns however tight Detail goes.`,
    run(canvas, width, height, p) {
      const r = renderSpiral(canvas, width, height, p);
      return {
        svg: r.svg,
        glyphCount: r.glyphCount,
        budgetBound: r.budgetBound,
        lead: `1 unbroken line · ${r.turns.toFixed(0)} turns`,
        boundNote: `turns widened to ${r.pitch.toFixed(0)}px to fit the glyph budget`,
      };
    },
  },

  flow: {
    label: "Flow field",
    blurb:
      "Lays hatching that follows the form, turning to run along edges rather than " +
      "across them — the way an engraver lays lines across a face. Best for texture, " +
      "fabric, hair and landscape; the most painterly of the four.",
    detail: { min: 4, max: 60, def: 16 },
    budgetHint: `${BUDGET} Opens the hatch however dense Detail goes.`,
    run(canvas, width, height, p) {
      const r = renderFlow(canvas, width, height, p);
      return {
        svg: r.svg,
        glyphCount: r.glyphCount,
        budgetBound: r.budgetBound,
        lead: `${r.lineCount} flow lines`,
        boundNote: `hatch opened to ${r.spacing.toFixed(0)}px to fit the glyph budget`,
      };
    },
  },

  halftone: {
    label: "Typographic halftone",
    blurb:
      "Puts one glyph in each cell of a grid and sizes it by how dark that cell is, " +
      "like a newspaper halftone made of letters. Best for high-contrast images and " +
      "for keeping the text readable — it is the only engine that doesn't bend the type.",
    detail: { min: 16, max: 140, def: 60 },
    budgetHint: `${BUDGET} Caps the grid however high Detail goes.`,
    run(canvas, width, height, p) {
      const r = renderHalftone(canvas, width, height, p);
      return {
        svg: r.svg,
        glyphCount: r.glyphCount,
        budgetBound: r.budgetBound,
        lead: "",
        boundNote: "grid coarsened to fit the glyph budget",
      };
    },
  },
};

/** Modes in presentation order — the order the chips are written above. */
export const MODES = Object.keys(ENGINES) as Mode[];
