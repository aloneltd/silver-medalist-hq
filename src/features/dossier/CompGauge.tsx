import type { CompBand, CompSnapshot } from '../../types';
import { cx } from '../bench/lib/tokens';

export interface CompGaugeProps {
  band?: CompBand;
  figure?: CompSnapshot;
  /** Label for what `figure` represents — "Expectation" or "Last process". */
  figureLabel?: string;
}

/** Horizontal gauge: candidate comp figure plotted against a role's band. Replaces any radar
 *  chart per council/designer.md — "use a labelled bar row." */
export function CompGauge({ band, figure, figureLabel = 'Expectation' }: CompGaugeProps) {
  if (!band) {
    return <p className={`text-xs ${cx.muted}`}>Pick a role to compare comp against its band.</p>;
  }
  if (!figure) {
    return (
      <p className={`text-xs ${cx.muted}`}>
        No comp on file for this candidate — band is {band.currency} {band.min.toLocaleString()}–{band.max.toLocaleString()}.
      </p>
    );
  }
  if (figure.currency !== band.currency) {
    // Never fabricate an FX rate — a raw number comparison across currencies is a lie dressed
    // up as a gauge. Show both figures honestly instead of a misleading bar position.
    return (
      <p className={`text-xs ${cx.amberText}`}>
        {figureLabel} is {figure.currency} {figure.amount.toLocaleString()}, band is {band.currency}{' '}
        {band.min.toLocaleString()}–{band.max.toLocaleString()} — different currencies, not directly comparable.
      </p>
    );
  }

  const span = Math.max(1, band.max - band.min);
  const overshoot = span * 0.15;
  const lo = band.min - overshoot;
  const hi = band.max + overshoot;
  const pct = Math.max(0, Math.min(100, ((figure.amount - lo) / (hi - lo)) * 100));
  const inBand = figure.amount >= band.min && figure.amount <= band.max;
  const bandStartPct = ((band.min - lo) / (hi - lo)) * 100;
  const bandEndPct = ((band.max - lo) / (hi - lo)) * 100;

  return (
    <div>
      <div className="relative h-2 rounded-full bg-[var(--panel-2,#1c2127)]">
        <div
          className={`absolute top-0 h-2 rounded-full ${cx.accentBg} opacity-30`}
          style={{ left: `${bandStartPct}%`, width: `${bandEndPct - bandStartPct}%` }}
        />
        <div
          className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${inBand ? cx.accentBg : cx.dangerBg}`}
          style={{ left: `${pct}%`, borderColor: 'var(--bg,#0e1013)' }}
          title={`${figureLabel}: ${figure.currency} ${figure.amount.toLocaleString()}`}
        />
      </div>
      <div className={`mt-1 flex justify-between text-[11px] ${cx.muted}`}>
        <span>{band.currency} {band.min.toLocaleString()}</span>
        <span className={inBand ? cx.accentText : cx.dangerText}>
          {figureLabel}: {figure.currency} {figure.amount.toLocaleString()}
          {!inBand && (figure.amount > band.max ? ' (above band)' : ' (below band)')}
        </span>
        <span>{band.currency} {band.max.toLocaleString()}</span>
      </div>
      <p className={`mt-0.5 text-[10px] ${cx.muted}`}>as of {new Date(figure.date).toLocaleDateString()}</p>
    </div>
  );
}
