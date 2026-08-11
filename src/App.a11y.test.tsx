import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { ENGINES, MODES } from "./lib/engines";

// With no image uploaded the render effect returns early, so none of this
// touches the engines — these stay fast and test only the shell.

describe("mode chips", () => {
  it("expose which one is active", () => {
    render(<App />);
    for (const m of MODES) {
      const chip = screen.getByRole("button", { name: ENGINES[m].label });
      expect(chip.getAttribute("aria-pressed")).toBe(String(m === "contour"));
    }
  });

  it("move the pressed state when you switch", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: ENGINES.spiral.label }));
    expect(
      screen.getByRole("button", { name: ENGINES.spiral.label }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: ENGINES.contour.label }).getAttribute("aria-pressed"),
    ).toBe("false");
  });
});

describe("the help panel", () => {
  it("is a disclosure that starts closed", () => {
    render(<App />);
    const toggle = screen.getByRole("button", { name: "Help" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-controls")).toBe("stage-help");
  });

  it("takes focus when opened, and hands it back on close", async () => {
    render(<App />);
    const toggle = screen.getByRole("button", { name: "Help" });

    await userEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const panel = document.getElementById("stage-help");
    expect(panel).toBeTruthy();
    // opening it without moving focus would strand a keyboard user in the header
    expect(document.activeElement).toBe(panel);

    await userEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });

  it("closes on Escape and returns focus", async () => {
    render(<App />);
    const toggle = screen.getByRole("button", { name: "Help" });
    await userEvent.click(toggle);

    await userEvent.keyboard("{Escape}");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });

  it("keeps its name stable so the control does not change identity", async () => {
    render(<App />);
    const toggle = screen.getByRole("button", { name: "Help" });
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Help" })).toBe(toggle);
  });

  it("describes every engine, from the registry", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Help" }));
    const panel = document.getElementById("stage-help") as HTMLElement;
    for (const m of MODES) {
      // the blurbs are not restated in the help prose; they come from ENGINES
      expect(panel.textContent).toContain(ENGINES[m].blurb);
    }
  });
});

describe("the tour", () => {
  it("is a two-state control that starts off", () => {
    render(<App />);
    const btn = screen.getByRole("button", { name: "Take the tour" });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
  });

  it("narrates the step it is on, in a live region", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Take the tour" }));

    const btn = screen.getByRole("button", { name: "Stop tour" });
    expect(btn.getAttribute("aria-pressed")).toBe("true");

    // the picture changing under you is the one thing a screen reader can't see
    const caption = document.querySelector(".tour");
    expect(caption).toBeTruthy();
    expect(caption?.getAttribute("role")).toBe("status");
    expect(caption?.textContent).toContain(ENGINES.contour.label);
  });

  it("moves the chips to follow the step without rewriting your settings", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Take the tour" }));
    // step 1 is contour, so its chip reads as pressed
    expect(
      screen.getByRole("button", { name: ENGINES.contour.label }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("stops when you take a control yourself", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Take the tour" }));
    expect(screen.getByRole("button", { name: "Stop tour" })).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: ENGINES.halftone.label }));
    // touching anything is a request to drive it yourself
    expect(screen.getByRole("button", { name: "Take the tour" })).toBeTruthy();
    expect(document.querySelector(".tour")).toBeNull();
  });

  it("stops, and leaves no caption behind", async () => {
    render(<App />);
    const start = screen.getByRole("button", { name: "Take the tour" });
    await userEvent.click(start);
    await userEvent.click(screen.getByRole("button", { name: "Stop tour" }));
    expect(document.querySelector(".tour")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Take the tour" }).getAttribute("aria-pressed"),
    ).toBe("false");
  });
});

describe("live regions", () => {
  it("keeps the announcement region mounted and separate from the visible status", () => {
    const { container } = render(<App />);
    // must exist before its content changes, or the change is never announced
    expect(container.querySelector('[role="status"].sr-only')).toBeTruthy();
    expect(container.querySelector('[role="alert"]')).toBeTruthy();
    // the visible status must NOT be a live region: it updates on every draft
    // pass (~8x a second mid-drag) and would flood a screen reader
    const visible = container.querySelector("aside p.status:not(.sr-only)");
    expect(visible?.getAttribute("aria-live")).toBeNull();
  });
});
