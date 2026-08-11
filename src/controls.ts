// Simplified control registry with only essential controls
// The panel maps over this array grouped by `group`. Every
// field here already exists on RenderParams and is honoured by the engines.

import { ENGINES } from "./lib/engines";
import type { Mode, RenderParams } from "./lib/params";

export type ControlKind = "range" | "toggle" | "color" | "select" | "text";
export type Group =
  | "General"
  | "Marks"
  | "Ink"
  | "Line";

export type CtrlValue = number | boolean | string;

export interface Control {
  id: string;
  kind: ControlKind;
  group: Group;
  label: (mode: Mode) => string;
  hint: (mode: Mode) => string;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[]; // kind: "select"
  modes?: Mode[]; // omit = both
  get: (p: RenderParams) => CtrlValue;
  set: (p: RenderParams, v: CtrlValue) => RenderParams;
}

const num = (v: CtrlValue) => Number(v);

export const CONTROLS = [
  // ---------------- General (essential controls only) ----------------
  {
    id: "detail",
    kind: "range",
    group: "General",
    label: (m) =>
      m === "contour"
        ? "Detail — contour bands"
        : m === "spiral"
          ? "Detail — spiral pitch (px)"
          : m === "flow"
            ? "Detail — hatch spacing (px)"
            : "Detail — cells across",
    hint: (m) =>
      m === "contour"
        ? "How many tonal outlines to trace — more = finer, busier."
        : m === "spiral"
          ? "Gap between successive turns. Smaller = tighter winding, more line."
          : m === "flow"
            ? "Gap between hatch lines. Smaller = denser hatching, more line."
            : "Grid resolution — more cells = finer, smaller glyphs.",
    min: 3,
    max: 140,
    step: 1,
    get: (p) => p.detail,
    set: (p, v) => ({ ...p, detail: num(v) }),
  },
  {
    id: "textScale",
    kind: "range",
    group: "General",
    label: () => "Text size",
    hint: () => "Relative size of the script.",
    min: 0.4,
    max: 2.5,
    step: 0.05,
    get: (p) => p.textScale,
    set: (p, v) => ({ ...p, textScale: num(v) }),
  },
  {
    id: "glyphBudget",
    kind: "range",
    group: "General",
    label: () => "Glyph budget",
    hint: (m) => ENGINES[m].budgetHint,
    min: 2000,
    max: 80000,
    step: 1000,
    get: (p) => p.glyphBudget,
    set: (p, v) => ({ ...p, glyphBudget: num(v) }),
  },

  // ---------------- Marks (simplified) ----------------
  {
    id: "useMarks",
    kind: "toggle",
    group: "Marks",
    label: () => "Draw with handwriting",
    hint: () =>
      "Off draws with letters. On draws with the marks from the sheet below.",
    get: (p) => p.markSource !== "text",
    set: (p, v) => ({
      ...p,
      // Only "text" is off, so turning it back on cannot know which of the three
      // mark modes you had; sequence is the one that always does something.
      markSource: v ? (p.markSource === "text" ? "sequence" : p.markSource) : "text",
    }),
  },

  // ---------------- Ink weight / thickness ----------------
  {
    id: "strokeWidth",
    kind: "range",
    group: "Ink",
    label: () => "Ink weight",
    hint: () => "How heavy the marks and letters are drawn, in px.",
    min: 0,
    max: 6,
    step: 0.05,
    get: (p) => p.strokeWidth,
    set: (p, v) => ({ ...p, strokeWidth: num(v) }),
  },
  {
    id: "toneToWeight",
    kind: "range",
    group: "Ink",
    label: () => "Tone → weight",
    hint: (m) =>
      m === "contour"
        ? "Draw heavier over the image's dark areas. At 0 the outline is flat and toneless."
        : "How hard darkness drives ink weight.",
    min: 0,
    max: 1,
    step: 0.05,
    get: (p) => p.toneToWeight,
    set: (p, v) => ({ ...p, toneToWeight: num(v) }),
  },
];

export const GROUP_ORDER: Group[] = [
  "General",
  "Marks",
  "Ink",
  "Line",
];

export function controlsFor(mode: Mode): Control[] {
  return CONTROLS.filter((c) => !c.modes || c.modes.includes(mode)).map((c) => {
    if (c.id === "detail") {
      const r = ENGINES[mode].detail;
      return { ...c, min: r.min, max: r.max };
    }
    return c;
  });
}