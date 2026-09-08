import { memo } from 'react';
import type { CandidateStatus, MatchSubScores } from '../../types';
import { STATUS_META } from '../../features/bench/lib/tokens';

// ------------------------------------------------------------------------- status chip

/** A date you'll act on soon gets a day; one a year out only needs the month. */
function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const daysOut = (d.getTime() - Date.now()) / 86_400_000;
  return daysOut <= 60
    ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    : d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export interface StatusChipProps {
  status: CandidateStatus;
  /** took_role only — appended to the chip as "· resurface Mar 2028". */
  snoozeUntil?: string;
  /** Full recorded reason — shown as the title so the chip stays one short line. */
  reason?: string;
  compact?: boolean;
}

/**
 * The coloured status chip. Each status gets its own hue so a bench scan reads at a glance:
 * active teal · silent grey · took-a-role blue (with the resurface date) · do-not amber ·
 * opted-out red. Hues come from tokens; the chip never invents a colour.
 */
function StatusChipInner({ status, snoozeUntil, reason, compact }: StatusChipProps) {
  const meta = STATUS_META[status] ?? STATUS_META.active;
  const suffix = status === 'took_role' && snoozeUntil ? ` · resurface ${shortDate(snoozeUntil)}` : '';
  return (
    <span className={meta.chipClass} title={reason ? `${meta.label} — ${reason}` : meta.label}>
      <span className={`smhq-status-dot ${meta.dotClass}`} />
      <span>{(compact ? meta.short : meta.label) + suffix}</span>
    </span>
  );
}
export const StatusChip = memo(StatusChipInner);

// -------------------------------------------------------------------------- warmth bar

export interface WarmthBarProps {
  days: number;
  /** Longest gap on the bench right now — sets the bar's full scale. */
  max?: number;
  stale?: boolean;
}

/** Days-since-touch as a number, with a thin bar underneath so cold rows read spatially. */
function WarmthBarInner({ days, max = 400, stale }: WarmthBarProps) {
  const safeDays = Math.max(0, Math.round(days));
  // Bar fills as warmth *remains*: fresh = full, cold = empty.
  const remaining = Math.max(0, Math.min(1, 1 - safeDays / Math.max(1, max)));
  const tone = safeDays <= 14 ? 'warm' : safeDays <= 90 ? 'cooling' : 'cold';
  return (
    <span className="smhq-warmth">
      <span className={`smhq-warmth-num ${stale ? 'smhq-warmth-num-stale' : ''}`}>
        {safeDays === 0 ? 'today' : `${safeDays}d`}
      </span>
      <span className={`smhq-warmth-bar smhq-warmth-bar-${tone}`}>
        <i style={{ width: `${Math.round(remaining * 100)}%` }} />
      </span>
    </span>
  );
}
export const WarmthBar = memo(WarmthBarInner);

// ------------------------------------------------------------------------ sub-scores

const SUB_KEYS: Array<{ key: keyof MatchSubScores; label: string; short: string }> = [
  { key: 'skills', label: 'Skills', short: 'S' },
  { key: 'seniority', label: 'Seniority', short: 'L' },
  { key: 'comp', label: 'Comp', short: 'C' },
  { key: 'timing', label: 'Timing', short: 'T' },
];

export { SUB_KEYS };

export interface SubScoreBarsProps {
  sub: MatchSubScores;
}

/** Four micro bars — the fit ring's breakdown, small enough to sit inline in a dense row. */
function SubScoreBarsInner({ sub }: SubScoreBarsProps) {
  return (
    <span className="smhq-subbars" aria-hidden="true">
      {SUB_KEYS.map(({ key, label }) => (
        <span key={key} className="smhq-subbar" title={`${label} ${Math.round(sub[key])}`}>
          <i style={{ width: `${Math.max(0, Math.min(100, sub[key]))}%` }} />
        </span>
      ))}
    </span>
  );
}
export const SubScoreBars = memo(SubScoreBarsInner);
