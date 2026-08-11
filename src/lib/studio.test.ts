import { describe, expect, it } from "vitest";
import { ENGINES, MODES } from "./engines";
import { makeThumbnail, prepareSource, render, THUMB_MAX, WORK_MAX } from "./studio";
import { params, photo, sheet } from "../test/fixtures";

describe("prepareSource", () => {
  it("downscales to WORK_MAX and remembers the original dimensions", () => {
    const s = prepareSource(photo(3000, 1500));
    expect(Math.max(s.width, s.height)).toBe(WORK_MAX);
    expect(s.srcWidth).toBe(3000);
    expect(s.srcHeight).toBe(1500);
    expect(s.width / s.height).toBeCloseTo(2, 2);
  });

  it("leaves an already-small image alone", () => {
    const s = prepareSource(photo(240, 180));
    expect([s.width, s.height]).toEqual([240, 180]);
  });
});

describe("makeThumbnail", () => {
  // the test canvas encodes its dimensions into the data URL — see test/setup.ts
  const sizeOf = (url: string) => atob(url.split(",")[1]);

  it("returns a data URL, never a blob reference", () => {
    // App revokes the object URL as soon as the image decodes, so a blob: here
    // would be a broken image a moment later.
    const s = prepareSource(photo());
    const url = makeThumbnail(s.canvas, s.width, s.height);
    expect(url.startsWith("data:image/")).toBe(true);
    expect(url).not.toContain("blob:");
  });

  it("fits the long side to THUMB_MAX and keeps the aspect ratio", () => {
    const s = prepareSource(photo(240, 180));
    expect(sizeOf(makeThumbnail(s.canvas, s.width, s.height))).toBe("72x54");
    expect(THUMB_MAX).toBe(72);
  });

  it("fits a portrait upload by its height", () => {
    const s = prepareSource(photo(180, 240));
    expect(sizeOf(makeThumbnail(s.canvas, s.width, s.height))).toBe("54x72");
  });

  it("never upscales a smaller upload", () => {
    const s = prepareSource(photo(40, 20));
    expect(sizeOf(makeThumbnail(s.canvas, s.width, s.height))).toBe("40x20");
  });

  it("works on the handwriting sheet too", () => {
    const s = prepareSource(sheet(4, true), "#ffffff");
    expect(sizeOf(makeThumbnail(s.canvas, s.width, s.height))).toBe("72x24");
  });
});

describe("the status line", () => {
  it.each(MODES)("%s reads as lead · glyphs · ms", (mode) => {
    const s = prepareSource(photo());
    const out = render(s, params({ mode }));
    expect(out.stats).toMatch(/^(.+ · )?[\d,]+ glyphs · \d+ms( · .+)?$/);
  });

  it("does not start halftone with a stray separator", () => {
    // halftone is the one engine with an empty `lead`; the join filters empties
    // out precisely so it reads "5,000 glyphs · 42ms" and not "· 5,000 glyphs".
    expect(ENGINES.halftone.run).toBeTypeOf("function");
    const s = prepareSource(photo());
    const out = render(s, params({ mode: "halftone" }));
    expect(out.stats.startsWith("·")).toBe(false);
    expect(out.stats).toMatch(/^[\d,]+ glyphs/);
  });

  it("names the mechanism when the budget binds", () => {
    const s = prepareSource(photo());
    const bound = render(s, params({ mode: "spiral", glyphBudget: 2000 }));
    expect(bound.stats).toContain("turns widened");
    const free = render(s, params({ mode: "spiral", glyphBudget: 60000 }));
    expect(free.stats).not.toContain("turns widened");
  });
});

describe("the engine registry", () => {
  it("has an entry for every mode, each fully populated", () => {
    // Record<Mode, Engine> makes a missing entry a build error; this catches a
    // half-filled one.
    for (const mode of MODES) {
      const e = ENGINES[mode];
      expect(e.label).toBeTruthy();
      expect(e.blurb.length).toBeGreaterThan(40);
      expect(e.budgetHint).toBeTruthy();
      expect(e.detail.min).toBeLessThan(e.detail.max);
      expect(e.detail.def).toBeGreaterThanOrEqual(e.detail.min);
      expect(e.detail.def).toBeLessThanOrEqual(e.detail.max);
    }
  });

  it("gives each engine its own budget hint", () => {
    const hints = new Set(MODES.map((m) => ENGINES[m].budgetHint));
    // the bug this registry replaced: spiral and flow were told the budget
    // "caps the grid", which is halftone's behaviour
    expect(hints.size).toBe(MODES.length);
    expect(ENGINES.spiral.budgetHint).not.toContain("grid");
    expect(ENGINES.flow.budgetHint).not.toContain("grid");
  });
});
