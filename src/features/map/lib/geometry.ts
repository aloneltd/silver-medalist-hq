import type { Candidate, Match, Seniority } from '../../../types';
import { daysSince } from '../../bench/lib/warmth';

/**
 * The Target — DESIGN-v2.1.md §B, council amendments §1 ("Target = target + clock"):
 *   distance from centre = fit for the selected role (rings 80+ / 60-79 / <60)
 *   angle around the dial  = time since last contact (12 o'clock = this week, clockwise)
 *   colour                 = status only (warmth used to double as colour — cut, redundant with angle)
 *   size                   = seniority
 * Deterministic: identical candidates + matches + `now` always produce identical pixels.
 */

export type RingKey = 'strong' | 'possible' | 'not_yet';

export interface RingBand {
  key: RingKey;
  label: string;
  /** inclusive lower bound on fit that lands in this ring */
  min: number;
  /** exclusive upper bound (Infinity for the outer ring) */
  max: number;
}

/** council amendments §1: "Strong fit 80+ / Possible 60-79 / Not yet". */
export const RING_BANDS: RingBand[] = [
  { key: 'strong', label: 'Strong fit 80+', min: 80, max: Infinity },
  { key: 'possible', label: 'Possible 60–79', min: 60, max: 80 },
  { key: 'not_yet', label: 'Not yet', min: -Infinity, max: 60 },
];

export function ringForFit(fit: number): RingKey {
  if (fit >= 80) return 'strong';
  if (fit >= 60) return 'possible';
  return 'not_yet';
}

export interface TargetPoint {
  id: string;
  name: string;
  x: number;
  y: number;
  r: number;
  color: string;
  fit: number;
  ring: RingKey;
  /** whole days since last contact, clamped for the dial at 365 ("12 months+"). */
  warmthDays: number;
  /** degrees clockwise from 12 o'clock (0 = this week, ~355 = 12 months+). */
  angleDeg: number;
  status: Candidate['status'];
  why: string;
}

export interface TargetGeometry {
  cx: number;
  cy: number;
  rOuter: number;
  /** radius of the strong/possible ring boundary (fit = 80). */
  rStrong: number;
  /** radius of the possible/not-yet ring boundary (fit = 60). */
  rPossible: number;
}

/** Same hue per status as the bench chips — active teal / silent grey / took-role blue /
 * do-not amber / opted-out red. Colour carries status ONLY now (council amendments §1) — it
 * used to also carry warmth, which just doubled up what the clock angle already says. */
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

/** size = seniority, per BLUEPRINT-v2.md — deterministic, not proportional to anything fuzzy. */
const SENIORITY_RADIUS: Record<Seniority, number> = {
  junior: 4, mid: 6, senior: 8, staff: 10, principal: 12, exec: 14,
};

export function radiusForSeniority(s: Seniority): number {
  return SENIORITY_RADIUS[s] ?? 6;
}

/** The dial doesn't sweep a full 360° — the last few degrees are left open so "just under 12
 * months" is never pixel-adjacent to "this week" (they'd be indistinguishable at a glance). */
const DIAL_SWEEP_DEG = 355;
const DIAL_CAP_DAYS = 365;

/** 0 days -> 0° (12 o'clock, "this week"); ~182 days -> ~180° (6 o'clock, "6 months"); capped
 * at 365+ days -> 355° (just shy of 12 o'clock again, i.e. "~11 o'clock"). */
export function angleForWarmthDays(days: number): number {
  const clamped = Math.max(0, Math.min(DIAL_CAP_DAYS, days));
  return (clamped / DIAL_CAP_DAYS) * DIAL_SWEEP_DEG;
}

/** Polar -> cartesian, clockwise from 12 o'clock (screen coords, y grows down). */
export function polarToXY(cx: number, cy: number, radius: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + radius * Math.sin(rad), y: cy - radius * Math.cos(rad) };
}

/**
 * Fit -> radius. Each ring band gets an equal third of the outer radius, and fit interpolates
 * linearly *within* its band — so fit=80 always lands exactly on the strong/possible boundary
 * and fit=60 exactly on the possible/not-yet boundary, whatever `rOuter` is.
 */
export function radiusForFit(fit: number, geo: TargetGeometry): number {
  const clamped = Math.max(0, Math.min(100, fit));
  if (clamped >= 80) {
    return geo.rStrong * (100 - clamped) / 20;
  }
  if (clamped >= 60) {
    return geo.rStrong + (geo.rPossible - geo.rStrong) * (80 - clamped) / 20;
  }
  return geo.rPossible + (geo.rOuter - geo.rPossible) * (60 - clamped) / 60;
}

export function buildTargetGeometry(width: number, height: number, legendGutter = 0): TargetGeometry {
  const cx = width / 2;
  const cy = (height - legendGutter) / 2 + legendGutter;
  const rOuter = Math.max(20, Math.min(cx, cy - legendGutter) - 34);
  return { cx, cy, rOuter, rStrong: rOuter / 3, rPossible: (rOuter / 3) * 2 };
}

/**
 * Builds today's Target points. `nowMs` and `monthsAgo` together drive Drift: pass
 * `monthsAgo > 0` to compute where the dial would have placed each candidate that far back
 * (see lib/drift.ts for the "not yet benched then" cut and the warm/cooled counts).
 */
export function buildTargetPoints(
  candidates: Candidate[],
  matchesByCandidate: Record<string, Match>,
  geo: TargetGeometry,
  nowMs: number = Date.now(),
): TargetPoint[] {
  const withMatch = candidates.filter(c => matchesByCandidate[c.id]);
  return withMatch.map(c => {
    const match = matchesByCandidate[c.id];
    const fit = match.override?.score ?? match.score;
    const warmthDays = daysSince(c.warmthAt, nowMs);
    const angleDeg = angleForWarmthDays(warmthDays);
    const radius = radiusForFit(fit, geo);
    const { x, y } = polarToXY(geo.cx, geo.cy, radius, angleDeg);
    return {
      id: c.id,
      name: c.name,
      x, y,
      r: radiusForSeniority(c.seniority),
      color: colorForStatus(c.status),
      fit,
      ring: ringForFit(fit),
      warmthDays,
      angleDeg,
      status: c.status,
      why: match.override?.reason ?? match.why,
    };
  });
}

/** Screen quadrant relative to the dial's centre — used for the sub-line's "{N} people sit
 * {quadrant}" clause (council amendments §1). */
export type Quadrant = 'top-right' | 'bottom-right' | 'bottom-left' | 'top-left';

export function quadrantOf(x: number, y: number, geo: TargetGeometry): Quadrant {
  const right = x >= geo.cx;
  const bottom = y >= geo.cy;
  if (right && !bottom) return 'top-right';
  if (right && bottom) return 'bottom-right';
  if (!right && bottom) return 'bottom-left';
  return 'top-left';
}

export const QUADRANT_LABEL: Record<Quadrant, string> = {
  'top-right': 'top-right',
  'bottom-right': 'bottom-right',
  'bottom-left': 'bottom-left',
  'top-left': 'top-left',
};
