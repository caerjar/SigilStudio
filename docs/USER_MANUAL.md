# Sigil Studio — User Manual

> **Last updated:** 2026-08-05

Sigil Studio redraws a photograph out of text. You give it an image and some
words; it gives you back a drawing where every stroke is a letter — or, if you
like, a letter in your own handwriting.

Everything happens in your browser. The image is never uploaded anywhere.

---

## 1. What it is

Four different ways of turning tone into line:

| Engine | What it does | Reach for it when |
|---|---|---|
| **Contour trace** | Traces the boundaries between light and shade as separate lines, the way a contour map traces height | Faces, and anything with clear edges. It holds a likeness at small sizes. **Start here.** |
| **Spiral** | Draws the whole picture as one unbroken line winding out from the centre, thickening where the image is dark | A single centred subject. It is the only engine whose output is one continuous stroke, so it suits a pen plotter. |
| **Flow field** | Lays hatching that follows the form, turning to run along edges rather than across them | Texture, fabric, hair, landscape. The most painterly of the four. |
| **Typographic halftone** | One glyph per grid cell, sized by how dark that cell is | High-contrast images, and when you want the text to stay readable. The only engine that doesn't bend the type. |

---

## 2. Getting started

### Prerequisites

Node 22 or newer, or Docker.

### Setup

```bash
git clone <this repo>
cd sigil-studio
npm install
npm run dev            # http://localhost:5173
```

Or the Docker path, which needs nothing installed but Docker:

```bash
make dev               # http://127.0.0.1:5173
make help              # every target
```

---

## 3. The workflow

**1. Drop an image.** The app opens on a photograph so there is something to look
at immediately — drop your own over it whenever you like. A sheet of drawn marks
is loaded too, but it stays switched off until you tick **Draw with my
handwriting**.

Photographs with clear light and shade work best. Very flat or very busy images
give mush — try something with an obvious subject first. Large uploads are fine;
the app immediately downscales a working copy and throws the original away. A
thumbnail appears in the drop zone once it has decoded, so you can see at a
glance which file you actually picked.

**2. Paste your text.** Anything: a poem, a letter, one name repeated. The text
repeats as needed to fill the drawing, so a short phrase is fine. An empty text
box draws nothing — that is not a bug.

**3. Pick an engine,** then move **Detail** until the picture reads. Detail means
something different in each engine, so its slider range changes when you switch:

- Contour — how many tonal bands to trace (3–14)
- Spiral — the gap between turns, in px (6–80)
- Flow field — the gap between hatch lines, in px (4–60)
- Halftone — cells across (16–140)

**4. Export.** Everything else is refinement you can skip.

**In a hurry?** **Take the tour**, in the header, runs your own image through
every engine in turn and finishes with your marks. It is a preview, not a
reconfiguration: it never writes to your settings, so stopping it — or touching
any control — hands you back exactly what you had.

---

## 4. Reading the status line

Under the export buttons, something like:

```
1 unbroken line · 34 turns · 8,412 glyphs · 96ms · turns widened to 12px to fit the glyph budget
```

- **The lead** is engine-specific: contours found, turns, flow lines, or nothing
  at all for halftone.
- **Glyphs** is how many letters were drawn. This is the cost driver.
- **ms** is how long that render took.
- **"draft"** means you are looking at a cheap preview drawn while you were
  moving a control. The full render replaces it a moment after you stop.
- **The last clause**, when present, means the glyph budget bound and the engine
  made room. See below.

---

## 5. Every control

Controls are grouped, and each engine shows only the groups that apply to it.

### General

| Control | What it does |
|---|---|
| **Detail** | The main shape control. Means something different per engine — see §3. |
| **Text size** | How big the type wants to be. The glyph budget may override it upward. |
| **Glyph budget** | A ceiling on the total number of letters. **This is the responsiveness control.** |
| **Seed** | Scrub for a different idiosyncratic variation of the same settings. |
| **Smoothing (blur)** | Softens the image before tracing. Raise it if the drawing is chasing noise. |
| **Invert light / dark** | Trace the bright regions instead of the dark. |
| **Letter spacing** | Extra space between glyphs along the line. |
| **Canvas size** | The long side of the exported drawing, in px. |

**About the glyph budget.** Every letter is laid out individually, and that is
the slowest thing a browser does with SVG — so the count has to be bounded or a
detailed image will lock the page. When the budget binds, the engine makes room
rather than cutting your text short:

| Engine | How it makes room |
|---|---|
| Contour | grows the type |
| Spiral | widens the turns |
| Flow field | opens up the hatching |
| Halftone | coarsens the grid |

Raise it for a final export and lower it if dragging sliders feels sticky. The
status line always tells you which happened.

### Marks — drawing with your own handwriting

Drop a sheet of your own pen marks in the second drop zone and the drawing is
made of those instead of letters.

**Making a good sheet:** write on white paper, in dark ink, with clear space
between marks. Anything touching is read as one mark. A sheet is vectorised once,
when you drop it — it costs nothing per render afterwards.

