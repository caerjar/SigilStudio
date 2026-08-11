// Fit text to a path length — ported from build_transfinite_sigil.py.
// Georgia's mean glyph advance is ~0.48 em; so a run of N chars at font-size f
// spans ~ N * f * CHAR_ADVANCE px. Invert to size the text to a path, or repeat
// the passage to fill a given length.

export const CHAR_ADVANCE = 0.48;

/** Font size at which `charCount` chars span `pathLen` exactly once. */
export function fitFontSize(pathLen: number, charCount: number): number {
  if (charCount <= 0) return 1;
  return pathLen / (charCount * CHAR_ADVANCE);
}

/**
 * Repeat `passage` (joined by a mid-dot) until it fills `pathLen` at the given
 * font size, then trim to fit. Used when text should flow continuously and
 * wrap, rather than being scaled to one pass.
 */
export function fillToLength(passage: string, pathLen: number, fontSize: number): string {
  const needChars = Math.floor(pathLen / (fontSize * CHAR_ADVANCE)) + 4;
  const unit = passage + "  ·  ";
  if (unit.length === 0) return "";
  const reps = Math.floor(needChars / unit.length) + 1;
  let out = unit.repeat(reps).slice(0, needChars);
  // slice() counts UTF-16 code units, so it can cut an astral character (an
  // emoji, a rare CJK glyph) in half and leave a lone surrogate behind. That is
  // not valid XML: the exported file fails to parse and PNG export — which
  // decodes the SVG as an image — renders nothing at all. The preview survives
  // it, because innerHTML parsing is lenient, so it fails exactly where you
  // aren't looking. Drop a trailing unpaired high surrogate.
  const last = out.charCodeAt(out.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
  return out.replace(/\s+$/, "");
}

/** Normalize whitespace to a single line (matches the Python PASSAGE handling). */
export function normalizeText(s: string): string {
  return s.split(/\s+/).filter(Boolean).join(" ");
}
