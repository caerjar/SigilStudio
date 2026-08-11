import { forwardRef } from "react";
import { ENGINES, MODES } from "../lib/engines";

interface Props {
  /** Close and hand focus back to the toggle. */
  onClose: () => void;
}

/**
 * What the app cannot teach through its control hints: which engine to reach
 * for, what order to do things in, and what the status line is telling you.
 *
 * This replaces the render in the stage rather than covering it, so the sidebar
 * stays live and you can move a control while reading about it. Engine
 * descriptions come from the registry (`ENGINES[m].blurb`), never restated
 * here — prose duplicated from the code is prose that goes stale.
 */
export const HelpPanel = forwardRef<HTMLElement, Props>(function HelpPanel({ onClose }, ref) {
  return (
    <section
      id="stage-help"
      ref={ref}
      className="help"
      // focusable programmatically when opened, but not a tab stop of its own
      tabIndex={-1}
      aria-labelledby="stage-help-heading"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <h2 id="stage-help-heading">How this works</h2>
      <p>
        Sigil Studio redraws an image out of text. Everything happens in this browser — the
        picture is never uploaded anywhere. Press <kbd>Esc</kbd> to close this panel.
      </p>
      <p>
        In a hurry? <strong>Take the tour</strong> runs your own image through every engine in
        turn, ending with your marks — then hands the controls back exactly as you left them.
      </p>

      <details className="group" open>
        <summary>The workflow</summary>
        <div className="group-body">
          <p>
            <strong>1. Drop an image.</strong> Photographs with clear light and shade work
            best. Very flat or very busy images give mush — try something with an obvious
            subject first.
          </p>
          <p>
            <strong>2. Paste your text.</strong> Anything: a poem, a letter, a name repeated.
            The text is repeated as needed to fill the drawing, so a short phrase is fine.
          </p>
          <p>
            <strong>3. Pick an engine</strong> from the four chips, then move{" "}
            <em>Detail</em> until the picture reads. Detail means something different in each
            engine, so its slider range changes when you switch.
          </p>
          <p>
            <strong>4. Export.</strong> Everything else — ink weight, wobble, colour — is
            refinement you can skip.
          </p>
        </div>
      </details>

      <details className="group">
        <summary>Choosing an engine</summary>
        <div className="group-body">
          <dl>
            {MODES.map((m) => (
              <div key={m}>
                <dt>{ENGINES[m].label}</dt>
                <dd>{ENGINES[m].blurb}</dd>
              </div>
            ))}
          </dl>
        </div>
      </details>

      <details className="group">
        <summary>Drawing with your own handwriting</summary>
        <div className="group-body">
          <p>
            Drop a sheet of your own marks in the second drop zone and the drawing can be
            made of those instead of letters. Write on white paper, in dark ink, with clear
            space between marks — anything touching is read as one mark.
          </p>
          <p>
            The strip below the drop zone numbers the marks in reading order. That numbering
            is load-bearing: in <em>spelling</em> mode, mark #1 is whatever the first
            character of the mark key is. If the numbers don't match what you wrote, the
            spelling will be wrong.
          </p>
          <p>
            <em>Sequence</em> stamps the marks in order, over and over.{" "}
            <em>Spelling</em> maps each mark to a letter and writes your text with them.{" "}
            <em>Brush</em> ignores order and picks by tone.
          </p>
        </div>
      </details>

      <details className="group">
        <summary>Reading the status line</summary>
        <div className="group-body">
          <p>
            Under the export buttons: how much line was drawn, how many glyphs it took, and
            how long it ran.
          </p>
          <p>
            <strong>“draft”</strong> means you are looking at a cheap preview drawn while you
            move a control. It is replaced by the full render a moment after you stop.
          </p>
          <p>
            <strong>Glyph budget</strong> is a ceiling on the total number of letters, and it
            is what keeps the app responsive. When it binds, the engine makes room rather
            than cutting your text short — the type grows, the spiral's turns widen, the
            hatching opens up, or the halftone grid coarsens. The status line says which
            happened.
          </p>
        </div>
      </details>

      <details className="group">
        <summary>Exporting</summary>
        <div className="group-body">
          <p>
            <strong>SVG</strong> is vector: infinitely scalable, still real text, and the
            right choice for printing, plotting, or further editing.
          </p>
          <p>
            <strong>PNG</strong> is a fixed-resolution picture — easier to share, but what
            you see is what you get.
          </p>
        </div>
      </details>

      <details className="group">
        <summary>Privacy</summary>
        <div className="group-body">
          <p>
            Your image never leaves this browser. There is no server, no upload, no
            analytics, and no network request of any kind — the whole renderer runs on this
            page. You can confirm it: open your browser's network tab and drop an image.
          </p>
        </div>
      </details>
    </section>
  );
});
