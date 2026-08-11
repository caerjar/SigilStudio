import { describe, expect, it } from "vitest";
import { DEMO, demoSteps, STEP_MS } from "./demo";
import { ENGINES, MODES } from "./engines";

describe("the tour script", () => {
  it("shows every engine at least once", () => {
    const covered = new Set(DEMO.map((s) => s.patch.mode));
    for (const mode of MODES) expect(covered.has(mode)).toBe(true);
  });

  it("takes engine names from the registry rather than restating them", () => {
    // the anti-drift rule: a renamed engine must rename itself here too
    const labels = new Set(MODES.map((m) => ENGINES[m].label));
    const plain = DEMO.filter((s) => !s.needsMarks);
    for (const s of plain) expect(labels.has(s.title)).toBe(true);
  });

  it("drops the handwriting steps when no sheet is loaded", () => {
    const without = demoSteps(false);
    const withMarks = demoSteps(true);
    expect(without.every((s) => !s.needsMarks)).toBe(true);
    expect(withMarks.length).toBeGreaterThan(without.length);
    // and the ones it drops are exactly the mark steps
    expect(withMarks.length - without.length).toBe(DEMO.filter((s) => s.needsMarks).length);
  });

  it("uses the loaded sheet for the handwriting steps, not a canned one", () => {
    // markSource is switched; markSet is never patched, so it can only be
    // whatever the user has actually loaded
    for (const s of DEMO.filter((x) => x.needsMarks)) {
      expect(s.patch.markSource).toBe("sequence");
      expect("markSet" in s.patch).toBe(false);
    }
  });

  it("never patches anything that would outlive the tour", () => {
    // The patch is an overlay on live params. Anything referring to the user's
    // own content — their text, their sheet, their palette — must be left alone
    // so the tour demonstrates THEIR work rather than replacing it.
    const forbidden = ["text", "markSet", "markKey", "palette", "seed", "fontFamily"];
    for (const s of DEMO) {
      for (const key of forbidden) {
        expect(key in s.patch, `${s.title} patches ${key}`).toBe(false);
      }
    }
  });

  it("keeps every step inside its engine's own Detail range if it sets one", () => {
    for (const s of DEMO) {
      if (s.patch.detail === undefined || !s.patch.mode) continue;
      const r = ENGINES[s.patch.mode].detail;
      expect(s.patch.detail).toBeGreaterThanOrEqual(r.min);
      expect(s.patch.detail).toBeLessThanOrEqual(r.max);
    }
  });

  it("holds each step long enough for a full render to land", () => {
    // FULL_SETTLE_MS is 400 and a full pass at the tour budget is well under a
    // second; a step shorter than that would show the previous engine.
    expect(STEP_MS).toBeGreaterThan(1500);
  });

  it("gives every step a title and a note", () => {
    for (const s of DEMO) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.note.length).toBeGreaterThan(20);
    }
  });
});
