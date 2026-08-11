// Draw along a set of polylines — with font glyphs, or with your own marks,
// optionally under a drawn line or ribbon.
//
// This is the half of the pipeline that doesn't care where the lines came from.
// Contour mode traces them out of the image's tonal bands; spiral mode makes one
// single unbroken line. Both hand them here.

import { buildTspans } from "../tspans";
import { CHAR_ADVANCE, fillToLength, normalizeText } from "../fitText";
import { uniform, type Rng } from "../rng";
import type { RenderParams } from "../params";
import { subpath } from "./svg";
import type { Pt } from "../noise";
import { advanceOf, buildSequence, walkPath } from "./placeMarks";
import { ribbonFillRule, ribbonPath } from "./ribbon";
import { makeArcLookup, type Ink } from "./ink";

/** Height, in px, a mark is drawn at when textScale is 1. */
export const MARK_BASE = 14;
/** Font size, in px, script is drawn at when textScale is 1. */
export const TEXT_BASE = 3.2;

export interface Line {
  d: string;
  len: number;
  pts: Pt[]; // kept: mark stamping and tone sampling both need the geometry
  closed: boolean;
}

export function makeLine(pts: Pt[], len: number, closed: boolean): Line {
  return { d: subpath(pts, closed), len, pts, closed };
}

export interface Drawn {
  body: string;
  count: number;
  budgetBound: boolean;
}

/**
 * What we're drawing with, and how much room one of them takes — as a fraction
 * of its own height. CHAR_ADVANCE is a Georgia constant, so marks must supply
 * their own or every size/budget sum comes out wrong for them.
 */
export function primitive(p: RenderParams): {
  useMarks: boolean;
  advance: number;
  wantSize: number;
} {
  const set = p.markSet;
  const useMarks = p.markSource !== "text" && !!set && set.marks.length > 0;
  return {
    useMarks,
    advance: Math.max(
      0.05,
      useMarks ? advanceOf(set, p.markSource) + p.markSpacing : CHAR_ADVANCE,
    ),
    wantSize: (useMarks ? MARK_BASE : TEXT_BASE) * p.textScale,
  };
}

/** Largest a glyph can get once jitter and tone have had their way with it. */
export function maxSizeFactor(p: RenderParams): number {
  return Math.max(1, p.jitter.sizeMax) * (1 + p.toneToSize);
}

/**
 * Size the primitive and emit everything.
 *
 * Whatever we draw with, count = totalLen / (size * advance) — so a fixed size
 * is unbounded work. Take the larger of the size asked for and the smallest
 * size that fits the budget; when the budget binds, the marks grow rather than
 * the text being cut.
 */
export function drawAlong(
  lines: Line[],
  totalLen: number,
  p: RenderParams,
  rng: Rng,
  ink: Ink,
  /**
   * Fix the primitive's size instead of deriving it from the budget. The spiral
   * needs this: its turn spacing *is* its line height, so its size is settled
   * before we get here, and it keeps the budget by widening the turns instead.
   */
  sizeOverride?: number,
): Drawn {
  const { useMarks, advance, wantSize } = primitive(p);

  const budget = Math.max(500, p.glyphBudget);
  const budgetSize = totalLen / (budget * advance);
  const baseSize = sizeOverride ?? Math.max(wantSize, budgetSize);

  const drawn = useMarks
    ? emitMarks(lines, p, baseSize, rng, ink)
    : emitText(lines, p, baseSize, rng, ink);

  return {
    body: emitStrokeLayer(lines, p, ink) + drawn.body,
    count: drawn.count,
    budgetBound: sizeOverride === undefined && budgetSize > wantSize,
  };
}

/** Font glyphs: one text stream per line, laid on the curve by the browser. */
function emitText(
  lines: Line[],
  p: RenderParams,
  baseSize: number,
  rng: Rng,
  ink: Ink,
): { body: string; count: number } {
  const text = normalizeText(p.text);
  if (lines.length === 0 || text.length === 0) return { body: "", count: 0 };

  const defs = lines.map((r, i) => `<path id="c${i}" d="${r.d}"/>`).join("\n    ");
  let textPaths = "";
  let count = 0;
  // The browser lays glyphs out along the path and never reports where they
  // landed, so reconstruct each glyph's position from its distance along the
  // stream in order to sample the tone underneath it.
  const advance = baseSize * CHAR_ADVANCE + p.letterSpacing;
  for (let i = 0; i < lines.length; i++) {
    const filled = fillToLength(text, lines[i].len, baseSize);
    count += filled.length;
    const lookup = ink.active ? makeArcLookup(lines[i].pts) : null;
    const inkAt = lookup
      ? (gi: number) => {
          const s = gi * advance;
          const pt = lookup(s);
          return ink.at(pt.x, pt.y, s);
        }
      : undefined;
    const tspans = buildTspans(filled, baseSize, rng, p.jitter, p.strokeWidth, inkAt);
    textPaths +=
      `\n    <text font-size="${baseSize.toFixed(2)}" fill="${p.palette.ink}" ` +
      `stroke="${p.palette.ink}" stroke-width="0" stroke-linejoin="round" ` +
      `letter-spacing="${p.letterSpacing}" xml:space="preserve">` +
      `<textPath xlink:href="#c${i}" href="#c${i}" startOffset="0">${tspans}</textPath></text>`;
  }
  return { body: `  <defs>\n    ${defs}\n  </defs>${textPaths}\n`, count };
}