The drop zone shows a thumbnail of the sheet as it was read, composited onto
white. That is worth a glance when nothing is found: it shows you what the
segmenter actually saw.

The numbered strip below the drop zone shows the marks in **reading order**. That
numbering matters: it is also how you spot a smudge that got picked up as a mark.

| Control | What it does |
|---|---|
| **Draw with my handwriting** | The on/off switch. Off draws with letters; on draws with the marks from the sheet. Turning it on selects the plain sequence — use the control below to change how the marks are used. |
| **Draw with** | *The text (font)* uses letters. *My marks, in sequence* stamps your marks in order, over and over. The spelling option maps each mark to a letter and writes your text with them. The brush option ignores order and picks by tone. |
| **Mark key** | Spelling mode only: which mark is which letter. The **1st** character here names mark **#1**, the 2nd names #2, and so on. |
| **Mark spacing** | Gap between stamped marks, as a fraction of their size. |
| **Find the ink automatically** | Otsu's method picks the ink/paper split for you. Turn it off if a faint or unevenly lit sheet is being read wrong. |
| **Ink threshold** | Anything this dark or darker counts as ink. Raise it to catch faint strokes, lower it to reject a grey background. Ignored while the setting above is on. |
| **Smallest mark** | Blobs smaller than this share of the sheet are binned as specks. |

Changing either of the last two re-reads the sheet immediately — the note under
the strip updates, so you can watch the counts move as you drag.

### Ink

| Control | What it does |
|---|---|
| **Pen pressure** | Weight varying in runs along the stroke, the way a nib does, rather than per letter. |
| **Tone → weight** | How much dark areas draw heavier. |
| **Tone → size** | How much dark areas draw bigger. |
| **Ink weight** | Outline weight on the glyphs themselves. |

Without tone modulation the drawing reads as a flat outline: the shapes are in
the right places but carry no light or shade.

### Line

| Control | What it does |
|---|---|
| **Draw the line itself** | Whether a line is drawn under the marks, and what kind. Defaults to *No line* — the marks *are* the line. |
| **Line width** | Width of that drawn line. |

### Contour / Halftone

| Control | What it does |
|---|---|
| **Wobble amount** | How much the traced lines wander off true. This is the hand-drawn quality; zero looks machine-made. |
| **Simplify** | Drops redundant vertices from traced lines. |
| **Drop small contours** | Discards outlines shorter than this — the despeckle control. |
| **Light cutoff** | Halftone only: cells lighter than this stay empty. |

### Letters

**Size jitter (min)**, **Size jitter (max)**, **Weight jitter** and **Faintest
ink** — the range each glyph is randomly scaled by. This is what makes the type
look hand-set rather than typeset. Narrow the ranges for a cleaner look.

### Colours

Ink and paper. The defaults are the house palette.

---

## 6. Exporting

- **SVG** — vector, infinitely scalable, and still real text. The right choice
  for printing, for a pen plotter, or for further editing in a vector editor.
- **PNG** — a fixed-resolution picture at the canvas size you set. Easier to
  share; what you see is what you get.

The SVG is self-contained: no external references, no linked images, nothing that
needs the internet to render.

---

## 7. Troubleshooting

**"No marks found on that sheet — is it blank, or very faint?"**
The sheet had no dark region big enough to count as a mark. Use darker ink, or
scan at higher contrast.

**All my handwriting came out as one mark.**
The marks are touching, or nearly. Leave clear space between them.

**I wrote 26 letters and it found 21, plus "60 specks ignored".**
A mark is **one connected blob of ink**. Any letter drawn with a pen lift splits
into two blobs — the dot of an `i` or `j`, the bar of a `t`, a thin stroke that
broke up — and the small piece is usually discarded as a speck.

Two controls fix this without rewriting the sheet:

- **Smallest mark** — lower it and those discarded dots come back as marks.
  Watch the counts under the strip as you drag; when *marks* stops rising and
  *specks* keeps falling, you have gone past useful and into paper grain.
- **Ink threshold** — turn off **Find the ink automatically** and raise it to
  catch strokes too faint to pass the automatic split.

A high speck count also points at a grey or textured background, where paper
grain crosses the threshold. Write with a single continuous stroke per mark
where you can, on clean white, and check the numbered strip against what you
wrote — the numbering is what spelling mode keys to.

**The spelling is wrong in spelling mode.**
Check the numbered strip. The mark key maps character *n* to mark *#n*, so if the
reading order isn't what you wrote, the mapping won't be either.

**The drawing is a grey mush.**
Too much detail for the subject. Lower Detail, raise Blur, or pick an image with
a clearer subject.

**Dragging sliders feels sticky.**
Lower the glyph budget. You will see "draft" in the status line while dragging;
that is the cheap preview doing its job.

**The output looks machine-drawn.**
Raise Wobble, and widen the per-letter jitter ranges under Letters.

**Nothing is drawn at all.**
Check the text box isn't empty.

---

## 8. Privacy

There is no server. The image is decoded and rendered entirely on the page, with
no upload, no analytics, and no network request of any kind. You can verify it:
open your browser's network tab and drop an image — nothing goes out.
