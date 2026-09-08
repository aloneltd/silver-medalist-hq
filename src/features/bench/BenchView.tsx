import { useCallback, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { LazyMotion, domAnimation } from 'framer-motion';
import type { BoardStage, Candidate, CandidateStatus } from '../../types';
import { dataService } from '../../services/dataService';
import { useAppUI } from '../../app/store';
import { useDossierLink } from '../../app/useDossierLink';
import { Button, Chip, Input, Kbd } from '../../ui';
import { useSyncBench } from './useSyncBench';
import { useBenchKeyboard } from './useBenchKeyboard';
import { BenchRow } from './BenchRow';
import { BulkActionsBar } from './BulkActionsBar';
import { snoozeCandidate, bulkTag, bulkSnooze, bulkStatus } from './lib/actions';
import { STATUS_META } from './lib/tokens';
import { daysSince } from './lib/warmth';
import { candidatesToCsv, downloadCsv } from './lib/csv';

type SortKey = 'fit' | 'warmth' | 'name' | 'status';

const ROW_HEIGHT = 64;
const QUICK_SNOOZE_DAYS = 3;

export interface BenchViewProps {
  /** Omit to score against the shell's currently-selected role (top-bar role picker). */
  roleId?: string;
  /** Override hook — omit to open the dossier via the shared `?c=` deep link (useDossierLink). */
  onOpenCandidate?: (candidateId: string) => void;
  /** Override hook — omit to open the shared outreach composer (useAppUI().openComposer). */
  onCompose?: (candidateId: string, roleId: string | undefined) => void;
}

export function BenchView({ roleId: roleIdProp, onOpenCandidate, onCompose: onComposeProp }: BenchViewProps = {}) {
  const { selectedRoleId, openComposer } = useAppUI();
  const roleId = roleIdProp ?? selectedRoleId ?? undefined;
  const { openCandidate: openCandidateLink } = useDossierLink();
  const openCandidate = onOpenCandidate ?? openCandidateLink;

  const {
    role, candidates, matchesByCandidate, phase, error, fallbackCount, progress, flipActive, sync,
  } = useSyncBench(roleId);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Set<CandidateStatus>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('fit');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastClickedIndex = useRef<number | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates.filter(c => {
      if (statusFilter.size && !statusFilter.has(c.status)) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.currentEmployer.toLowerCase().includes(q) ||
        c.currentTitle.toLowerCase().includes(q) ||
        c.skills.some(s => s.toLowerCase().includes(q))
      );
    });
  }, [candidates, statusFilter, search]);

  const maxWarmthDays = useMemo(
    () => filtered.reduce((mx, c) => Math.max(mx, daysSince(c.warmthAt)), 30),
    [filtered],
  );

  const sorted = useMemo(() => {
    const rows = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name) * dir;
        case 'status':
          return a.status.localeCompare(b.status) * dir;
        case 'warmth':
          return (daysSince(a.warmthAt) - daysSince(b.warmthAt)) * dir;
        case 'fit':
        default: {
          // Ranking de-prioritises everyone who isn't contactable, whatever their raw fit —
          // an opted-out person must never sit above an active one on a sorted bench.
          const rank = (c: Candidate) => (c.status === 'active' ? 0 : c.status === 'silent' ? 1 : 2);
          const rankDiff = rank(a) - rank(b);
          if (rankDiff !== 0) return rankDiff;
          const sa = matchesByCandidate[a.id];
          const sb = matchesByCandidate[b.id];
          const va = sa ? (sa.override?.score ?? sa.score) : -1;
          const vb = sb ? (sb.override?.score ?? sb.score) : -1;
          return (va - vb) * dir;
        }
      }
    });
    return rows;
  }, [filtered, sortKey, sortDir, matchesByCandidate]);

  const rowIds = useMemo(() => sorted.map(c => c.id), [sorted]);

  const openCompose = useCallback(
    (id: string) => (onComposeProp ? onComposeProp(id, roleId) : openComposer({ candidateId: id, roleId })),
    [onComposeProp, openComposer, roleId],
  );
  const snoozeOne = useCallback(async (id: string) => {
    await snoozeCandidate(id, new Date(Date.now() + QUICK_SNOOZE_DAYS * 24 * 60 * 60 * 1000).toISOString());
  }, []);
  const setStageOne = useCallback(
    async (id: string, stage: BoardStage) => {
      const match = matchesByCandidate[id];
      if (match) await dataService.setStage(match.id, stage, '');
    },
    [matchesByCandidate],
  );

  const { activeIndex, setActiveIndex } = useBenchKeyboard(rowIds, {
    onOpen: openCandidate,
    onCompose: openCompose,
    onSetStage: setStageOne,
    onSnooze: snoozeOne,
  });

  const toggleSelect = useCallback(
    (id: string, additive: boolean) => {
      setSelected(prev => {
        const next = new Set(prev);
        if (additive && lastClickedIndex.current != null) {
          const idx = rowIds.indexOf(id);
          const [lo, hi] = [lastClickedIndex.current, idx].sort((a, b) => a - b);
          for (let i = lo; i <= hi; i++) next.add(rowIds[i]);
        } else if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        lastClickedIndex.current = rowIds.indexOf(id);
        return next;
      });
    },
    [rowIds],
  );

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const syncing = phase === 'syncing';

  return (
    <LazyMotion features={domAnimation} strict>
      <section aria-label="Bench" className="smhq-ink" style={{ display: 'flex', height: '100%', minHeight: 0, flexDirection: 'column' }}>
        <header
          className="smhq-border"
          style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--panel-border)', padding: '10px 14px' }}
        >
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, employer, skill…"
            aria-label="Search the bench"
            className="w-56"
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            {(['active', 'silent', 'took_role', 'do_not_reapproach', 'opted_out'] as CandidateStatus[]).map(s => (
              <Chip
                key={s}
                tone={statusFilter.has(s) ? 'accent' : 'neutral'}
                selected={statusFilter.has(s)}
                onClick={() =>
                  setStatusFilter(prev => {
                    const next = new Set(prev);
                    if (next.has(s)) next.delete(s); else next.add(s);
                    return next;
                  })
                }
              >
                {STATUS_META[s].label}
              </Chip>
            ))}
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* The wave counter IS the progress indicator — there is no global spinner. */}
            {syncing && progress && progress.totalWaves > 0 && (
              <span className="smhq-wave" role="status" aria-live="polite">
                <span className="smhq-wave-track">
                  <i style={{ width: `${Math.round((progress.wave / progress.totalWaves) * 100)}%` }} />
                </span>
                Wave {Math.max(1, progress.wave)} of {progress.totalWaves} · {progress.scored} scored
              </span>
            )}
            {role && (
              <>
                {!syncing && fallbackCount > 0 && (
                  <Chip as="span" tone="amber">
                    {fallbackCount} keyword fit{fallbackCount === 1 ? '' : 's'}
                  </Chip>
                )}
                <Button variant="primary" size="sm" onClick={sync} disabled={syncing}>
                  {syncing ? 'Scoring…' : `Sync the bench for ${role.title}`}
                </Button>
              </>
            )}
            {!roleId && <span className="smhq-muted" style={{ fontSize: 13 }}>Pick a role to score the bench.</span>}
            <span className="smhq-muted smhq-bench-only-wide" style={{ fontSize: 11.5 }}>
              <Kbd keys={['j', 'k']} /> move <Kbd>enter</Kbd> open <Kbd>e</Kbd> compose <Kbd>s</Kbd> snooze
            </span>
          </div>
        </header>

        {error && (
          <div role="alert" className="smhq-danger-text" style={{ borderBottom: '1px solid var(--panel-border)', padding: '8px 14px', fontSize: 13 }}>
            {error}
          </div>
        )}

        <BulkActionsBar
          count={selected.size}
          onClear={() => setSelected(new Set())}
          onTag={tag => bulkTag([...selected], tag)}
          onSnooze={until => bulkSnooze([...selected], until)}
          onStatus={async (status, reason, snoozeUntil) => {
            await bulkStatus([...selected], status, reason);
            if (snoozeUntil) await bulkSnooze([...selected], snoozeUntil);
          }}
          onExportCsv={() => {
            const rows = selected.size ? sorted.filter(c => selected.has(c.id)) : sorted;
            downloadCsv('bench-export.csv', candidatesToCsv(rows, matchesByCandidate));
          }}
        />

        <div role="row" className="smhq-bench-grid smhq-bench-head" style={{ padding: '7px 14px' }}>
          <span aria-hidden />
          <button type="button" onClick={() => toggleSort('name')} style={{ textAlign: 'left', background: 'none', border: 0, color: 'inherit', font: 'inherit', cursor: 'pointer' }}>Name</button>
          <button type="button" onClick={() => toggleSort('status')} className="smhq-bench-only-wide" style={{ textAlign: 'left', background: 'none', border: 0, color: 'inherit', font: 'inherit', cursor: 'pointer' }}>Status</button>
          <button type="button" onClick={() => toggleSort('warmth')} className="smhq-bench-only-wide" style={{ textAlign: 'right', background: 'none', border: 0, color: 'inherit', font: 'inherit', cursor: 'pointer' }}>Days</button>
          <button type="button" onClick={() => toggleSort('fit')} style={{ textAlign: 'right', background: 'none', border: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', justifySelf: 'end' }}>Fit</button>
          <span className="smhq-bench-only-wide">Why now</span>
          <span aria-hidden />
        </div>

        <div
          ref={parentRef}
          role="grid"
          aria-label={`Bench, ${sorted.length} candidates`}
          aria-rowcount={sorted.length}
          style={{ minHeight: 0, flex: 1, overflow: 'auto' }}
        >
          {sorted.length === 0 ? (
            <div className="smhq-muted" style={{ padding: 32, textAlign: 'center', fontSize: 13 }}>
              No candidates match these filters.
            </div>
          ) : (
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map(vRow => {
                const candidate: Candidate = sorted[vRow.index];
                return (
                  <BenchRow
                    key={candidate.id}
                    candidate={candidate}
                    match={matchesByCandidate[candidate.id]}
                    isSelected={selected.has(candidate.id)}
                    isActive={vRow.index === activeIndex}
                    syncing={syncing}
                    flipActive={flipActive}
                    maxWarmthDays={maxWarmthDays}
                    style={{ transform: `translateY(${vRow.start}px)`, height: ROW_HEIGHT }}
                    onToggleSelect={(id, additive) => { setActiveIndex(vRow.index); toggleSelect(id, additive); }}
                    onOpen={openCandidate}
                    onCompose={openCompose}
                    onSnooze={snoozeOne}
                  />
                );
              })}
            </div>
          )}
        </div>
      </section>
    </LazyMotion>
  );
}