/**
 * Your own marks, stamped along each line. <textPath> can't carry these, so we
 * walk the arc-length ourselves and rotate each mark onto the local tangent.
 */
function emitMarks(
  lines: Line[],
  p: RenderParams,
  baseSize: number,
  rng: Rng,
  ink: Ink,
): { body: string; count: number } {
  const set = p.markSet;
  if (!set || set.marks.length === 0 || lines.length === 0) return { body: "", count: 0 };

  const seq = buildSequence(p, set);
  if (seq.length === 0) return { body: "", count: 0 };

  // Marks are defined once and referenced; vector-effect keeps the ink weight
  // uniform however small a mark gets scaled (measured: without it, a mark at
  // 0.25x renders its stroke at 0.25x too).
  const defs = set.marks
    .map((m, i) => `<path id="m${i}" d="${m.d}" vector-effect="non-scaling-stroke"/>`)
    .join("\n    ");

  let uses = "";
  let count = 0;
  let stationBase = 0;

  for (const line of lines) {
    const pick = (i: number) => seq[(stationBase + i) % seq.length];
    const stations = walkPath(line.pts, (_s, i) => {
      const k = pick(i);
      const adv = k === null ? set.meanAdvance : set.marks[k].advance / set.unit;
      return baseSize * (adv + p.markSpacing);
    });

    for (const st of stations) {
      const k = pick(st.i);
      if (k === null) continue; // a gap — keeps word spacing in mapped mode
      const mod = ink.active ? ink.at(st.x, st.y, st.s) : null;
      const scale =
        (baseSize / set.unit) *
        uniform(rng, p.jitter.sizeMin, p.jitter.sizeMax) *
        (mod ? mod.size : 1);
      const opacity = uniform(rng, p.jitter.opacityMin, p.jitter.opacityMax);
      const deg = (st.angle * 180) / Math.PI;
      let attrs =
        ` transform="translate(${st.x.toFixed(1)} ${st.y.toFixed(1)}) ` +
        `rotate(${deg.toFixed(1)}) scale(${scale.toFixed(3)})"`;
      if (opacity <= 0.995) attrs += ` fill-opacity="${opacity.toFixed(2)}"`;
      // Only pay the per-mark bytes when tone/pressure are actually on;
      // otherwise the weight on the parent <g> covers every mark for free.
      if (mod) {
        const w = p.strokeWidth * mod.weight;
        if (Math.abs(w - p.strokeWidth) > 0.005) attrs += ` stroke-width="${w.toFixed(2)}"`;
      }
      uses += `<use xlink:href="#m${k}" href="#m${k}"${attrs}/>`;
      count++;
    }
    stationBase += stations.length;
  }

  const g =
    `  <g fill="${p.palette.ink}" stroke="${p.palette.ink}" ` +
    `stroke-width="${p.strokeWidth.toFixed(2)}" stroke-linejoin="round" ` +
    `stroke-linecap="round" fill-rule="nonzero">${uses}</g>\n`;
  return { body: `  <defs>\n    ${defs}\n  </defs>\n${g}`, count };
}

/**
 * The literal line. Until this existed nothing drew one at all — the text *was*
 * the line — so "make the lines thicker" had nothing to act on.
 */
function emitStrokeLayer(lines: Line[], p: RenderParams, ink: Ink): string {
  if (p.strokeMode === "none" || lines.length === 0 || p.lineWidth <= 0) return "";

  if (p.strokeMode === "line") {
    const d = lines.map((r) => r.d).join("");
    return (
      `  <path d="${d}" fill="none" stroke="${p.palette.ink}" ` +
      `stroke-width="${p.lineWidth.toFixed(2)}" stroke-linejoin="round" ` +
      `stroke-linecap="round"/>\n`
    );
  }

  // ribbon: width swells and tapers with the nib, and thickens over dark ground
  const closed = lines.every((l) => l.closed);
  const d = lines
    .map((r) =>
      ribbonPath(
        r.pts,
        (s, i) => {
          const pt = r.pts[Math.min(i, r.pts.length - 1)];
          const tone = 1 + p.toneToWeight * (ink.darknessAt(pt.x, pt.y) * 2 - 1);
          return Math.max(0, p.lineWidth * ink.pressureAt(s) * tone);
        },
        r.closed,
      ),
    )
    .join("");
  return `  <path d="${d}" fill="${p.palette.ink}" fill-rule="${ribbonFillRule(closed)}"/>\n`;
}
