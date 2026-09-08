import { Avatar, FitRing, StatusChip } from '../../ui';
import type { TargetPoint } from './lib/geometry';

export interface MapTooltipProps {
  point: TargetPoint;
  x: number;
  y: number;
}

function clockLabel(days: number): string {
  if (days === 0) return 'touched today';
  if (days === 1) return 'touched 1 day ago';
  if (days >= 365) return 'touched 12+ months ago';
  if (days >= 30) {
    const months = Math.round(days / 30.4375);
    return `touched ~${months} month${months === 1 ? '' : 's'} ago`;
  }
  return `touched ${days} days ago`;
}

/** A real card, not a native title tooltip — per BLUEPRINT-v2.md "tooltips are real cards." */
export function MapTooltip({ point, x, y }: MapTooltipProps) {
  return (
    <div
      role="tooltip"
      style={{
        left: x,
        top: y,
        position: 'absolute',
        zIndex: 30,
        width: 248,
        transform: 'translate(-50%, calc(-100% - 14px))',
        padding: 10,
        pointerEvents: 'none',
        borderRadius: 'var(--radius-md)',
      }}
      className="smhq-surface smhq-shadow"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Avatar name={point.name} size={26} />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className="smhq-truncate" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink-strong)' }}>
            {point.name}
          </span>
          <span className="smhq-muted" style={{ fontSize: 11 }}>{clockLabel(point.warmthDays)}</span>
        </span>
        <FitRing value={point.fit} size={34} />
      </div>
      <div style={{ marginTop: 6 }}>
        <StatusChip status={point.status} compact />
      </div>
      <p className="smhq-ink" style={{ marginTop: 6, fontSize: 11.5, lineHeight: 1.45 }}>{point.why}</p>
    </div>
  );
}
