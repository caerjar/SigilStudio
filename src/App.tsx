import { useEffect, useMemo, useRef, useState } from "react";
import { ControlPanel } from "./components/ControlPanel";
import { HelpPanel } from "./components/HelpPanel";
import { ImageDrop } from "./components/ImageDrop";
import { MarkStrip } from "./components/MarkStrip";
import { controlsFor } from "./controls";
import { ENGINES, MODES } from "./lib/engines";
import { demoSteps, STEP_MS } from "./lib/demo";
import { DEFAULT_PARAMS, DEFAULT_TEXT, type Mode, type RenderParams } from "./lib/params";
import { downloadPng, downloadSvg } from "./lib/exportFile";
import { extractMarks, SHEET_LONG } from "./lib/marks/extract";
import { loadImage, makeThumbnail, prepareSource, render, type Source } from "./lib/studio";
// Vite emits these as hashed asset URLs, so they are fetched once and cached
// rather than inlined into the bundle. Both are 1000x1000 at 72dpi; every engine
// reduces the source to a luminance field of at most 280px, and the sheet is
// read at SHEET_LONG (700), so nothing downstream can see more than this.
import defaultImage from "./assets/split-rock.jpg";
import defaultSheet from "./assets/marks-sheet.jpg";

// Rendering costs ~linear in glyph count, and a full-budget pass is far too slow
// to run while you are still moving a control. Debouncing alone does not save
// it: one 12k-glyph pass blocks ~400ms, which pushes your next input past the
// settle window, which triggers ANOTHER full pass — the drag jams itself in a
// feedback loop. Measured on a 60fps sweep: 5.2s of blocking, and a sweep that
// should take 0.4s took 6.5s.
//
// So there are two passes. A cheap draft keeps the preview live under your hand
// while you move; the real one runs once you stop. Draft is throttled (you get
// one at least every DRAFT_EVERY_MS mid-drag), full is debounced.
const DRAFT_BUDGET = 2500;
const DRAFT_EVERY_MS = 120;
const FULL_SETTLE_MS = 400;

/** Object URLs are ours to free; the bundled default asset's URL is not. */
function revokeIfBlob(url: string): void {
  if (url.startsWith("blob:")) URL.revokeObjectURL(url);
}

