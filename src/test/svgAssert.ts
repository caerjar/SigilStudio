import { expect } from "vitest";

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

/** Parse and assert well-formedness. */
export function parseSvg(svg: string): Document {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  // Two checks, because `parsererror` is a non-standard implementation detail
  // and a malformed document can also simply come back with the wrong root.
  expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
  expect(doc.documentElement.nodeName).toBe("svg");
  return doc;
}

/** Prolog, namespaces and a real viewBox — the "self-contained SVG" convention. */
export function expectWellFormedHeader(svg: string): Document {
  expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  const doc = parseSvg(svg);
  const root = doc.documentElement;
  expect(root.getAttribute("xmlns")).toBe(SVG_NS);
  expect(root.getAttribute("xmlns:xlink")).toBe(XLINK_NS);
  for (const attr of ["viewBox", "width", "height"]) {
    expect(root.getAttribute(attr)).toBeTruthy();
  }
  return doc;
}

/**
 * Every reference must be a same-document fragment that actually resolves.
 *
 * This is the automated half of the marks trap: PNG export rasterises the SVG
 * through an <img>, which blocks external loads, so anything still pointing at a
 * blob: URL renders in the preview and vanishes from the raster. Note we can't
 * simply grep for "http" — the root legitimately carries two xmlns declarations.
 */
export function auditRefs(doc: Document): { uses: number; refs: string[] } {
  const ids = new Set(
    [...doc.querySelectorAll("[id]")].map((e) => e.getAttribute("id") as string),
  );
  const refs: string[] = [];

  for (const el of doc.querySelectorAll("*")) {
    for (const attr of el.attributes) {
      const local = attr.name.replace(/^.*:/, "");
      const isUrlFunc = /^url\(/.test(attr.value);
      if (local !== "href" && !isUrlFunc) continue;
      const target = attr.value.replace(/^url\(['"]?|['"]?\)$/g, "");
      expect(target.startsWith("#")).toBe(true);
      expect(ids.has(target.slice(1))).toBe(true);
      refs.push(target);
    }
  }

  expect(doc.querySelectorAll("image")).toHaveLength(0);
  expect(doc.documentElement.outerHTML).not.toMatch(/blob:|data:/);
  return { uses: doc.querySelectorAll("use").length, refs };
}

/** Derived shape for snapshots — never snapshot the SVG string itself. */
export function fingerprint(doc: Document): Record<string, number> {
  return {
    defs: doc.querySelectorAll("defs > *").length,
    uses: doc.querySelectorAll("use").length,
    texts: doc.querySelectorAll("text").length,
    tspans: doc.querySelectorAll("tspan").length,
    textPaths: doc.querySelectorAll("textPath").length,
    paths: doc.querySelectorAll("path").length,
  };
}
