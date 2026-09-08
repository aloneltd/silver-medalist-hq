import { describe, it, expect } from 'vitest';
import {
  daysSince, isStale, defaultResurfaceDate, statusRequiresReason, tenureMonths, formatWarmthDays,
} from '../features/bench/lib/warmth';
import type { Candidate } from '../types';

const NOW = new Date('2026-06-01T00:00:00.000Z').getTime();

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: 'c1', name: 'Test', location: 'Remote', currentEmployer: 'Acme', currentTitle: 'Eng',
    tenureStart: '2024-01-01T00:00:00.000Z', seniority: 'senior', skills: [], tags: [],
    status: 'active', warmthAt: '2026-05-01T00:00:00.000Z', sourceDate: '2024-01-01T00:00:00.000Z',
    notes: [], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('daysSince', () => {
  it('computes whole days and never goes negative', () => {
    expect(daysSince('2026-05-01T00:00:00.000Z', NOW)).toBe(31);
    expect(daysSince('2026-06-01T00:00:00.000Z', NOW)).toBe(0);
    expect(daysSince('2026-07-01T00:00:00.000Z', NOW)).toBe(0); // future timestamp, clamped
  });
});

describe('isStale', () => {
  it('is stale only for active candidates over 14 days since touch', () => {
    expect(isStale(candidate({ warmthAt: '2026-05-01T00:00:00.000Z' }), NOW)).toBe(true);
    expect(isStale(candidate({ warmthAt: '2026-05-30T00:00:00.000Z' }), NOW)).toBe(false);
    expect(isStale(candidate({ status: 'silent', warmthAt: '2026-01-01T00:00:00.000Z' }), NOW)).toBe(false);
  });
});

describe('defaultResurfaceDate', () => {
  it('adds 18 months', () => {
    const d = defaultResurfaceDate(new Date('2026-01-15T00:00:00.000Z'));
    expect(d.slice(0, 7)).toBe('2027-07');
  });
});

describe('statusRequiresReason', () => {
  it('requires a reason for every non-active status', () => {
    expect(statusRequiresReason('active')).toBe(false);
    expect(statusRequiresReason('silent')).toBe(true);
    expect(statusRequiresReason('took_role')).toBe(true);
    expect(statusRequiresReason('do_not_reapproach')).toBe(true);
    expect(statusRequiresReason('opted_out')).toBe(true);
  });
});

describe('tenureMonths', () => {
  it('computes whole months since tenure start', () => {
    expect(tenureMonths('2024-01-01T00:00:00.000Z', NOW)).toBeGreaterThanOrEqual(28);
    expect(tenureMonths('2026-06-01T00:00:00.000Z', NOW)).toBe(0);
  });
});

describe('formatWarmthDays', () => {
  it('reads naturally at 0, 1 and N days', () => {
    expect(formatWarmthDays(0)).toBe('today');
    expect(formatWarmthDays(1)).toBe('1 day');
    expect(formatWarmthDays(5)).toBe('5 days');
  });
});
