import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImageDrop } from "./ImageDrop";

describe("ImageDrop", () => {
  it("exposes a real, focusable file input named by its label", () => {
    // The regression this guards: the input used to be `hidden` and the box was
    // a div with onClick, so the whole control was unreachable by keyboard and
    // invisible to screen readers.
    render(<ImageDrop fileName={null} onImage={() => {}} />);
    const input = screen.getByLabelText("Drop an image here, or click to choose");
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect((input as HTMLInputElement).type).toBe("file");
    expect(input.hasAttribute("hidden")).toBe(false);

    input.focus();
    expect(document.activeElement).toBe(input);
  });

  it("gives each instance its own id, so two labels do not collide", () => {
    render(
      <>
        <ImageDrop fileName={null} onImage={() => {}} />
        <ImageDrop fileName={null} onImage={() => {}} label="Drop a sheet of your handwriting" />
      </>,
    );
    const a = screen.getByLabelText("Drop an image here, or click to choose");
    const b = screen.getByLabelText("Drop a sheet of your handwriting");
    expect(a.id).toBeTruthy();
    expect(b.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
  });

  it("keeps its purpose in the accessible name once a file is loaded", () => {
    // otherwise a filled control announces only "photo.png" and you cannot tell
    // the source image from the handwriting sheet
    render(<ImageDrop fileName="photo.png" onImage={() => {}} />);
    expect(screen.getByLabelText(/Drop an image here/)).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByText("photo.png")).toBeTruthy();
  });

  it("shows a thumbnail once one exists, without announcing it", () => {
    const { container, rerender } = render(<ImageDrop fileName={null} onImage={() => {}} />);
    expect(container.querySelector("img")).toBeNull();

    rerender(
      <ImageDrop fileName="photo.png" thumbnail="data:image/jpeg;base64,x" onImage={() => {}} />,
    );
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("data:image/jpeg;base64,x");
    // decorative: the filename beside it is the content
    expect(img.getAttribute("alt")).toBe("");
    // and the control keeps its name
    expect(screen.getByLabelText(/Drop an image here/)).toBeInstanceOf(HTMLInputElement);
  });

  it("reports the chosen file", async () => {
    const onImage = vi.fn();
    // jsdom has no object URLs
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:stub" });

    render(<ImageDrop fileName={null} onImage={onImage} />);
    const input = screen.getByLabelText(/Drop an image here/) as HTMLInputElement;
    await userEvent.upload(input, new File(["x"], "mark.png", { type: "image/png" }));

    expect(onImage).toHaveBeenCalledWith("blob:stub", "mark.png");
  });
});
