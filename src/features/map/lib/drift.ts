import type { Candidate, Id, Match } from '../../../types';
import { dataService } from '../../../services/dataService';
import { ulid } from '../../../lib/ulid';
import {
  angleForWarmthDays, colorForStatus, polarToXY, radiusForFit, radiusForSeniority,
  type TargetGeometry, type TargetPoint,
} from './geometry';

/**
 * Drift — council amendments §2 ("Rewind -> Drift"). The recruiter's question isn't history,
 * it's who is moving away from them. We don't have a per-day history of `warmthAt`, so a past
 * position is *estimated*: hold today's fit constant (we have no historical score either) and
 * roll the contact clock back by walking `warmthAt` forward in time. A candidate touched more
 * recently than the point we're rolling back to is approximated as "fresh then" (clamped to 0
 * days) rather than guessing a negative age — an honest approximation, not a lie: we simply
 * don't claim to know their exact state before the touch we do have on file.
 */

const DAY_MS = 86_400_000;
const AVG_MONTH_DAYS = 30.4375;

/** "Warm" for Drift's purposes: touched within the last month. Matches the vocabulary a
 * recruiter already uses ("still warm") rather than inventing a new threshold. */
export const WARM_DAYS_THRESHOLD = 30;

export interface DriftPoint extends TargetPoint {
  /** null when the candidate wasn't on the bench yet at this past point in time. */
  pastWarmthDays: number | null;
}

/** Estimated days-since-contact `monthsAgo` months before `nowMs`. Null = not yet on the
 * bench then (candidate.createdAt is after that point) — Drift hides these dots entirely. */
export function pastWarmthDays(c: Candidate, monthsAgo: number, nowMs: number): number | null {
  if (monthsAgo <= 0) return Math.max(0, Math.floor((nowMs - new Date(c.warmthAt).getTime()) / DAY_MS));
  const pastMs = nowMs - monthsAgo * AVG_MONTH_DAYS * DAY_MS;
  if (new Date(c.createdAt).getTime() > pastMs) return null;
  const warmthAtMs = new Date(c.warmthAt).getTime();
  return Math.max(0, Math.floor((pastMs - warmthAtMs) / DAY_MS));
}

/** Recomputes the dial position for `monthsAgo` months back — same fit/seniority/status (we
 * have no history for those), new angle. Drives the slider's live scrub. */
export function buildDriftPoints(
  candidates: Candidate[],
  matchesByCandidate: Record<string, Match>,
  geo: TargetGeometry,
  monthsAgo: number,
  nowMs: number = Date.now(),
): DriftPoint[] {
  const withMatch = candidates.filter(c => matchesByCandidate[c.id]);
  const out: DriftPoint[] = [];
  for (const c of withMatch) {
    const past = pastWarmthDays(c, monthsAgo, nowMs);
    if (past === null) continue; // not yet benched at this point — hidden, per council amendments §2
    const match = matchesByCandidate[c.id];
    const fit = match.override?.score ?? match.score;
    const angleDeg = angleForWarmthDays(past);
    const radius = radiusForFit(fit, geo);
    const { x, y } = polarToXY(geo.cx, geo.cy, radius, angleDeg);
    out.push({
      id: c.id, name: c.name, x, y,
      r: radiusForSeniority(c.seniority),
      color: colorForStatus(c.status),
      fit, ring: fit >= 80 ? 'strong' : fit >= 60 ? 'possible' : 'not_yet',
      warmthDays: past, pastWarmthDays: past, angleDeg,
      status: c.status,
      why: match.override?.reason ?? match.why,
    });
  }
  return out;
}

export interface DriftSummary {
  /** how many were "warm" (touched inside a month) six months ago. */
  warmThen: number;
  /** of those, how many have since cooled (no longer warm today). */
  cooledSince: number;
  cooledIds: Id[];
  monthLabel: string;
}

/** The fixed 6-month caption per council amendments §2 — independent of whatever the slider
 * is currently scrubbed to. "6 months ago, {a} of these were warm. {b} have cooled since." */
export function computeDriftSummary(
  candidates: Candidate[],
  matchesByCandidate: Record<string, Match>,
  nowMs: number = Date.now(),
  monthsBack = 6,
): DriftSummary {
  const now = new Date(nowMs);
  const monthLabel = new Date(nowMs - monthsBack * AVG_MONTH_DAYS * DAY_MS)
    .toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  let warmThen = 0;
  const cooledIds: Id[] = [];
  for (const c of candidates) {
    if (!matchesByCandidate[c.id]) continue;
    const past = pastWarmthDays(c, monthsBack, nowMs);
    if (past === null || past > WARM_DAYS_THRESHOLD) continue; // wasn't warm 6 months ago
    warmThen++;
    const currentDays = Math.max(0, Math.floor((now.getTime() - new Date(c.warmthAt).getTime()) / DAY_MS));
    if (currentDays > WARM_DAYS_THRESHOLD) cooledIds.push(c.id);
  }
  return { warmThen, cooledSince: cooledIds.length, cooledIds, monthLabel };
}

/**
 * "Add those {b} to Today" — council amendments §2. Today's queue (dataService.computeTodayQueue,
 * B1-owned) already resurfaces anyone active with no touch in 14+ days as a follow-up, and every
 * cooled-since candidate qualifies by definition (>30 days untouched). This button's job is to
 * make the *reason* explicit and durable on their record, not to reinvent the queue: it logs a
 * reminder + a note carrying the literal "cooled since {month}" wording so it shows in their
 * Story/Activity, and the follow-up bucket picks them up on the next render.
 */
export async function addCooledToToday(candidateIds: Id[], monthLabel: string): Promise<void> {
  const body = `Cooled since ${monthLabel} — added to Today from the Target's drift view`;
  await Promise.all(candidateIds.map(async id => {
    const c = await dataService.get('candidates', id);
    if (!c) return;
    const note = { id: ulid(), body, at: new Date().toISOString(), actor: 'owner' };
    await dataService.put('candidates', { ...c, notes: [...c.notes, note], updatedAt: new Date().toISOString() });
    await dataService.logActivity({ candidateId: id, type: 'reminder', actor: 'owner', body });
  }));
}
