// Halftone engine: fill the image area with the text, one glyph per grid cell,
// each glyph sized / weighted / darkened by that cell's brightness. Dark regions
// read as dense, bold, opaque type; light regions as sparse and faint — the
// photograph rendered in language.

import { uniform, mulberry32 } from "../rng";
import { normalizeText } from "../fitText";
import { xmlEscape } from "../tspans";
import type { RenderParams } from "../params";
import type { MarkSet } from "../marks/trace";
import { blurField, imageToField, sampleField } from "./imageField";
import { outputSize, svgClose, svgOpen } from "./svg";
import { buildSequence } from "./placeMarks";

export interface HalftoneResult {
  svg: string;
  glyphCount: number;
  budgetBound: boolean; // true when the glyph budget forced a coarser grid
}

export function renderHalftone(
  img: CanvasImageSource,
  srcW: number,
  srcH: number,
  p: RenderParams,
): HalftoneResult {
  const out = outputSize(srcW, srcH, p.canvasLong);

  // detail -> number of square cells across the width. Cells are square, so
  // ny ≈ nx * aspect and the grid holds ~nx² * aspect glyphs; clamp nx so that
  // stays inside the budget.
  const aspect = out.height / out.width;
  const maxNx = Math.floor(Math.sqrt(Math.max(64, p.glyphBudget) / Math.max(aspect, 1e-6)));
  const wantNx = Math.max(4, Math.round(p.detail));
  const nx = Math.max(4, Math.min(wantNx, maxNx));
  const budgetBound = nx < wantNx;
  const cell = out.width / nx;
  const ny = Math.max(1, Math.round(out.height / cell));

  const fieldLong = Math.max(nx, ny) * 2; // ~2 field samples per cell
  let field = imageToField(img, srcW, srcH, fieldLong, p.invert);
  field = blurField(field, p.blur);

  const rng = mulberry32(p.seed ^ 0x85ebca6b);
  const chars = [...normalizeText(p.text).replace(/\s+/g, "")]; // drop spaces; glyphs only
  if (chars.length === 0) {
    return { svg: svgOpen(out, p.palette, p.fontFamily) + svgClose(), glyphCount: 0, budgetBound };
  }

  const set = p.markSet;
  const useMarks = p.markSource !== "text" && !!set && set.marks.length > 0;
  const seq = useMarks ? buildSequence(p, set as MarkSet) : [];
  const usable = useMarks && seq.length > 0;

  let ci = 0;
  const next = () => chars[ci++ % chars.length];
  let mi = 0;
  const nextMark = (): number | null => seq[mi++ % seq.length];

  let glyphs = "";
  let count = 0;
  const gxScale = field.width / nx;
  const gyScale = field.height / ny;

  for (let row = 0; row < ny; row++) {
    // boustrophedon: alternate direction each row so the text snakes
    const cells: number[] = [];
    for (let c = 0; c < nx; c++) cells.push(c);
    if (row % 2 === 1) cells.reverse();

    for (const col of cells) {
      const lum = sampleField(field, (col + 0.5) * gxScale, (row + 0.5) * gyScale);
      const darkness = 1 - lum / 255; // 0 (light) .. 1 (dark)
      if (darkness < p.darknessFloor) continue;

      const cx = (col + 0.5) * cell;
      const cy = (row + 0.5) * cell;
      // size: faint→small, dark→fills the cell. textScale is the user knob.
      // Halftone reads tone by construction — a cell's glyph is already sized
      // by its own brightness — so toneToSize/toneToWeight only scale how hard
      // that mapping bites, rather than introducing it.
      const toneSize = 1 - p.toneToSize + p.toneToSize * (0.35 + 0.95 * darkness) * 1.45;
      const size = cell * toneSize * p.textScale * uniform(rng, p.jitter.sizeMin, p.jitter.sizeMax);
      const weight =
        p.strokeWidth *
        (1 - p.toneToWeight + p.toneToWeight * darkness * 2) *
        uniform(rng, p.jitter.weightMin, p.jitter.weightMax);
      const opacity = Math.min(1, (0.35 + 0.75 * darkness) * uniform(rng, p.jitter.opacityMin, p.jitter.opacityMax));

      if (usable) {
        const k = nextMark();
        if (k === null) continue;
        // <use> is authored centred on the origin, so no baseline fudge here.
        const scale = size / (set as MarkSet).unit;
        let attrs =
          ` transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) scale(${scale.toFixed(3)})"`;
        if (opacity <= 0.995) attrs += ` fill-opacity="${opacity.toFixed(2)}"`;
        glyphs += `<use xlink:href="#m${k}" href="#m${k}"${attrs}/>`;
        count++;
        continue;
      }

      // fill / stroke / text-anchor are identical on every glyph — they are set
      // once on the parent <g> and inherited, which is ~40% of the bytes here.
      glyphs +=
        `<text x="${cx.toFixed(1)}" y="${(cy + size * 0.34).toFixed(1)}" ` +
        `font-size="${size.toFixed(1)}" fill-opacity="${opacity.toFixed(2)}" ` +
        `stroke-width="${weight.toFixed(2)}">` +
        `${xmlEscape(next())}</text>`;
      count++;
    }
  }

  const defs = usable
    ? `  <defs>\n    ${(set as MarkSet).marks
        .map((m, i) => `<path id="m${i}" d="${m.d}" vector-effect="non-scaling-stroke"/>`)
        .join("\n    ")}\n  </defs>\n`
    : "";
  const body =
    defs +
    `  <g font-family="${p.fontFamily}" text-anchor="middle" ` +
    `fill="${p.palette.ink}" stroke="${p.palette.ink}"` +
    (usable
      ? ` stroke-width="${p.strokeWidth.toFixed(2)}" stroke-linejoin="round" ` +
        `stroke-linecap="round" fill-rule="nonzero"`
      : "") +
    `>${glyphs}</g>\n`;
  const svg = svgOpen(out, p.palette, p.fontFamily) + body + svgClose();
  return { svg, glyphCount: count, budgetBound };
}
