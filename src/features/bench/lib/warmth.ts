import type { Candidate, CandidateStatus } from '../../../types';
import { computeWarmthDays } from '../../../services/dataService';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole days between `iso` and now (never negative). Delegates to dataService's
 * `computeWarmthDays` — the canonical definition Today's queue is also built on — so "days
 * since touch" never drifts between the bench, the map and the dossier.
 */
export function daysSince(iso: string, now: number = Date.now()): number {
  return computeWarmthDays(iso, new Date(now));
}

export function daysUntil(iso: string, now: number = Date.now()): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.ceil((then - now) / DAY_MS);
}

/** Stale after 14 days without a touch — matches the Board's "stale" rule in BLUEPRINT-v2.md. */
export const STALE_DAYS = 14;

export function isStale(candidate: Candidate, now: number = Date.now()): boolean {
  return candidate.status === 'active' && daysSince(candidate.warmthAt, now) > STALE_DAYS;
}

/** Default resurface window for a candidate who took another role. */
export const RESURFACE_MONTHS_DEFAULT = 18;

export function defaultResurfaceDate(from: Date = new Date()): string {
  const d = new Date(from);
  d.setMonth(d.getMonth() + RESURFACE_MONTHS_DEFAULT);
  return d.toISOString();
}

const REASON_REQUIRED: CandidateStatus[] = ['silent', 'took_role', 'do_not_reapproach', 'opted_out'];
export function statusRequiresReason(status: CandidateStatus): boolean {
  return REASON_REQUIRED.includes(status);
}

/** Tenure in whole months — the strongest timing signal per BLUEPRINT-v2.md. */
export function tenureMonths(tenureStart: string, now: number = Date.now()): number {
  const start = new Date(tenureStart);
  if (Number.isNaN(start.getTime())) return 0;
  const months = (now - start.getTime()) / (30.4375 * DAY_MS);
  return Math.max(0, Math.floor(months));
}

export function formatWarmthDays(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return '1 day';
  return `${days} days`;
}
