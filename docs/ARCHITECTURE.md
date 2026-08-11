# Sigil Studio — Architecture

> Companion to the root [`CLAUDE.md`](../CLAUDE.md). **Read that first**: it holds
> the module map, the performance invariants, and the traps that fail silently.
> This document goes deep on the one thing that file only sketches — how a pixel
> becomes a glyph — and on the shapes the data takes on the way.

---

## The layering

```
                    App.tsx
                       │  two-pass debounce (draft budget, then full)
                       ▼
                  studio.ts                     orchestration
       prepareSource() ── decode + downscale to WORK_MAX
       render()        ── ENGINES[p.mode].run(...) + status line
                       │
                       ▼
                  engines.ts                    the registry: Record<Mode, Engine>
                       │
       ┌───────────────┼───────────────┬──────────────────┐
       ▼               ▼               ▼                  ▼
   contour.ts      spiral.ts        flow.ts          halftone.ts
       │               │               │                  │
       │  "here are some polylines"    │                  │  (no polylines:
       └───────────────┴───────────────┘                  │   a grid of cells)
                       ▼                                  │
                    draw.ts                               │
        sizing · text-on-path · mark stamping · stroke    │
                       │                                  │
              ┌────────┴────────┬─────────────┐           │
              ▼                 ▼             ▼           ▼
           ink.ts        placeMarks.ts    ribbon.ts     svg.ts
      tone + pressure    arc stations     the stroke   scaffolding
```

Three of the four engines only **find lines**. They hand a `Line[]` to `draw.ts`,
which owns everything after that: how big the type should be, how to lay it on a
curve, how to stamp marks instead, and how to emit the stroke underneath.

Halftone is the odd one out — it has no polylines at all, so it bypasses
`draw.ts` and emits its own grid. **That is why the `<defs>`/`<use>` emission
exists twice in the codebase**, and why a change to one copy has to be made to
the other. The suite asserts both copies in a single table for exactly this
reason.

## The canonical flow: an uploaded photo to a finished SVG

Traced through contour mode, which is the fullest path.

### 1. Decode and downscale — `studio.ts`

`prepareSource(img, flattenOn?)` draws the decoded image into an offscreen canvas
whose long side is `WORK_MAX` (1600px) and returns a `Source`:

```ts
interface Source {
  canvas: HTMLCanvasElement;
  width: number; height: number;      // the working copy
  srcWidth: number; srcHeight: number; // the original, for the status line
}
```

The full-size bitmap is dropped here and the object URL revoked. A 4000×3000
upload is 46MB decoded; at 1600 it is 7MB, and since every engine samples down to
a small luminance field anyway, the output is identical.

`flattenOn` composites onto a solid colour first. It is not optional for the
handwriting sheet — see step 6.

### 2. Luminance field — `render/imageField.ts`

```ts
interface LumField { width: number; height: number; lum: Float64Array }
```

`imageToField(img, srcW, srcH, targetLong, invert)` redraws the source at
`targetLong` and converts to Rec. 601 luma. Contour uses `targetLong = 220`;
contour cost scales with grid size, and 220 is enough to find tonal bands.
Halftone instead asks for ~2 samples per cell.

**The field reads only RGB.** Alpha is ignored, which is the single most
consequential fact in this file — see step 6.

`blurField(field, p.blur)` then box-blurs it, which is what stops the contour
tracer from chasing sensor noise.

### 3. Tonal bands to polylines — `render/contour.ts`

`p.detail` (3–14) becomes that many evenly spaced thresholds across 0–255.
`d3-contour` returns iso-lines at each; each ring is scaled from field space to
output space, simplified (Douglas–Peucker, `p.simplifyTolerance`), dropped if
shorter than `p.minContourLen`, and then **wobbled**.

The wobble is the idiosyncrasy engine: `buildNoise(seed, wobbleScale, octaves)`
sums seven octaves of value noise, and `wobblePolyline` displaces each vertex
along its normal by that much. This is the ported behaviour from the sigil
generator and is what stops the output looking machine-drawn.

Each survivor becomes a `Line`:

```ts
interface Line { d: string; len: number; pts: Pt[]; closed: boolean }
```

`pts` is kept alongside the serialised `d` because both mark stamping and tone
sampling need the geometry back.

### 4. Sizing — `render/draw.ts`

This is where the glyph budget is enforced, and it is worth understanding
precisely because it is the project's central performance constraint.

```ts
const budgetSize = totalLen / (budget * advance);
const baseSize   = sizeOverride ?? Math.max(wantSize, budgetSize);
```

Glyph count is `pathLen / (fontSize * advance)`, so a **fixed** font size makes
the count scale with path length without limit — a trivial shape once reached
47k glyphs and 250ms of blocking per slider tick. Sizing *up* to meet the budget
is what bounds it. `wantSize` is what you asked for (`TEXT_BASE * p.textScale`);
when the budget demands bigger type, `budgetSize` wins and `budgetBound` is
reported so the status line can say so.

`advance` comes from `primitive(p)`: `CHAR_ADVANCE` (0.48, a Georgia constant)
for text, or the mark set's own measured advance. Marks must supply their own or
every size and budget sum comes out wrong for them.

