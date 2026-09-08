import { useEffect, useMemo, useRef, useState } from 'react';
import { useDossierLink } from '../../app/useDossierLink';
import { LazyMotion, domAnimation, m, AnimatePresence } from 'framer-motion';
import { useAppUI } from '../../app/store';
import { useSyncBench } from './useSyncBench';
import { usePrefersReducedMotion } from './lib/motion';
import { Avatar, FitRing } from '../../ui';

export interface ShortlistPanelProps {
  roleId: string;
  limit?: number;
}

/**
 * Types `text` out at ~55 chars/sec while `run` is true, then holds the full string. Used for
 * the why-now lines after a sync: the reveal is the app finishing its sentence out loud, not
 * a fake loading bar — it starts only once the row's real score has landed.
 */
function useTypewriter(text: string, run: boolean, startDelayMs = 0): { shown: string; done: boolean } {
  const reduced = usePrefersReducedMotion();
  const active = run && !reduced;
  // The progress carries the key of the string it belongs to, so a new sentence starts from
  // zero characters rather than briefly flashing the previous one's length.
  const key = `${startDelayMs}|${text}`;
  const [progress, setProgress] = useState<{ key: string; n: number }>({ key: '', n: 0 });
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    const started = performance.now() + startDelayMs;
    const CPS = 55;
    const tick = (t: number) => {
      const elapsed = t - started;
      const n = elapsed <= 0 ? 0 : Math.floor((elapsed / 1000) * CPS);
      setProgress({ key, n });
      if (n < text.length) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [key, text.length, active, startDelayMs]);

  const shown = !active ? text : (progress.key === key ? text.slice(0, progress.n) : '');
  return { shown, done: shown.length >= text.length };
}

function ShortlistCard({
  rank, name, score, why, meta, stream, onReachOut, onOpen,
}: {
  rank: number;
  name: string;
  score: number;
  why: string;
  meta: string;
  /** True right after a sync — the why-now line types itself in rather than appearing. */
  stream: boolean;
  onReachOut: () => void;
  onOpen: () => void;
}) {
  const { shown, done } = useTypewriter(why, stream, Math.min(rank * 90, 700));

  return (
    <div className="smhq-shortlist-card">
      <span className={`smhq-rank smhq-rank-${rank}`}>{rank}</span>
      <div style={{ minWidth: 0 }}>
        <button
          type="button"
          onClick={onOpen}
          style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}
          className="smhq-focus-ring"
        >
          <Avatar name={name} size={22} />
          <span style={{ minWidth: 0 }}>
            <span className="smhq-shortlist-name smhq-truncate">{name}</span>
            <span className="smhq-shortlist-meta smhq-truncate" style={{ display: 'block' }}>{meta}</span>
          </span>
        </button>
        <p className="smhq-shortlist-why">
          {shown}
          {!done && <span className="smhq-caret" aria-hidden="true" />}
        </p>
        <button type="button" onClick={onReachOut} className="smhq-row-btn smhq-focus-ring" style={{ marginTop: 8 }}>
          Reach out
        </button>
      </div>
      <FitRing value={score} size={38} label={`${name}: fit ${Math.round(score)} of 100`} />
    </div>
  );
}

/** Top-N ranked candidates for a role, with the why-now line — the shortlist BLUEPRINT-v2.md
 *  describes appearing after a sync ("Shortlist panel (top 8) with why-now lines streaming in"). */
export function ShortlistPanel({ roleId, limit = 8 }: ShortlistPanelProps) {
  const { role, candidates, matchesByCandidate, phase, lastSyncedAt } = useSyncBench(roleId);
  const { openComposer } = useAppUI();
  const { openCandidate } = useDossierLink();
  const reduced = usePrefersReducedMotion();

  const top = useMemo(() => {
    return candidates
      .filter(c => c.status === 'active' && matchesByCandidate[c.id])
      .map(c => ({ candidate: c, match: matchesByCandidate[c.id] }))
      .sort((a, b) => (b.match.override?.score ?? b.match.score) - (a.match.override?.score ?? a.match.score))
      .slice(0, limit);
  }, [candidates, matchesByCandidate, limit]);

  const streamKey = String(lastSyncedAt ?? 'initial');

  return (
    <LazyMotion features={domAnimation} strict>
      <m.aside
        aria-label={`Shortlist for ${role?.title ?? 'this role'}`}
        className="smhq-shortlist"
        // The sync moment: the whole panel slides in once the last wave lands.
        key={streamKey}
        initial={reduced || !lastSyncedAt ? false : { opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      >
        <header className="smhq-shortlist-head">
          <h2>Shortlist{role ? ` — ${role.title}` : ''}</h2>
          <p>Top {limit} by fit, contactable candidates only.</p>
        </header>

        <div className="smhq-shortlist-list">
          {phase === 'syncing' && top.length === 0 &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="smhq-skeleton" style={{ height: 76, borderRadius: 'var(--radius-md)' }} />
            ))}

          {top.length === 0 && phase !== 'syncing' && (
            <p className="smhq-muted" style={{ padding: 12, fontSize: 13 }}>
              No scored candidates yet — sync the bench for this role.
            </p>
          )}

          <AnimatePresence initial={false}>
            {top.map(({ candidate, match }, i) => (
              <m.div
                key={candidate.id}
                layout
                initial={reduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, delay: reduced ? 0 : Math.min(i * 0.045, 0.32) }}
              >
                <ShortlistCard
                  rank={i + 1}
                  name={candidate.name}
                  score={match.override?.score ?? match.score}
                  why={match.override?.reason ?? match.why}
                  meta={`${candidate.currentTitle} · ${candidate.currentEmployer}`}
                  stream={!!lastSyncedAt}
                  onOpen={() => openCandidate(candidate.id)}
                  onReachOut={() => openComposer({ candidateId: candidate.id, roleId })}
                />
              </m.div>
            ))}
          </AnimatePresence>
        </div>
      </m.aside>
    </LazyMotion>
  );
}
