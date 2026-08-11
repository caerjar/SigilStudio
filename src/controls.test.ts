import { describe, expect, it } from "vitest";
import { CONTROLS, controlsFor } from "./controls";
import { MODES } from "./lib/engines";
import { params } from "./test/fixtures";

const byId = (id: string) => {
  const c = CONTROLS.find((x) => x.id === id);
  if (!c) throw new Error(`no control ${id}`);
  return c;
};

describe("the handwriting toggle", () => {
  // It is a derived control — it reads and writes markSource rather than a param
  // of its own — so the mapping needs pinning.
  const toggle = byId("useMarks");

  it("is off for text and on for every mark mode", () => {
    expect(toggle.get(params({ markSource: "text" }))).toBe(false);
    for (const source of ["sequence", "mapped", "brush"] as const) {
      expect(toggle.get(params({ markSource: source }))).toBe(true);
    }
  });

  it("turns on to the sequence, which always draws something", () => {
    const next = toggle.set(params({ markSource: "text" }), true);
    expect(next.markSource).toBe("sequence");
  });

  it("does not clobber a mark mode you already chose", () => {
    // re-asserting `true` while already on must be a no-op, or a re-render could
    // silently drop you from spelling back to sequence
    expect(toggle.set(params({ markSource: "mapped" }), true).markSource).toBe("mapped");
    expect(toggle.set(params({ markSource: "brush" }), true).markSource).toBe("brush");
  });

  it("turns off to text from any mark mode", () => {
    for (const source of ["sequence", "mapped", "brush"] as const) {
      expect(toggle.set(params({ markSource: source }), false).markSource).toBe("text");
    }
  });

  it("is offered in every engine", () => {
    for (const mode of MODES) {
      expect(controlsFor(mode).some((c) => c.id === "useMarks")).toBe(true);
    }
  });
});

describe("the control registry", () => {
  it("gives every control a non-empty label and hint in every mode", () => {
    // hints for toggles and colours are rendered now, so an empty one shows as
    // a blank line rather than being harmlessly discarded
    for (const mode of MODES) {
      for (const c of controlsFor(mode)) {
        expect(c.label(mode).length, `${c.id} label`).toBeGreaterThan(0);
        expect(c.hint(mode).length, `${c.id} hint`).toBeGreaterThan(0);
      }
    }
  });

  it("has no duplicate ids", () => {
    const ids = CONTROLS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