Spiral and flow bypass this by passing `sizeOverride`, because for them the line
spacing *is* the type size — a spiral's pitch is its line height. They compute
their own bound (widen the pitch, open the hatch) and report their own
`budgetBound`; `draw.ts` correctly reports `false` in that case.

### 5. Emission — `render/draw.ts` + `render/ink.ts`

Each `Line` becomes a `<path>` in `<defs>`, and a `<text><textPath href="#cN">`
referencing it. Inside, `buildTspans` wraps **every character in its own
`<tspan>`** carrying jittered size, stroke-width and opacity.

That per-glyph `<tspan>` is the slowest primitive in SVG (~6µs each to lay out),
and it is the reason the budget exists at all.

Tone modulation is the subtle part. The browser lays glyphs along a path and
**never reports where they landed**, so `ink.ts` reconstructs it:
`makeArcLookup(pts)` maps a distance along the polyline back to a point, the
glyph index times the advance gives that distance, and the field is sampled there
to get the local tone. Pressure comes from a second noise band set
(`PRESSURE_OCTAVES`) indexed by the same arc length, so the nib "presses" over
runs rather than per letter.

### 6. Marks, if a handwriting sheet was uploaded

`marks/extract.ts` runs **once per upload**, cached on `params.markSet` — never
in the render path, being orders of magnitude more expensive than a frame.

`imageToField` → `otsuThreshold` → `binarize` → `connectedComponents` (iterative
flood fill; a recursive one overflows on any real pen stroke) → `readingOrder`
→ `traceAll`.

Two decisions here carry more weight than they look:

- **The sheet must be flattened onto white first** (`prepareSource(img,
  "#ffffff")`). Because the field reads only RGB, a transparent-background PNG
  arrives as luminance 0 everywhere — indistinguishable from solid ink — and the
  entire page segments as one giant mark.
- **`traceAll` uses one shared scale for the whole set**, referenced to the
  *median* mark height. Normalising each mark to its own bounding box would
  flatten a tall `l` and a short `o` to the same height and destroy the
  handwriting; using the max instead of the median would let a single smudge
  rescale the alphabet.

```ts
interface Mark    { d: string; w: number; h: number; advance: number }
interface MarkSet { marks: Mark[]; unit: number; meanAdvance: number }
```

`readingOrder` groups rows by *vertical overlap* rather than centre distance, so
a tall letter and a short one on the same written line stay on the same row. It
is load-bearing rather than cosmetic: in spelling mode, mark #1 is keyed to the
first character of the mark key.

At emission, marks become `<defs>` paths referenced by `<use>` at each station
computed by `placeMarks.ts`. They must be **geometry, not references** — PNG
export rasterises the SVG through an `<img>`, which blocks external loads, so
anything still pointing at a `blob:` URL renders in the preview and silently
vanishes from the raster.

### 7. Assembly — `render/svg.ts`

`svgOpen` writes the XML prolog, both namespaces, the viewBox, a `<title>` as
the first child, and the paper rect; `svgClose` closes. The result is a string,
self-contained, with no external references.

## Why there is an engine registry

`src/lib/engines.ts` is `Record<Mode, Engine>`, and each entry carries everything
that distinguishes one mode from another: chip label, description, Detail range,
glyph-budget hint, and the render call — normalised to a common shape:

```ts
interface EngineRun {
  svg: string; glyphCount: number; budgetBound: boolean;
  lead: string;       // status-line fragment before the glyph count
  boundNote: string;  // how this engine made room, when the budget binds
}
```

Before it existed, a mode was declared in four places — the `Mode` union, a
dispatch if-chain, the chip labels, and a `detailRange` function — and they
drifted. Spiral and flow shipped while the Glyph budget hint still told you the
budget "caps the grid", which is halftone's behaviour and not theirs. Typing the
registry as `Record<Mode, Engine>` makes that a compile error: extend the union
and `tsc` demands the entry.

The per-engine `stats` fragments are formatted inside each entry because only the
engine knows what its numbers mean (turns, hatch lines, contours). Normalising to
`EngineRun` rather than exposing each engine's own result type keeps the registry
free of generics — the specific result stays fully typed inside the closure that
produced it.

## Testing shape

`src/test/fakeCanvas.ts` is a software canvas: a real RGBA buffer with
nearest-neighbour scaling and source-over compositing, patched over
`HTMLCanvasElement.prototype.getContext`. DOM coupling in `src/lib` is confined
to two files (`imageField.ts` and `exportFile.ts`), so this makes all four
engines runnable end to end in jsdom with no native dependencies.

The compositing is real rather than procedural on purpose: the flatten-on-white
invariant is *only* observable as an interaction between `fillRect`,
`drawImage`'s blend and `getImageData`. A stub whose pixels ignore what was drawn
reduces that test to "did `prepareSource` call `fillRect`", which still passes
with the bug fully reintroduced.

What the suite cannot cover: the PNG half of the marks trap. jsdom has no
`toBlob` and cannot decode an SVG, and node-canvas would only test *its* SVG
support. The string-level assertions (no external refs, every `<use>` target
resolves) are the proxy; **"ink present in the raster" remains a manual browser
step.**
