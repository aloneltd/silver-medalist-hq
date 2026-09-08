import { useCallback, useMemo, useRef, useState } from 'react';
import type { Candidate, Match } from '../../types';
import { dataService } from '../../services/dataService';
import { aiService } from '../../services/aiService';

/** FLIP window — the reorder plays once per sync, capped at 300ms per BLUEPRINT-v2.md. */
const FLIP_WINDOW_MS = 320;

/** Stable empty-array references so a `?? []` fallback doesn't defeat memoization every render. */
const EMPTY_CANDIDATES: Candidate[] = [];
const EMPTY_MATCHES: Match[] = [];

export type SyncPhase = 'idle' | 'loading' | 'syncing' | 'error';

export interface UseSyncBenchResult {
  role: ReturnType<typeof dataService.hooks.useRole>;
  /** Every candidate on the bench — non-active statuses stay visible, greyed, with a reason. */
  candidates: Candidate[];
  /** This role's matches, keyed by candidateId. */
  matchesByCandidate: Record<string, Match>;
  phase: SyncPhase;
  error: string | null;
  usedFallback: boolean;
  lastSyncedAt: number | null;
  /** True for ~300ms right after a sync — gates the FLIP transition so it plays once. */
  flipActive: boolean;
  sync: () => Promise<void>;
}

/**
 * Owns the bench's sync orchestration for one role: skeleton state while scoring is in
 * flight, matches upserted into Dexie via dataService (so `matchesByCandidate` updates live
 * through dataService's own useLiveQuery hooks), and a short `flipActive` window BenchView
 * uses to gate its one-time FLIP reorder animation.
 *
 * `dataService.prepareScoreRequest` already short-circuits to zero network when nothing
 * changed since the last score (matches hash comparison) — BLUEPRINT-v2.md's cache contract.
 */
export function useSyncBench(roleId: string | undefined): UseSyncBenchResult {
  const [phase, setPhase] = useState<SyncPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [flipActive, setFlipActive] = useState(false);
  const flipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const role = dataService.hooks.useRole(roleId);
  const candidates = dataService.hooks.useCandidates() ?? EMPTY_CANDIDATES;
  const matches = dataService.hooks.useMatchesForRole(roleId) ?? EMPTY_MATCHES;

  const matchesByCandidate = useMemo(() => {
    const map: Record<string, Match> = {};
    for (const m of matches) map[m.candidateId] = m;
    return map;
  }, [matches]);

  const sync = useCallback(async () => {
    if (!roleId) return;
    setPhase('syncing');
    setError(null);

    try {
      const prepared = await dataService.prepareScoreRequest(roleId);

      if (prepared.unchanged) {
        // Identical hash to what's already stored — zero network, per BLUEPRINT-v2.md.
        setUsedFallback(false);
        setLastSyncedAt(Date.now());
        setPhase('idle');
        return;
      }

      const { scored, fallback } = await aiService.scoreRole(prepared.role, prepared.candidates);
      await dataService.applyScoreResults(roleId, prepared.hash, scored);

      setUsedFallback(fallback);
      setLastSyncedAt(Date.now());
      setPhase('idle');

      // Open the FLIP window once, then close it so later re-renders (scroll, unrelated
      // writes) don't replay the reorder animation.
      setFlipActive(true);
      if (flipTimer.current) clearTimeout(flipTimer.current);
      flipTimer.current = setTimeout(() => setFlipActive(false), FLIP_WINDOW_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sync the bench — please try again.');
      setPhase('error');
    }
  }, [roleId]);

  return { role, candidates, matchesByCandidate, phase, error, usedFallback, lastSyncedAt, flipActive, sync };
}
