import { GROUP_ORDER, type Control } from "../controls";
import type { Mode, RenderParams } from "../lib/params";
import { DEFAULT_PARAMS } from "../lib/params";

interface Props {
  controls: Control[];
  mode: Mode;
  params: RenderParams;
  onChange: (next: RenderParams) => void;
}

export function ControlPanel({ controls, mode, params, onChange }: Props) {
  const groups = GROUP_ORDER.filter((g) => controls.some((c) => c.group === g));
  
  const handleReset = () => {
    onChange(DEFAULT_PARAMS);
  };
  
  return (
    <div className="panel">
      {groups.map((g) => (
        <details key={g} open={g === "General"} className="group">
          <summary>{g}</summary>
          <div className="group-body">
            {controls
              .filter((c) => c.group === g)
              .map((c) => (
                <ControlRow key={c.id} control={c} mode={mode} params={params} onChange={onChange} />
              ))}
          </div>
        </details>
      ))}
      <div className="control">
        <button type="button" className="chip" onClick={handleReset}>
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

function ControlRow({
  control: c,
  mode,
  params,
  onChange,
}: {
  control: Control;
  mode: Mode;
  params: RenderParams;
  onChange: (next: RenderParams) => void;
}) {
  const value = c.get(params);

  // Toggles and colours are laid out in a row, so their hint goes underneath
  // rather than beside. They used to render no hint at all — the strings were
  // written in the registry and simply never reached the DOM.
  if (c.kind === "toggle") {
    return (
      <div className="control">
        <label className="control-inline">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(c.set(params, e.target.checked))}
          />
          <span className="control-label">{c.label(mode)}</span>
        </label>
        <span className="control-hint">{c.hint(mode)}</span>
      </div>
    );
  }

  if (c.kind === "color") {
    return (
      <div className="control">
        <label className="control-inline">
          <input
            type="color"
            value={String(value)}
            onChange={(e) => onChange(c.set(params, e.target.value))}
          />
          <span className="control-label">
            {c.label(mode)} <em>{String(value)}</em>
          </span>
        </label>
        <span className="control-hint">{c.hint(mode)}</span>
      </div>
    );
  }

  if (c.kind === "select") {
    return (
      <label className="control">
        <span className="control-label">{c.label(mode)}</span>
        <select value={String(value)} onChange={(e) => onChange(c.set(params, e.target.value))}>
          {(c.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="control-hint">{c.hint(mode)}</span>
      </label>
    );
  }

  if (c.kind === "text") {
    return (
      <label className="control">
        <span className="control-label">{c.label(mode)}</span>
        <input
          type="text"
          value={String(value)}
          spellCheck={false}
          onChange={(e) => onChange(c.set(params, e.target.value))}
        />
        <span className="control-hint">{c.hint(mode)}</span>
      </label>
    );
  }

  return (
    <label className="control">
      <span className="control-label">
        {c.label(mode)} <em>{formatValue(c.id, Number(value))}</em>
      </span>
      <input
        type="range"
        min={c.min}
        max={c.max}
        step={c.step}
        value={Number(value)}
        onChange={(e) => onChange(c.set(params, Number(e.target.value)))}
      />
      <span className="control-hint">{c.hint(mode)}</span>
    </label>
  );
}

function formatValue(id: string, v: number): string {
  if (id === "textScale" || id === "wobbleScale") return `${v.toFixed(2)}×`;
  if (id === "glyphBudget") return v.toLocaleString();
  if (id === "strokeWidth" || id === "lineWidth") return `${v.toFixed(2)}px`;
  if (id === "markMinAreaPct") return `${v.toFixed(3)}%`;
  if (
    id === "detail" ||
    id === "seed" ||
    id === "canvasLong" ||
    id === "minContourLen" ||
    id === "markThreshold"
  ) {
    return String(Math.round(v));
  }
  return v.toFixed(2);
}
