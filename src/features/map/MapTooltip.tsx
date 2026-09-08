import { cx } from '../bench/lib/tokens';
import { STATUS_META } from '../bench/lib/tokens';
import type { MapPoint } from './lib/geometry';

export interface MapTooltipProps {
  point: MapPoint;
  x: number;
  y: number;
}

/** A real card, not a native title tooltip — per BLUEPRINT-v2.md "tooltips are real cards." */
export function MapTooltip({ point, x, y }: MapTooltipProps) {
  const meta = STATUS_META[point.status] ?? STATUS_META.active;
  return (
    <div
      role="tooltip"
      style={{ left: x, top: y }}
      className={`pointer-events-none absolute z-30 w-56 -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-[8px] border p-2 ${cx.surface} ${cx.shadow}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`truncate text-sm font-medium ${cx.ink}`}>{point.name}</span>
        <span className={`font-mono text-sm ${cx.accentText}`}>{Math.round(point.fit)}</span>
      </div>
      <div className={`mt-0.5 flex items-center gap-1.5 text-xs ${meta.textClass}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
        {meta.label} · {point.days}d since touch
      </div>
      <p className={`mt-1 text-xs ${cx.muted}`}>{point.why}</p>
    </div>
  );
}
