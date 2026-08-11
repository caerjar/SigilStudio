# Sigil Studio

**[Try it →](https://caerjar.github.io/SigilStudio/)**

Recreate an uploaded image out of text. Four engines:

- **Contour trace** — finds tonal outlines and flows text along them
- **Spiral** — draws the whole picture as one unbroken line
- **Flow field** — lays hatching that follows form
- **Typographic halftone** — one glyph per grid cell

Everything runs **client-side in the browser** — no backend, no network calls.

## Quick Start

1. Upload an image
2. Paste text
3. Pick an engine
4. Adjust **Detail** 
5. Export SVG/PNG

## Run

```bash
npm install && npm run dev      # http://localhost:5173
```

```bash
npm run check                   # typecheck + tests
npm run build                   # production build to dist/
```

## Documentation

- [docs/USER_MANUAL.md](docs/USER_MANUAL.md) — how to drive it
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how a pixel becomes a glyph
- [CLAUDE.md](CLAUDE.md) — performance invariants and traps
