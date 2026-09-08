import { memo, type CSSProperties } from 'react';
import { m } from 'framer-motion';
import type { Candidate, Match } from '../../types';
import { cx, STATUS_META, token } from './lib/tokens';
import { daysSince, formatWarmthDays, tenureMonths } from './lib/warmth';
import { useCountUp } from './lib/motion';

const SUB_LABELS: Array<{ key: keyof Match['sub']; label: string }> = [
  { key: 'skills', label: 'Skills' },
  { key: 'seniority', label: 'Seniority' },
  { key: 'comp', label: 'Comp' },
  { key: 'timing', label: 'Timing' },
];

function tenureLabel(tenureStart: string): string {
  const months = tenureMonths(tenureStart);
  if (months < 12) return `${months} mo.`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem ? `${years}y ${rem}mo` : `${years}y`;
}

export interface BenchRowProps {
  candidate: Candidate;
  match?: Match;
  isSelected: boolean;
  isActive: boolean;
  syncing: boolean;
  flipActive: boolean;
  style: CSSProperties;
  onToggleSelect: (id: string, additive: boolean) => void;
  onOpen: (id: string) => void;
  onCompose: (id: string) => void;
  onSnooze: (id: string) => void;
  measureRef?: (el: HTMLElement | null) => void;
}

function BenchRowInner({
  candidate, match, isSelected, isActive, syncing, flipActive, style,
  onToggleSelect, onOpen, onCompose, onSnooze, measureRef,
}: BenchRowProps) {
  const meta = STATUS_META[candidate.status] ?? STATUS_META.active;
  const displayScore = useCountUp(match?.override?.score ?? match?.score ?? 0);
  const showSkeleton = syncing && candidate.status === 'active' && !match;
  const warmthDays = daysSince(candidate.warmthAt);
  const stale = candidate.status === 'active' && warmthDays > 14;
  const whyNow = match?.override?.reason
    ? `${match.why} — overridden: ${match.override.reason}`
    : match?.why;

  return (
    <m.div
      ref={measureRef}
      role="row"
      aria-selected={isSelected}
      data-candidate-id={candidate.id}
      layout={flipActive ? true : undefined}
      transition={flipActive ? { duration: 0.3, ease: [0.2, 0.8, 0.2, 1] } : { duration: 0 }}
      style={style}
      className={[
        'group absolute left-0 right-0 grid items-center gap-2 px-3 sm:gap-3',
        // Mobile (< sm): checkbox, name (why-now folds in as a second line), fit, actions.
        // Desktop (>= sm): the full dense set of columns, per BLUEPRINT-v2.md's bench spec.
        'grid-cols-[20px_minmax(0,1fr)_56px_auto]',
        'sm:grid-cols-[24px_minmax(0,1.6fr)_140px_64px_84px_minmax(0,2fr)_auto]',
        'border-b',
        cx.border,
        isActive ? `bg-[${token.panel2}]` : 'bg-transparent hover:bg-[var(--panel-2,#1c2127)]',
        meta.greyed ? 'opacity-70' : '',
      ].join(' ')}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={e => onToggleSelect(candidate.id, (e.nativeEvent as MouseEvent).shiftKey)}
        aria-label={`Select ${candidate.name}`}
        className={`h-4 w-4 ${cx.focusRing} accent-[var(--accent,#35e0c8)]`}
      />

      <button
        type="button"
        onClick={() => onOpen(candidate.id)}
        className={`min-w-0 py-2 text-left ${cx.focusRing} rounded-[4px]`}
      >
        <div className={`truncate font-medium ${cx.ink}`}>{candidate.name}</div>
        <div className={`truncate text-xs ${cx.muted} sm:hidden`}>
          {showSkeleton ? 'Scoring…' : whyNow ?? `${candidate.currentTitle} · ${formatWarmthDays(warmthDays)}`}
        </div>
        <div className={`hidden truncate text-xs ${cx.muted} sm:block`}>
          {candidate.currentTitle} · {candidate.currentEmployer} · {tenureLabel(candidate.tenureStart)}
        </div>
      </button>

      <div className="hidden min-w-0 sm:block">
        <span
          title={candidate.statusReason || meta.label}
          className={`inline-flex max-w-full items-center gap-1.5 truncate rounded-full border px-2 py-0.5 text-xs ${cx.border} ${meta.textClass}`}
        >
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dotClass}`} />
          <span className="truncate">{meta.label}{candidate.statusReason ? ` · ${candidate.statusReason}` : ''}</span>
        </span>
      </div>

      <div className={`hidden text-right tabular-nums text-sm sm:block ${stale ? cx.amberText : cx.muted}`}>
        {formatWarmthDays(warmthDays)}
      </div>

      <div className="relative text-right">
        {showSkeleton ? (
          <div className="ml-auto h-4 w-10 animate-pulse rounded bg-[var(--panel-2,#1c2127)]" />
        ) : match ? (
          <span className={`font-mono text-sm font-semibold ${cx.accentText}`}>{displayScore}</span>
        ) : (
          <span className={`text-sm ${cx.muted}`}>—</span>
        )}

        {match && !showSkeleton && (
          <div
            className={[
              'pointer-events-none absolute right-0 top-full z-10 mt-1 w-52 rounded-[8px] border p-2 opacity-0',
              'transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100',
              'group-focus-within:pointer-events-auto group-focus-within:opacity-100',
              cx.surface, cx.shadow,
            ].join(' ')}
          >
            {SUB_LABELS.map(({ key, label }) => (
              <div key={key} className="mb-1 flex items-center gap-2 text-xs last:mb-0">
                <span className={`w-16 shrink-0 ${cx.muted}`}>{label}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--panel-2,#1c2127)]">
                  <span
                    className={`block h-full ${cx.accentBg}`}
                    style={{ width: `${Math.max(0, Math.min(100, match.sub[key]))}%` }}
                  />
                </span>
                <span className="w-7 shrink-0 text-right tabular-nums">{Math.round(match.sub[key])}</span>
              </div>
            ))}
            {match.flags.length > 0 && (
              <div className={`mt-1 border-t pt-1 text-[11px] ${cx.border} ${cx.amberText}`}>
                {match.flags.join(' · ')}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="hidden min-w-0 truncate text-sm italic sm:block" title={whyNow}>
        {showSkeleton ? (
          <div className="h-3.5 w-full max-w-[280px] animate-pulse rounded bg-[var(--panel-2,#1c2127)]" />
        ) : whyNow ? (
          <span className={cx.muted}>{whyNow}</span>
        ) : (
          <span className={cx.muted}>No score yet for this role.</span>
        )}
      </div>

      {/* Always tappable on touch (no hover state there); desktop keeps the hover reveal. */}
      <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        <button
          type="button"
          onClick={() => onCompose(candidate.id)}
          className={`rounded-[6px] border px-2 py-1 text-xs ${cx.border} ${cx.ink} hover:bg-[var(--panel-2,#1c2127)] ${cx.focusRing}`}
        >
          Reach out
        </button>
        <button
          type="button"
          onClick={() => onSnooze(candidate.id)}
          className={`rounded-[6px] border px-2 py-1 text-xs ${cx.border} ${cx.muted} hover:bg-[var(--panel-2,#1c2127)] ${cx.focusRing}`}
        >
          Snooze
        </button>
      </div>
    </m.div>
  );
}

export const BenchRow = memo(BenchRowInner);
