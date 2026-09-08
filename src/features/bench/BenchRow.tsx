import { memo, type CSSProperties } from 'react';
import { m } from 'framer-motion';
import type { Candidate, Match } from '../../types';
import { Avatar, FitRing, StatusChip, WarmthBar, SUB_KEYS } from '../../ui';
import { daysSince, tenureMonths } from './lib/warmth';

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
  /** Longest gap on the visible bench — scales the warmth bars against each other. */
  maxWarmthDays?: number;
  onToggleSelect: (id: string, additive: boolean) => void;
  onOpen: (id: string) => void;
  onCompose: (id: string) => void;
  onSnooze: (id: string) => void;
  measureRef?: (el: HTMLElement | null) => void;
}

/**
 * One bench row. Five signals, each in its own channel so a recruiter can scan a column
 * rather than read a paragraph: who (avatar + name), where they stand (status chip), how
 * cold they've gone (number + warmth bar), how well they fit (the ring, with its four
 * sub-scores on hover), and — the one that earns the row — why now, in the ink colour.
 */
function BenchRowInner({
  candidate, match, isSelected, isActive, syncing, flipActive, style, maxWarmthDays = 400,
  onToggleSelect, onOpen, onCompose, onSnooze, measureRef,
}: BenchRowProps) {
  const greyed = candidate.status !== 'active';
  const score = match?.override?.score ?? match?.score;
  const showSkeleton = syncing && !match;
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
        'smhq-bench-row smhq-bench-grid',
        isActive ? 'smhq-bench-row-active' : '',
        greyed ? 'smhq-bench-row-greyed' : '',
      ].join(' ')}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={e => onToggleSelect(candidate.id, (e.nativeEvent as MouseEvent).shiftKey)}
        aria-label={`Select ${candidate.name}`}
        className="smhq-focus-ring"
        style={{ width: 15, height: 15, accentColor: 'var(--accent)' }}
      />

      <button type="button" onClick={() => onOpen(candidate.id)} className="smhq-bench-identity smhq-focus-ring">
        <Avatar name={candidate.name} size={30} />
        <span className="smhq-bench-identity-text">
          <span className="smhq-bench-name smhq-truncate" style={{ fontSize: 13.5 }}>
            {candidate.name}
          </span>
          <span className="smhq-bench-sub smhq-truncate smhq-bench-only-wide" style={{ fontSize: 11.5 }}>
            {candidate.currentTitle} · {candidate.currentEmployer} · {tenureLabel(candidate.tenureStart)}
          </span>
          <span className="smhq-bench-sub smhq-truncate smhq-bench-only-narrow" style={{ fontSize: 11.5 }}>
            {showSkeleton ? 'Scoring…' : whyNow ?? `${candidate.currentTitle} · ${warmthDays}d`}
          </span>
        </span>
      </button>

      <div className="smhq-bench-only-wide" style={{ minWidth: 0 }}>
        <StatusChip
          status={candidate.status}
          snoozeUntil={candidate.snoozeUntil}
          reason={candidate.statusReason}
          compact
        />
      </div>

      <div className="smhq-bench-only-wide" style={{ justifySelf: 'end' }}>
        <WarmthBar days={warmthDays} max={maxWarmthDays} stale={stale} />
      </div>

      <div className="group" style={{ position: 'relative', justifySelf: 'end' }}>
        {showSkeleton ? (
          <span className="smhq-skeleton" style={{ width: 34, height: 34, borderRadius: '50%', display: 'block' }} />
        ) : (
          <FitRing
            value={score ?? null}
            size={34}
            label={score === undefined
              ? `${candidate.name}: not scored for this role`
              : `${candidate.name}: fit ${Math.round(score)} of 100`}
          />
        )}

        {match && !showSkeleton && (
          <div className="smhq-subscore-pop">
            {SUB_KEYS.map(({ key, label }) => (
              <div key={key} className="smhq-subscore-row">
                <span>{label}</span>
                <span className="smhq-subscore-track">
                  <i style={{ width: `${Math.max(0, Math.min(100, match.sub[key]))}%` }} />
                </span>
                <span className="smhq-subscore-val">{Math.round(match.sub[key])}</span>
              </div>
            ))}
            {match.flags.length > 0 && (
              <div className="smhq-subscore-flags">{match.flags.join(' · ')}</div>
            )}
            {match.fallback && (
              <div className="smhq-subscore-flags">Keyword fit — not AI-scored</div>
            )}
          </div>
        )}
      </div>

      <div className="smhq-bench-only-wide" style={{ minWidth: 0 }}>
        {showSkeleton ? (
          <span className="smhq-skeleton" style={{ display: 'block', height: 11, width: '78%', borderRadius: 4 }} />
        ) : whyNow ? (
          <span
            className={`smhq-truncate ${match?.fallback ? 'smhq-bench-why-fallback' : 'smhq-bench-why'}`}
            style={{ display: 'block', fontSize: 12.5 }}
            title={whyNow}
          >
            {whyNow}
          </span>
        ) : (
          <span className="smhq-muted" style={{ fontSize: 12.5 }}>No score yet for this role.</span>
        )}
      </div>

      <div className="smhq-bench-actions">
        <button type="button" onClick={() => onCompose(candidate.id)} className="smhq-row-btn smhq-focus-ring">
          Reach out
        </button>
        <button type="button" onClick={() => onSnooze(candidate.id)} className="smhq-row-btn smhq-focus-ring smhq-bench-only-wide">
          Snooze
        </button>
      </div>
    </m.div>
  );
}

export const BenchRow = memo(BenchRowInner);
