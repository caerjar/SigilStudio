import { useId, useState } from "react";

interface Props {
  onImage: (url: string, name: string) => void;
  fileName: string | null;
  /** Data-URL preview of the loaded file, if it has been decoded yet. */
  thumbnail?: string | null;
  label?: string;
}

export function ImageDrop({
  onImage,
  fileName,
  thumbnail,
  label = "Drop an image here, or click to choose",
}: Props) {
  // Two instances live in the sidebar (source image, handwriting sheet), so the
  // id has to be per-instance or the second label would point at the first input.
  const id = useId();
  const [dragging, setDragging] = useState(false);

  // An object URL is a handle to the file on disk; a data URL would base64 the
  // whole thing into a JS string (~1.37x the file size) and hold it for the
  // session. The caller revokes it once the image is decoded. Still local-only:
  // blob: URLs never leave the browser.
  const handleFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    onImage(URL.createObjectURL(file), file.name);
  };

  return (
    <div
      className={`drop ${dragging ? "drop-active" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFile(e.dataTransfer.files[0]);
      }}
    >
      {/*
        The input IS the control: it carries the tab stop, and Enter or Space on
        it opens the picker natively. It must be clipped (.sr-only) rather than
        `hidden` — `hidden` takes it out of the tab order AND out of the
        accessibility tree, which is what left this component keyboard-dead and
        invisible to screen readers. Driving a hidden input from a div's onClick
        re-implements what a <label> already does, and does it worse.
      */}
      <input
        id={id}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {/*
        `label` stays the accessible name even once a file is loaded — otherwise
        a filled control announces only "photo.png" and a screen-reader user has
        no way to tell the source image from the handwriting sheet.
      */}
      <label htmlFor={id}>
        {/* Decorative: the filename beside it is the accessible content, and
            there is nothing useful to say about the picture itself. */}
        {thumbnail ? <img className="drop-thumb" src={thumbnail} alt="" /> : null}
        <span>{label}</span>
        {fileName ? (
          <span className="drop-file">
            <strong>{fileName}</strong> — click or drop to replace
          </span>
        ) : null}
      </label>
    </div>
  );
}