export default function App() {
  const [params, setParams] = useState<RenderParams>({ ...DEFAULT_PARAMS, text: DEFAULT_TEXT });
  // Opens on a worked example rather than an empty stage: a rose window is
  // radially symmetric and high-contrast, so every engine has something to find
  // and you can see what the tool does before deciding what to feed it.
  const [url, setUrl] = useState<string | null>(defaultImage);
  const [fileName, setFileName] = useState<string | null>("split-rock.jpg");
  const [thumb, setThumb] = useState<string | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [svg, setSvg] = useState<string>("");
  const [stats, setStats] = useState<string>("");
  // `stats` updates on every throttled draft pass (~8x a second mid-drag), so it
  // cannot be the live region — it would flood a screen reader and be worse than
  // silence. `announce` carries only settled renders.
  const [announce, setAnnounce] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorDetails, setErrorDetails] = useState<{message: string, code?: string} | null>(null);
  const [performanceWarning, setPerformanceWarning] = useState<string | null>(null);
  const renderId = useRef(0);
  const lastDraft = useRef(0);

  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef<HTMLElement>(null);
  const helpBtnRef = useRef<HTMLButtonElement>(null);

  const [demoOn, setDemoOn] = useState(false);
  const [demoStep, setDemoStep] = useState(0);

  // A sheet is loaded from the start so the handwriting toggle has something to
  // turn on, but it does NOT switch the render over to it — see the effect below.
  const [sheetUrl, setSheetUrl] = useState<string | null>(defaultSheet);
  const [sheetName, setSheetName] = useState<string | null>("marks-sheet.jpg");
  const [sheetThumb, setSheetThumb] = useState<string | null>(null);
  const [sheetSource, setSheetSource] = useState<Source | null>(null);
  const [marksNote, setMarksNote] = useState<string>("");
  // True only for the extraction that follows a user's own upload, so tuning the
  // threshold later never silently switches you into marks mode.
  const freshUpload = useRef(false);

  // decode the upload once, downscale it to a working canvas, then let go of
  // both the object URL and the full-size bitmap.
  useEffect(() => {
    if (!url) return;
    let live = true;
    setIsLoading(true);
    loadImage(url)
      .then((image) => {
        if (!live) return;
        const next = prepareSource(image);
        setSource(next);
        // From the working canvas, not the object URL: that is revoked below and
        // the full bitmap goes with it, so a blob: reference would break.
        setThumb(makeThumbnail(next.canvas, next.width, next.height));
      })
      .catch((e) => {
        live && setError("Failed to load image");
        setErrorDetails({message: String(e), code: "IMAGE_LOAD_ERROR"});
      })
      // Only blob: URLs are ours to revoke. The bundled default is a plain asset
      // URL; revoking it is a no-op today, but saying so keeps it that way.
      .finally(() => {
        revokeIfBlob(url);
        setIsLoading(false);
      });
    return () => {
      live = false;
    };
  }, [url]);

  // Decode the sheet ONCE per upload and keep the working canvas, so the
  // threshold and speck controls can re-read it without the file. It is kept at
  // SHEET_LONG rather than WORK_MAX because that is all `extractMarks` samples —
  // ~2MB instead of up to 7MB for a copy nothing can see the detail of.
  //
  // flattenOn white matters — imageToField reads only RGB, so a transparent
  // PNG would arrive as luminance 0 and the whole sheet would read as one mark.
  useEffect(() => {
    if (!sheetUrl) return;
    let live = true;
    setIsLoading(true);
    loadImage(sheetUrl)
      .then((image) => {
        if (!live) return;
        const sheet = prepareSource(image, "#ffffff", SHEET_LONG);
        // set before any marks check: seeing what was read matters most when
        // nothing was found on it
        setSheetThumb(makeThumbnail(sheet.canvas, sheet.width, sheet.height));
        // An upload is a request to use it; the sheet that ships with the app is
        // not. blob: is exactly the "the user chose this" signal.
        freshUpload.current = sheetUrl.startsWith("blob:");
        setSheetSource(sheet);
      })
      .catch((e) => {
        live && setError("Failed to load sheet");
        setErrorDetails({message: String(e), code: "SHEET_LOAD_ERROR"});
      })
      .finally(() => {
        revokeIfBlob(sheetUrl);
        setIsLoading(false);
      });
    return () => {
      live = false;
    };
  }, [sheetUrl]);

  // Vectorise. Re-runs when you change how the sheet is read, and at no other
  // time — this is still emphatically not the render path, which re-runs on
  // every param change and would be orders of magnitude too slow for this.
  useEffect(() => {
    const sheet = sheetSource;
    if (!sheet) return;
    const r = extractMarks(sheet.canvas, sheet.width, sheet.height, {
      threshold: params.markAutoThreshold ? null : params.markThreshold,
      minAreaFrac: params.markMinAreaPct / 100,
    });
    const wasFresh = freshUpload.current;
    freshUpload.current = false;

    if (r.markSet.marks.length === 0) {
      setMarksNote(
        params.markAutoThreshold
          ? "No marks found on that sheet — is it blank, or very faint?"
          : `No marks at threshold ${params.markThreshold} — try raising it, or switch the threshold back to automatic.`,
      );
      setParams((p) => ({ ...p, markSet: null }));
      return;
    }
    setMarksNote(
      `${r.found} marks` +
        (r.dropped > 0 ? ` · ${r.dropped} specks ignored` : "") +
        ` · threshold ${r.threshold}`,
    );
    setParams((p) => ({
      ...p,
      markSet: r.markSet,
      markSource: p.markSource === "text" && wasFresh ? "sequence" : p.markSource,
    }));
  }, [sheetSource, params.markAutoThreshold, params.markThreshold, params.markMinAreaPct]);

  // The tour is an OVERLAY on your params, never a write to them: it shows a
  // different view of your settings and leaves them exactly as you left them,
  // so stopping it puts you back where you were with nothing to undo.
  const steps = useMemo(() => demoSteps(Boolean(params.markSet)), [params.markSet]);
  const step = demoOn ? steps[demoStep % steps.length] : null;
  const shown = useMemo(
    () => (step ? { ...params, ...step.patch } : params),
    [params, step],
  );

  useEffect(() => {
    if (!demoOn) return;
    const t = setTimeout(() => setDemoStep((i) => (i + 1) % steps.length), STEP_MS);
    return () => clearTimeout(t);
  }, [demoOn, demoStep, steps.length]);

  // Any deliberate change is a request to drive it yourself.
  const applyParams = (next: React.SetStateAction<RenderParams>) => {
    setDemoOn(false);
    setParams(next);
  };

  // Re-render whenever the image or params change. setTimeout rather than rAF:
  // unlike rAF it still fires in a background tab.
  useEffect(() => {
    if (!source) return;
    const id = ++renderId.current;

    const run = (use: RenderParams, draft: boolean) => {
      if (id !== renderId.current) return;
      try {
        const out = render(source, use);
        setSvg(out.svg);
        setStats(draft ? `${out.stats} · draft` : out.stats);
        if (!draft) setAnnounce(out.stats);
        setError("");
        
        // Check for performance warnings
        if (out.stats.includes("ms") && !draft) {
          const msMatch = out.stats.match(/(\d+)ms/);
          if (msMatch && parseInt(msMatch[1]) > 2000) {
            setPerformanceWarning(`This render is taking longer than expected (${msMatch[1]}ms). Consider reducing the glyph budget or simplifying the image.`);
          } else {
            setPerformanceWarning(null);
          }
        }
      } catch (e) {
        setError(String(e));
      }
    };

    const needsDraft = shown.glyphBudget > DRAFT_BUDGET;
    const sinceDraft = performance.now() - lastDraft.current;
    const draftTimer = needsDraft
      ? setTimeout(
          () => {
            lastDraft.current = performance.now();
            run({ ...shown, glyphBudget: DRAFT_BUDGET }, true);
          },
          Math.max(0, DRAFT_EVERY_MS - sinceDraft),
        )
      : undefined;

    const fullTimer = setTimeout(() => run(shown, false), needsDraft ? FULL_SETTLE_MS : 120);

    return () => {
      if (draftTimer !== undefined) clearTimeout(draftTimer);
      clearTimeout(fullTimer);
    };
  }, [source, shown]);

  const controls = useMemo(() => controlsFor(shown.mode), [shown.mode]);

  const switchMode = (mode: Mode) => {
    const detail = ENGINES[mode].detail.def;
    applyParams((p) => ({ ...p, mode, detail }));
  };

  // The help panel replaces the stage, so opening it without moving focus would
  // leave a keyboard user stranded in the header with nothing announced. Focus
  // goes in on open; the close path restores it in the handler rather than here,
  // so this effect can never steal focus during an unrelated re-render.
  useEffect(() => {
    if (helpOpen) helpRef.current?.focus();
  }, [helpOpen]);

  const closeHelp = () => {
    setHelpOpen(false);
    helpBtnRef.current?.focus();
  };

  // The rendered SVG is thousands of <tspan> nodes; role="img" collapses that
  // subtree to a single named image, so this label is the only thing announced.
  const previewLabel =
    `${ENGINES[shown.mode].label} rendering of ${fileName ?? "your image"}` +
    (stats ? `, ${stats}` : "");

  return (
    <div className="app">
      <header>
        <h1>Sigil Studio</h1>
        <span className="header-spacer" />
        {/* A real two-state control, so aria-pressed rather than aria-expanded:
            it changes what the stage is doing, it does not reveal a region. */}
        <button
          type="button"
          className={`chip ${demoOn ? "chip-on" : ""}`}
          aria-pressed={demoOn}
          onClick={() => {
            setDemoStep(0);
            setDemoOn((on) => !on);
            if (helpOpen) closeHelp();
          }}
        >
          {demoOn ? "Stop tour" : "Take the tour"}
        </button>
        {/* A disclosure, not a toggle button: aria-expanded, and a name that
            stays "Help" so the control doesn't change identity under the user. */}
        <button
          type="button"
          ref={helpBtnRef}
          className={`chip ${helpOpen ? "chip-on" : ""}`}
          aria-expanded={helpOpen}
          aria-controls="stage-help"
          onClick={() => (helpOpen ? closeHelp() : setHelpOpen(true))}
        >
          Help
        </button>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <ImageDrop
            fileName={fileName}
            thumbnail={thumb}
            onImage={(next, name) => {
              setUrl(next);
              setFileName(name);
              setThumb(null); // drop the old preview until the new one decodes
            }}
          />

          {/* aria-pressed rather than a radiogroup: single-select is truer, but
              radio semantics oblige roving tabindex and arrow-key nav for a
              marginal gain on four buttons. */}
          <div className="modes" role="group" aria-label="Render mode">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                className={`chip ${shown.mode === m ? "chip-on" : ""}`}
                aria-pressed={shown.mode === m}
                onClick={() => switchMode(m)}
              >
                {ENGINES[m].label}
              </button>
            ))}
          </div>

          <label className="control">
            <span className="control-label">Text</span>
            <textarea
              value={params.text}
              rows={6}
              onChange={(e) => setParams((p) => ({ ...p, text: e.target.value }))}
            />
          </label>

          <ImageDrop
            fileName={sheetName}
            thumbnail={sheetThumb}
            label="Drop a sheet of your handwriting or drawn marks"
            onImage={(next, name) => {
              setSheetUrl(next);
              setSheetName(name);
              setSheetThumb(null);
            }}
          />
          {params.markSet ? <MarkStrip set={params.markSet} ink={params.palette.ink} /> : null}
          {/* Always mounted, so the announcement fires when it fills: vectorising
              is async and "No marks found on that sheet" is otherwise a result a
              screen-reader user never learns about. */}
          <p className="status" role="status">
            {marksNote}
          </p>

          <ControlPanel
            controls={controls}
            mode={shown.mode}
            params={shown}
            onChange={applyParams}
          />

          <div className="export">
            <button type="button" className="chip" disabled={!svg} onClick={() => downloadSvg(svg)}>
              Export SVG
            </button>
            <button
              type="button"
              className="chip"
              disabled={!svg}
              onClick={() => void downloadPng(svg)}
            >
              Export PNG
            </button>
          </div>

          {/* Visible text, deliberately NOT a live region — see `announce`. */}
          <p className="status">{error ? <span className="err">{error}</span> : stats}</p>
          
          {/* Performance warning */}
          {performanceWarning && (
            <div className="performance-warning">
              ⚠️ {performanceWarning}
            </div>
          )}
          
          {/* Loading indicator */}
          {isLoading && (
            <div className="loading">
              <span className="loading-spinner" aria-hidden="true">⏳</span>
              <span className="loading-text">Processing...</span>
            </div>
          )}
          
          {/* Error details for debugging */}
          {errorDetails && (
            <details className="error-details">
              <summary className="error-summary">Error details</summary>
              <pre className="error-pre">{errorDetails.message}</pre>
            </details>
          )}
          
          {/* Announced separately: settled renders politely, errors assertively.
              Both stay mounted with empty content so the change is what fires. */}
          <p className="sr-only" role="status">
            {announce}
          </p>
          <p className="sr-only" role="alert">
            {error}
          </p>
        </aside>

        {/* Both children stay mounted and swap with `hidden`, so closing help
            doesn't re-parse thousands of SVG nodes through innerHTML. */}
        <main className="stage">
          <div hidden={helpOpen} className="stage-render">
            {/* Captions the tour rather than the render, so it appears only when
                something is narrating. aria-live, because the picture changing
                under you is the one thing a screen reader cannot see. */}
            {step ? (
              <figcaption className="tour" role="status">
                <b>{step.title}</b>
                <span>{step.note}</span>
                <i aria-hidden="true">
                  {(demoStep % steps.length) + 1} / {steps.length}
                </i>
              </figcaption>
            ) : null}
            {svg ? (
              <div
                className="preview"
                // Collapses ~6,000 <tspan> nodes to one named image. Without it a
                // screen reader reads the whole passage aloud, once per repeat.
                role="img"
                aria-label={previewLabel}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ) : (
              <div className="empty">Upload an image to begin.</div>
            )}
          </div>

          <div hidden={!helpOpen}>
            <HelpPanel ref={helpRef} onClose={closeHelp} />
          </div>
        </main>
      </div>
    </div>
  );
}
