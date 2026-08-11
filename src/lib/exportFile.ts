// Export helpers — download the SVG as-is, or rasterize it to a PNG.

export function downloadSvg(svg: string, filename = "sigil.svg"): void {
  const blob = new Blob([svg], { type: "image/svg+xml" });
  triggerDownload(URL.createObjectURL(blob), filename);
}

/** Rasterize an SVG string to a PNG at `scale`× its intrinsic size. */
export function downloadPng(svg: string, filename = "sigil.png", scale = 2): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("2D context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("PNG encoding failed"));
          return;
        }
        triggerDownload(URL.createObjectURL(blob), filename);
        resolve();
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not rasterize SVG"));
    };
    img.src = url;
  });
}

/**
 * Object URLs live until revoked or the document unloads, so every download
 * used to pin its whole blob for the session. Revoking immediately would race
 * the download; one turn of the event loop after the click is enough.
 */
function triggerDownload(href: string, filename: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}
