// All render parameters in one place, with defaults. The UI exposes a starter
// subset (see controls.ts); every other field here is a ready-to-expose knob.

import { DEFAULT_OCTAVES, type Octave } from "./noise";
import { DEFAULT_JITTER, type JitterRanges } from "./tspans";
import type { MarkSet } from "./marks/trace";

export type Mode = "contour" | "halftone" | "spiral" | "flow";

/** What the drawing is made of. */
export type MarkSource =
  | "text" // font glyphs — the original behaviour
  | "sequence" // your uploaded marks, cycled in reading order
  | "mapped" // your text, spelled in your own hand (see markKey)
  | "brush"; // one uploaded mark, repeated

/** Whether a literal line is drawn along the path, and how. */
export type StrokeMode =
  | "none" // no line — the marks alone are the drawing (original behaviour)
  | "line" // a uniform stroked line
  | "ribbon"; // a filled ribbon whose width swells and tapers

export interface Palette {
  ink: string;
  paper: string;
  gold: string;
  red: string;
}

// Dossier house palette.
export const HOUSE_PALETTE: Palette = {
  ink: "#2b2519",
  paper: "#fbf7ef",
  gold: "#b8860b",
  red: "#c0392b",
};

export interface RenderParams {
  mode: Mode;
  text: string;
  seed: number;
  palette: Palette;
  fontFamily: string;
  letterSpacing: number;
  jitter: JitterRanges;
  canvasLong: number; // long-side length of the output SVG, px

  // ---- the two starter sliders ----
  // contour: threshold bands (3..14); halftone: cells across (16..140);
  // spiral: px between successive turns (6..80)
  detail: number;
  textScale: number; // relative font size (0.4..2.5), 1 = auto baseline

  // Hard ceiling on how many glyphs a render may emit. Cost is ~linear in glyph
  // count (each is a separately laid-out <tspan> on a textPath, ~6us), and
  // nothing else bounds it: glyphs = pathLen / (fontSize * CHAR_ADVANCE), so a
  // detailed image at a small font size will happily ask for 200k and wedge the
  // tab. When the budget binds, the engines grow the type rather than truncate
  // the text — the composition is preserved, the script just gets chunkier.
  glyphBudget: number;

  // ---- your own marks ----
  markSource: MarkSource;
  markSet: MarkSet | null; // vectorised per sheet and cached — never per render
  markKey: string; // mapped mode: which mark is which letter. markKey[0] = mark #1.
  markSpacing: number; // extra gap between marks, as a fraction of the mark's advance

  // How the sheet is read. Changing either re-vectorises the sheet — which is
  // still not the render path: it happens in its own effect off these two
  // values, not on every param change.
  markAutoThreshold: boolean; // Otsu picks the ink/paper split
  markThreshold: number; // 0..255, used when the above is off. Darker or equal = ink.
  markMinAreaPct: number; // blobs smaller than this % of the sheet are speckle

  // ---- ink weight ----
  // Absolute px in output space. The old jitter.weightMax is a *fraction* of
  // this, so the two don't fight; on marks it rides on vector-effect
  // non-scaling-stroke, so weight stays uniform however the mark is scaled.
  strokeWidth: number;
  strokeMode: StrokeMode;
  lineWidth: number; // width of the drawn line / mean width of the ribbon, px
  pressure: number; // 0..1 — how much the ink swells and tapers, like a nib

  // How much the image's own tone drives the ink. Without these, contour mode
  // draws every mark identically and reads as a flat outline rather than a
  // picture: the outlines are in the right places but carry no light or shade.
  toneToWeight: number; // 0..1 — dark areas draw heavier
  toneToSize: number; // 0..1 — dark areas draw bigger

  // ---- the drawn line: contour, spiral and flow all read these ----
  wobbleScale: number; // multiplies noise amplitude
  octaves: Octave[];
  blur: number; // box-blur radius on the luminance field (px, field space)
  invert: boolean;

  // contour only — the tracing step has no counterpart in spiral or flow
  simplifyTolerance: number; // px, Douglas–Peucker
  minContourLen: number; // drop contours shorter than this (px, output space)

  // ---- halftone engine ----
  darknessFloor: number; // cells lighter than this stay empty (0..1)
}

export const DEFAULT_PARAMS: RenderParams = {
  mode: "contour",
  text: "",
  seed: 1977,
  palette: HOUSE_PALETTE,
  fontFamily: "Georgia, 'Iowan Old Style', serif",
  letterSpacing: 0.15,
  jitter: DEFAULT_JITTER,
  canvasLong: 1000,

  detail: 7,
  textScale: 1.0,
  // 12000 renders beautifully and drags badly: one pass at that count blocks
  // ~400ms, and the interaction never recovers. 6000 is the largest that still
  // feels like a live control. Raise it for a final export — the status line
  // reports the cost, and the draft pass keeps the drag usable either way.
  glyphBudget: 6000,

  markSource: "text",
  markSet: null,
  markKey: "abcdefghijklmnopqrstuvwxyz",
  markSpacing: 0.15,

  markAutoThreshold: true,
  markThreshold: 128,
  // 0.004% of the sheet — the long-standing default, now reachable. Raise it to
  // bin more speckle; lower it to keep the dot of an i, which is the usual
  // reason a hand-written alphabet comes back a few letters short.
  markMinAreaPct: 0.004,

  strokeWidth: 0.15,
  strokeMode: "none",
  lineWidth: 2,
  pressure: 0.5,
  toneToWeight: 0.6,
  toneToSize: 0.35,

  wobbleScale: 1.0,
  octaves: DEFAULT_OCTAVES,
  simplifyTolerance: 0.8,
  // Tuned against a real photograph in the browser rather than a clean test
  // pattern. A woodland scene is close to worst case — bare branches are almost
  // pure high-frequency detail — and at blur 1 / minContourLen 40 it traced 369
  // contours and came out as illegible confetti. At 3 / 60 the same image gives
  // 92 contours and reads. The cost elsewhere is nil: spiral and halftone are
  // unchanged (blur moves their tone, not their geometry) and flow comes out
  // slightly cleaner (10,023 glyphs -> 7,805). Raise minContourLen further to
  // despeckle harder; drop blur toward 0 for a clean, high-contrast source.
  minContourLen: 60,
  blur: 3,
  invert: false,

  darknessFloor: 0.12,
};

// The transfinite passage — the default text, so the tool opens on something.
export const DEFAULT_TEXT =
  "Like many great scientists, including Isaac Newton and Johannes Kepler, " +
  "Georg Cantor became deeply interested in esoteric theological questions. " +
  "He did not limit himself to laws of cause and effect, but attended to other " +
  "logics: the law of correspondences, the law of resonance, the kybalion laws " +
  "maybe. Cantor named the numbers that described these ordered infinities, and " +
  "the Alephs, transfinite. So grateful am I for this amazing download, since as " +
  "an emu butch, I self identify as transfinite.";
