import { describe, expect, it } from "vitest";
import { MARK_UNIT, traceAll } from "./trace";
import { box } from "../../test/fixtures";

describe("one shared scale across a MarkSet", () => {
  it("preserves relative heights", () => {
    // Normalising each mark to its own box would flatten a tall `l` and a short
    // `o` to the same height and destroy the handwriting.
    const comps = [box(0, 0, 10, 20), box(20, 0, 10, 40), box(40, 0, 10, 40), box(60, 0, 10, 80)];
    const set = traceAll(comps);
    expect(set.marks).toHaveLength(4);

    const ratio = (a: number, b: number) => a / b;
    expect(ratio(set.marks[3].h, set.marks[0].h)).toBeCloseTo(ratio(80, 20), 1);
    expect(ratio(set.marks[1].h, set.marks[0].h)).toBeCloseTo(ratio(40, 20), 1);
    // and they are genuinely different, not all 1
    expect(set.marks[0].h).not.toBeCloseTo(set.marks[3].h, 1);
  });

  it("scales to the median height, so one outsized blob cannot rescale the set", () => {
    const normal = [box(0, 0, 10, 20), box(20, 0, 10, 20), box(40, 0, 10, 20)];
    const before = traceAll(normal).marks.map((m) => m.h);

    // a stray line or a smudge, five times the height of anything written
    const withOutlier = traceAll([...normal, box(60, 0, 10, 400)]).marks.slice(0, 3).map((m) => m.h);
    for (let i = 0; i < before.length; i++) {
      expect(withOutlier[i]).toBeCloseTo(before[i], 6);
    }
  });

  it("makes the median mark one unit tall", () => {
    const set = traceAll([box(0, 0, 10, 20), box(20, 0, 10, 30), box(40, 0, 10, 40)]);
    expect(set.unit).toBe(MARK_UNIT);
    expect(set.marks[1].h).toBeCloseTo(MARK_UNIT, 0);
  });

  it("reports a usable mean advance", () => {
    const set = traceAll([box(0, 0, 10, 20), box(20, 0, 10, 20)]);
    expect(set.meanAdvance).toBeGreaterThanOrEqual(0.05);
  });
});
