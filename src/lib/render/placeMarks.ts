// Walk a path and stamp marks along it.
//
// This exists because <textPath> cannot host anything but text. For font glyphs
// the browser does the curve-following for us; for arbitrary vector marks we
// have to walk the arc-length and orient each mark ourselves.

import { arcLengths, type Pt } from "../noise";
import type { MarkSet } from "../marks/trace";
import type { MarkSource, RenderParams } from "../params";
import { normalizeText } from "../fitText";

export interface Station {
  x: number;
  y: number;
  angle: number; // radians, along the local tangent
  s: number; // arc-length at this station
  i: number; // station index, 0-based
}

/**
 * Emit a station every `pitch(s, i)` px of arc-length. The pitch is a callback
 * rather than a constant because marks have different widths — the caller picks
 * the mark for station `i` and tells us how much room it needs, using the same
 * `i` it will use when emitting, so pitch and mark stay in step.
 */
export function walkPath(
  points: Pt[],
  pitch: (s: number, i: number) => number,
): Station[] {
  const n = points.length;
  if (n < 2) return [];
  const cum = arcLengths(points);
  const total = cum[n - 1];
  if (total <= 0) return [];

  const out: Station[] = [];
  let s = 0;
  let seg = 0;
  // Belt and braces: a pathological pitch callback must not spin forever.
  for (let i = 0; s < total && i < 500_000; i++) {
    while (seg < n - 2 && cum[seg + 1] < s) seg++;
    const a = points[seg];
    const b = points[seg + 1];
    const segLen = cum[seg + 1] - cum[seg] || 1;
    const f = (s - cum[seg]) / segLen;
    out.push({
      x: a.x + (b.x - a.x) * f,
      y: a.y + (b.y - a.y) * f,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      s,
      i,
    });
    s += Math.max(0.5, pitch(s, i));
  }
  return out;
}

/**
 * The order marks are laid down in. `null` means "leave a gap here" — it keeps
 * word spacing in mapped mode, where a space has no mark of its own.
 *
 * - sequence: cycle every mark you drew, in reading order
 * - brush:    one mark, over and over
 * - mapped:   your text, spelled in your own hand. markKey says which mark is
 *             which letter (mark #1 = key[0], and so on).
 */
export function buildSequence(p: RenderParams, set: MarkSet): (number | null)[] {
  const n = set.marks.length;
  if (n === 0) return [];

  const source: MarkSource = p.markSource;
  if (source === "brush") return [0];
  if (source === "sequence") return Array.from({ length: n }, (_, i) => i);

  // mapped
  const key = p.markKey.toLowerCase();
  const seq = [...normalizeText(p.text).toLowerCase()].map((ch) => {
    const k = key.indexOf(ch);
    return k >= 0 && k < n ? k : null;
  });
  // A text with no mappable characters at all would render nothing and look
  // broken; fall back to cycling so there is always something on the page.
  return seq.some((k) => k !== null) ? seq : Array.from({ length: n }, (_, i) => i);
}

/** Mean advance (in unit-box fractions) for the budget maths. */
export function advanceOf(set: MarkSet | null, source: MarkSource): number {
  if (source === "text" || !set || set.marks.length === 0) return 0;
  return set.meanAdvance;
}
