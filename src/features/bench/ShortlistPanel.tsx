import { useMemo } from 'react';
import { LazyMotion, domAnimation, m, AnimatePresence } from 'framer-motion';
import { useAppUI } from '../../app/store';
import { useSyncBench } from './useSyncBench';
import { cx } from './lib/tokens';
import { usePrefersReducedMotion } from './lib/motion';

export interface ShortlistPanelProps {
  roleId: string;
  limit?: number;
}

/** Top-N ranked candidates for a role, with the why-now line — the shortlist BLUEPRINT-v2.md
 *  describes appearing after a sync ("Shortlist panel (top 8) with why-now lines streaming in"). */
export function ShortlistPanel({ roleId, limit = 8 }: ShortlistPanelProps) {
  const { role, candidates, matchesByCandidate, phase } = useSyncBench(roleId);
  const { openComposer } = useAppUI();
  const reduced = usePrefersReducedMotion();

  const top = useMemo(() => {
    return candidates
      .filter(c => c.status === 'active' && matchesByCandidate[c.id])
      .map(c => ({ candidate: c, match: matchesByCandidate[c.id] }))
      .sort((a, b) => (b.match.override?.score ?? b.match.score) - (a.match.override?.score ?? a.match.score))
      .slice(0, limit);
  }, [candidates, matchesByCandidate, limit]);

  return (
    <LazyMotion features={domAnimation} strict>
      <aside aria-label={`Shortlist for ${role?.title ?? 'this role'}`} className={`flex h-full min-h-0 flex-col ${cx.surface} ${cx.radius}`}>
        <header className="border-b px-3 py-2" style={{ borderColor: 'var(--border,#262c34)' }}>
          <h2 className={`text-sm font-semibold ${cx.ink}`}>Shortlist{role ? ` — ${role.title}` : ''}</h2>
          <p className={`text-xs ${cx.muted}`}>Top {limit} by fit, active candidates only.</p>
        </header>

        <div className="min-h-0 flex-1 space-y-2 overflow-auto p-2">
          {phase === 'syncing' && top.length === 0 &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-[8px] bg-[var(--panel-2,#1c2127)]" />
            ))}

          {top.length === 0 && phase !== 'syncing' && (
            <p className={`p-3 text-sm ${cx.muted}`}>No scored candidates yet — sync the bench for this role.</p>
          )}

          <AnimatePresence initial={false}>
            {top.map(({ candidate, match }, i) => (
              <m.div
                key={candidate.id}
                layout
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, delay: reduced ? 0 : Math.min(i * 0.05, 0.3) }}
                className={`rounded-[8px] border p-2 ${cx.border}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`truncate text-sm font-medium ${cx.ink}`}>{i + 1}. {candidate.name}</span>
                  <span className={`shrink-0 font-mono text-sm ${cx.accentText}`}>
                    {Math.round(match.override?.score ?? match.score)}
                  </span>
                </div>
                <p className={`mt-1 text-xs ${cx.muted}`}>{match.why}</p>
                <button
                  type="button"
                  onClick={() => openComposer({ candidateId: candidate.id, roleId })}
                  className={`mt-2 rounded-[6px] border px-2 py-1 text-xs ${cx.border} ${cx.ink} hover:bg-[var(--panel-2,#1c2127)] ${cx.focusRing}`}
                >
                  Reach out
                </button>
              </m.div>
            ))}
          </AnimatePresence>
        </div>
      </aside>
    </LazyMotion>
  );
}
