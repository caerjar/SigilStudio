// The guided tour, as data.
//
// It drives the real renderer over the image and mark set you actually have
// loaded, rather than replaying baked frames — so it cannot drift from the
// engines, and it demonstrates YOUR upload rather than a stock one.
//
// Steps are an overlay on your params, never a write to them: the demo shows a
// different view of your settings and leaves them exactly as you left them.

import { ENGINES } from "./engines";
import type { RenderParams } from "./params";

export interface DemoStep {
  /** Applied over the live params for the duration of the step. */
  patch: Partial<RenderParams>;
  /** Short title — the engine's own name, so it can't drift. */
  title: string;
  /** One line on what this step is showing. */
  note: string;
  /** Needs a vectorised sheet to mean anything. */
  needsMarks?: boolean;
}

/** How long each step holds, in ms. Long enough for the full render to land. */
export const STEP_MS = 3800;

/**
 * A budget that keeps every step arriving promptly. The tour is about the shape
 * of each engine, not its finest detail — and a step that takes longer than it
 * holds would show you the previous engine's picture.
 */
const TOUR_BUDGET = 4000;

export const DEMO: DemoStep[] = [
  {
    patch: { mode: "contour", markSource: "text", glyphBudget: TOUR_BUDGET },
    title: ENGINES.contour.label,
    note: "Tonal boundaries traced as lines, with the text written along each one.",
  },
  {
    patch: { mode: "spiral", markSource: "text", glyphBudget: TOUR_BUDGET },
    title: ENGINES.spiral.label,
    note: "One unbroken line from the centre out. The type thickens where the image is dark.",
  },
  {
    patch: { mode: "flow", markSource: "text", glyphBudget: TOUR_BUDGET },
    title: ENGINES.flow.label,
    note: "Hatching that follows the form, turning to run along edges rather than across them.",
  },
  {
    patch: { mode: "halftone", markSource: "text", glyphBudget: TOUR_BUDGET },
    title: ENGINES.halftone.label,
    note: "One glyph per cell, sized by how dark that cell is. The only engine that leaves the type upright.",
  },
  {
    patch: { mode: "contour", markSource: "sequence", glyphBudget: TOUR_BUDGET },
    title: "Contour, in your own hand",
    note: "The same trace, drawn with the marks from your sheet instead of letters.",
    needsMarks: true,
  },
  {
    patch: { mode: "flow", markSource: "sequence", glyphBudget: TOUR_BUDGET },
    title: "Flow field, in your own hand",
    note: "Your marks laid along the flow, each one turned to follow it.",
    needsMarks: true,
  },
];

/** The steps worth showing given what is currently loaded. */
export function demoSteps(hasMarks: boolean): DemoStep[] {
  return DEMO.filter((s) => hasMarks || !s.needsMarks);
}
