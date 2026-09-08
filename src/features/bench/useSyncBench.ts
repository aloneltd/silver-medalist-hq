import { useCallback, useMemo } from 'react';
import type { Candidate, Match } from '../../types';
import { dataService } from '../../services/dataService';
import { useAppUI, type SyncProgress, type SyncPhase } from '../../app/store';

/** Stable empty-array references so a `?? []` fallback doesn't defeat memoization every render. */
const EMPTY_CANDIDATES: Candidate[] = [];
const EMPTY_MATCHES: Match[] = [];

export type { SyncPhase };

export interface UseSyncBenchResult {
  role: ReturnType<typeof dataService.hooks.useRole>;
  /** Every candidate on the bench — non-active statuses stay visible, greyed, with a reason. */
  candidates: Candidate[];
  /** This role's matches, keyed by candidateId. */
  matchesByCandidate: Record<string, Match>;
  phase: SyncPhase;
  error: string | null;
  usedFallback: boolean;
  /** How many of this role's rows are labelled keyword fit rather than AI-scored. */
  fallbackCount: number;
  lastSyncedAt: number | null;
  /** Wave counter while a sync is in flight — "wave 3 of 5". Null when idle. */
  progress: SyncProgress | null;
  /** True for ~340ms right after a sync — gates the FLIP transition so it plays once. */
  flipActive: boolean;
  sync: () => Promise<void>;
}

/**
 * A read-only view of the app-wide sync (src/app/store.tsx) scoped to one role, plus that
 * role's live Dexie data. Every screen that shows scores — bench, shortlist, map, board —
 * uses this, so one sync lights all of them up together instead of each running its own.
 */
export function useSyncBench(roleId: string | undefined): UseSyncBenchResult {
  const { syncPhase, syncRoleId, syncProgress, syncError, flipActive, lastSync, runSync } = useAppUI();

  const role = dataService.hooks.useRole(roleId);
  const candidates = dataService.hooks.useCandidates() ?? EMPTY_CANDIDATES;
  const matches = dataService.hooks.useMatchesForRole(roleId) ?? EMPTY_MATCHES;

  const matchesByCandidate = useMemo(() => {
    const map: Record<string, Match> = {};
    for (const m of matches) map[m.candidateId] = m;
    return map;
  }, [matches]);

  const fallbackCount = useMemo(() => matches.filter(m => m.fallback).length, [matches]);

  const isThisRole = !!roleId && syncRoleId === roleId;
  const sync = useCallback(async () => {
    if (roleId) await runSync(roleId);
  }, [roleId, runSync]);

  return {
    role,
    candidates,
    matchesByCandidate,
    phase: isThisRole ? syncPhase : 'idle',
    error: isThisRole ? syncError : null,
    usedFallback: fallbackCount > 0 && fallbackCount === matches.length,
    fallbackCount,
    lastSyncedAt: lastSync && lastSync.roleId === roleId ? lastSync.at : null,
    progress: isThisRole ? syncProgress : null,
    flipActive: isThisRole ? flipActive : false,
    sync,
  };
}
