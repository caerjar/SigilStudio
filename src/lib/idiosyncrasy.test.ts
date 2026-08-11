// The idiosyncrasy engine is a port of the emu-butch dossier's
// build_transfinite_sigil.py and has to stay in step with it. These pin the
// constants that define the port, so a "tidy-up" that changes them is loud.

import { describe, expect, it } from "vitest";
import { CHAR_ADVANCE, fillToLength, fitFontSize, normalizeText } from "./fitText";
import { DEFAULT_OCTAVES } from "./noise";
import { mulberry32 } from "./rng";
import { buildTspans, xmlEscape } from "./tspans";

describe("mulberry32", () => {
  it("is deterministic per seed", () => {
    const a = mulberry32(1977);
    const b = mulberry32(1977);
    const seqA = Array.from({ length: 8 }, () => a());
    const seqB = Array.from({ length: 8 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("gives different streams for different seeds, all inside [0,1)", () => {
    const a = Array.from({ length: 8 }, mulberry32(1));
    const b = Array.from({ length: 8 }, mulberry32(2));
    expect(a).not.toEqual(b);
    for (const v of [...a, ...b]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("noise", () => {
  it("keeps the seven octaves the generator was built with", () => {
    expect(DEFAULT_OCTAVES).toHaveLength(7);
  });
});

describe("fitText", () => {
  it("holds Georgia's mean advance", () => {
    expect(CHAR_ADVANCE).toBeCloseTo(0.48, 5);
  });

  it("inverts cleanly: N chars at the fitted size span the path once", () => {
    const size = fitFontSize(1000, 100);
    expect(100 * size * CHAR_ADVANCE).toBeCloseTo(1000, 6);
  });

  it("never splits an astral character across the slice", () => {
    // A lone surrogate is not valid XML: the export fails to parse and PNG
    // rendering — which decodes the SVG as an image — comes out empty, while
    // the lenient innerHTML preview looks fine.
    for (let len = 1; len < 60; len++) {
      const out = fillToLength("ab\u{1F600}cd", len * 3, 1 / CHAR_ADVANCE);
      const last = out.charCodeAt(out.length - 1);
      expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
      // and it round-trips through an XML parse
      const doc = new DOMParser().parseFromString(
        `<r xmlns="http://www.w3.org/2000/svg">${xmlEscape(out)}</r>`,
        "application/xml",
      );
      expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
    }
  });

  it("normalises whitespace to a single line", () => {
    expect(normalizeText("  a\n\n b \t c ")).toBe("a b c");
  });
});

describe("tspans", () => {
  it("escapes the XML metacharacters", () => {
    expect(xmlEscape('&<>"')).toBe("&amp;&lt;&gt;&quot;");
  });

  it("emits one tspan per code point, not per code unit", () => {
    // an emoji is one glyph, not two halves of a surrogate pair
    const svg = buildTspans("a\u{1F600}b", 10, mulberry32(1));
    expect(svg.match(/<tspan/g)).toHaveLength(3);
  });
});
