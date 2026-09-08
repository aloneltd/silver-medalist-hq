import { scaleLinear, scaleOrdinal } from 'd3-scale';
import type { Candidate, Match, Seniority } from '../../../types';
import { daysSince } from '../../bench/lib/warmth';

export interface MapPoint {
  id: string;
  name: string;
  x: number;
  y: number;
  r: number;
  color: string;
  fit: number;
  days: number;
  status: Candidate['status'];
  why: string;
}

export interface MapMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const DEFAULT_MARGINS: MapMargins = { top: 32, right: 24, bottom: 40, left: 48 };

/** size = seniority, per BLUEPRINT-v2.md — deterministic, not proportional to anything fuzzy. */
const seniorityRadius = scaleOrdinal<Seniority, number>()
  .domain(['junior', 'mid', 'senior', 'staff', 'principal', 'exec'])
  .range([4, 6, 8, 10, 12, 14]);

/** Same hue per status as the bench chips — teal / grey / blue / amber / red. */
const STATUS_COLOR: Record<Candidate['status'], string> = {
  active: 'var(--accent)',
  silent: 'var(--ink-muted)',
  took_role: 'var(--info)',
  do_not_reapproach: 'var(--amber)',
  opted_out: 'var(--danger)',
};

export function colorForStatus(status: Candidate['status']): string {
  return STATUS_COLOR[status] ?? STATUS_COLOR.active;
}

/**
 * Deterministic scatter geometry: same candidates + matches always produce the same pixels.
 * x = fit score for the role (0-100), y = days since last touch (inverted: fewer days = higher
 * up, i.e. "warm" points sit near the top), size = seniority, colour = status.
 */
export function buildPoints(
  candidates: Candidate[],
  matchesByCandidate: Record<string, Match>,
  width: number,
  height: number,
  margins: MapMargins = DEFAULT_MARGINS,
  now: number = Date.now(),
): { points: MapPoint[]; maxDays: number } {
  const innerW = Math.max(1, width - margins.left - margins.right);
  const innerH = Math.max(1, height - margins.top - margins.bottom);

  const withMatch = candidates.filter(c => matchesByCandidate[c.id]);
  const maxDays = Math.max(30, ...withMatch.map(c => daysSince(c.warmthAt, now)));

  const xScale = scaleLinear().domain([0, 100]).range([0, innerW]).clamp(true);
  // Inverted range: y=0 (top, "warm") maps to 0 days; y=innerH (bottom, "cold") maps to maxDays.
  const yScale = scaleLinear().domain([0, maxDays]).range([0, innerH]).clamp(true);

  const points: MapPoint[] = withMatch.map(c => {
    const match = matchesByCandidate[c.id];
    const fit = match.override?.score ?? match.score;
    const days = daysSince(c.warmthAt, now);
    return {
      id: c.id,
      name: c.name,
      x: margins.left + xScale(fit),
      y: margins.top + yScale(days),
      r: seniorityRadius(c.seniority),
      color: colorForStatus(c.status),
      fit,
      days,
      status: c.status,
      why: match.override?.reason ?? match.why,
    };
  });

  return { points, maxDays };
}
