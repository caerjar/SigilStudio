// SVG assembly helpers shared by every engine.

import type { Palette } from "../params";
import type { Pt } from "../noise";
import { xmlEscape } from "../tspans";

export interface Sized {
  width: number;
  height: number;
}

/** Output canvas size from image aspect, scaled so the long side = `long`. */
export function outputSize(srcW: number, srcH: number, long: number): Sized {
  const scale = long / Math.max(srcW, srcH);
  return { width: Math.round(srcW * scale), height: Math.round(srcH * scale) };
}

/**
 * `title` names the exported file for anyone opening it on its own — a reader
 * would otherwise meet a few thousand unlabelled <tspan>s. It must be the FIRST
 * child of <svg> to count as the document title; anywhere else it is just a
 * tooltip. Safe for the PNG path: <title> is metadata and is ignored when an SVG
 * is decoded as an image.
 *
 * It defaults rather than being threaded down from the engine on purpose. The
 * engine name lives in the ENGINES registry, and importing that here would close
 * an engines -> contour -> engines cycle just to restate a label the registry
 * already owns.
 */
export function svgOpen(
  size: Sized,
  palette: Palette,
  fontFamily: string,
  title = "An image drawn in text — Sigil Studio",
): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `viewBox="0 0 ${size.width} ${size.height}" width="${size.width}" height="${size.height}" ` +
    `font-family="${fontFamily}" role="img">\n` +
    (title ? `  <title>${xmlEscape(title)}</title>\n` : "") +
    `  <rect x="0" y="0" width="${size.width}" height="${size.height}" fill="${palette.paper}"/>\n`
  );
}

export function svgClose(): string {
  return `</svg>\n`;
}

/**
 * One polyline as an SVG subpath (M … L … [Z]). Coordinates are in a canvas of
 * ~1000px, so 0.1px precision is well below anything visible; the extra digit
 * costs bytes on every vertex of every contour.
 */
export function subpath(points: Pt[], close: boolean): string {
  if (points.length === 0) return "";
  const parts: string[] = [`M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`];
  for (let i = 1; i < points.length; i++) {
    parts.push(`L${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`);
  }
  if (close) parts.push("Z");
  return parts.join("");
}

export function polylineLength(points: Pt[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
}
