import type { MarkSet } from "../lib/marks/trace";

interface Props {
  set: MarkSet;
  ink: string;
}

/**
 * The marks we found, in reading order, numbered.
 *
 * This is not decoration: in "spelling the text" mode the mark key maps mark #1
 * to the key's first character, so you cannot use that mode at all unless you
 * can see which mark we think is #1 and whether the order matches what you wrote.
 * It is also how you notice that a smudge got picked up as a mark.
 */
export function MarkStrip({ set, ink }: Props) {
  if (set.marks.length === 0) return null;
  return (
    // Named as a group, because the numbers alone ("1 2 3 4 5…") tell a screen
    // reader nothing about what they are or why the order matters.
    <div
      className="marks"
      role="group"
      aria-label={`${set.marks.length} marks found, in reading order`}
    >
      {set.marks.map((m, i) => {
        // marks are authored centred on the origin
        const pad = set.unit * 0.15;
        const w = m.w + pad * 2;
        const h = m.h + pad * 2;
        return (
          <span className="mark" key={i} title={`mark #${i + 1}`}>
            {/* the shape is the decoration; the index next to it is the content */}
            <svg
              viewBox={`${-w / 2} ${-h / 2} ${w} ${h}`}
              width="34"
              height="34"
              aria-hidden="true"
            >
              <path d={m.d} fill={ink} fillRule="nonzero" />
            </svg>
            <em>{i + 1}</em>
          </span>
        );
      })}
    </div>
  );
}
