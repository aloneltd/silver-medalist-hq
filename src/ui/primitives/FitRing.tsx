import { memo } from 'react';

export interface FitRingProps {
  /** 0–100. Pass `null`/undefined for "not scored yet" — the ring renders as an empty track. */
  value?: number | null;
  /** Outer diameter in px. */
  size?: number;
  /** Ring thickness in px. */
  stroke?: number;
  /** Small caption under the number (e.g. "fit"). Omitted below size 40. */
  caption?: string;
  /** Extra a11y text — the ring is decorative when the number is already announced elsewhere. */
  label?: string;
  className?: string;
}

function toneClass(v: number): string {
  if (v >= 70) return 'smhq-ring-strong';
  if (v >= 45) return 'smhq-ring-mid';
  return 'smhq-ring-low';
}

/**
 * The fit ring — an SVG arc from 0 to 100, the single visual anchor for "how well does this
 * person fit the role I'm looking at". Deterministic, theme-token coloured, and animated only
 * through `stroke-dashoffset` so a re-score visibly travels rather than snapping.
 */
function FitRingInner({ value, size = 38, stroke = 3.5, caption, label, className = '' }: FitRingProps) {
  const has = typeof value === 'number' && Number.isFinite(value);
  const v = has ? Math.max(0, Math.min(100, value as number)) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - v / 100);
  const showCaption = caption && size >= 40;

  return (
    <svg
      className={`smhq-ring ${has ? '' : 'smhq-ring-empty'} ${className}`}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role={label ? 'img' : 'presentation'}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle
        className="smhq-ring-track"
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
      />
      <circle
        className={`smhq-ring-arc ${toneClass(v)}`}
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        className="smhq-ring-label"
        x={size / 2}
        y={showCaption ? size / 2 - 3 : size / 2}
        fontSize={Math.round(size * 0.34)}
      >
        {has ? Math.round(v) : '–'}
      </text>
      {showCaption && (
        <text className="smhq-ring-sub" x={size / 2} y={size / 2 + Math.round(size * 0.22)} fontSize={Math.round(size * 0.2)}>
          {caption}
        </text>
      )}
    </svg>
  );
}

export const FitRing = memo(FitRingInner);
