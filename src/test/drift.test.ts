import { describe, it, expect } from 'vitest';
import { pastWarmthDays, computeDriftSummary, WARM_DAYS_THRESHOLD } from '../features/map/lib/drift';
import type { Candidate, Match } from '../types';

const NOW = new Date('2026-09-08T00:00:00.000Z').getTime();
const DAY_MS = 86_400_000;

function candidate(id: string, overrides: Partial<Candidate> = {}): Candidate {
  return {
    id, name: `Cand ${id}`, location: 'Remote', currentEmployer: 'Acme', currentTitle: 'Eng',
    tenureStart: '2024-01-01T00:00:00.000Z', seniority: 'senior', skills: [], tags: [],
    status: 'active', warmthAt: new Date(NOW - 5 * DAY_MS).toISOString(),
    sourceDate: new Date(NOW - 365 * DAY_MS).toISOString(),
    notes: [], createdAt: new Date(NOW).toISOString(), updatedAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

function match(candidateId: string, score: number): Match {
  return {
    id: `m-${candidateId}`, roleId: 'r1', candidateId, score,
    sub: { skills: score, seniority: score, comp: score, timing: score },
    why: 'because', flags: [], hash: 'h', stage: 'warm', stageUpdatedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('pastWarmthDays', () => {
  it('is gated on sourceDate, not the DB-bookkeeping createdAt — a seeded bench where every row shares one createdAt must still drift', () => {
    // Every row in the sample bench shares one seed-run `createdAt` (see sampleBench.ts), but
    // `sourceDate` is genuinely backdated per person — this is the bug that regressed the
    // Target's Drift slider to "everyone vanishes at 1 month back" before the fix.
    const c = candidate('a', {
      createdAt: new Date(NOW).toISOString(), // "now" — as every seeded row's createdAt is
      sourceDate: new Date(NOW - 365 * DAY_MS).toISOString(), // sourced a year ago
      warmthAt: new Date(NOW - 5 * DAY_MS).toISOString(),
    });
    const days = pastWarmthDays(c, 6, NOW);
    expect(days).not.toBeNull();
  });

  it('hides (returns null) a candidate not yet sourced at that point in time', () => {
    const c = candidate('a', { sourceDate: new Date(NOW - 30 * DAY_MS).toISOString() });
    expect(pastWarmthDays(c, 6, NOW)).toBeNull(); // 6 months ago is before they were sourced
  });

  it('0 months back is just today\'s warmth days', () => {
    const c = candidate('a', { warmthAt: new Date(NOW - 12 * DAY_MS).toISOString() });
    expect(pastWarmthDays(c, 0, NOW)).toBe(12);
  });

  it('clamps to 0 (an honest "fresh then" approximation) when the touch on file postdates the past point', () => {
    const c = candidate('a', {
      sourceDate: new Date(NOW - 365 * DAY_MS).toISOString(),
      warmthAt: new Date(NOW - 5 * DAY_MS).toISOString(), // touched 5 days ago
    });
    expect(pastWarmthDays(c, 3, NOW)).toBe(0); // 3 months ago predates that touch
  });

  it('walks warmthAt forward correctly for an old, untouched-since touch', () => {
    const c = candidate('a', {
      sourceDate: new Date(NOW - 365 * DAY_MS).toISOString(),
      warmthAt: new Date(NOW - 200 * DAY_MS).toISOString(),
    });
    // 3 months ~= 91 days back; they were touched 200 days before now, i.e. ~109 days before that point.
    expect(pastWarmthDays(c, 3, NOW)).toBeGreaterThan(100);
    expect(pastWarmthDays(c, 3, NOW)).toBeLessThan(115);
  });
});

describe('computeDriftSummary', () => {
  it('counts who was warm 6 months ago and who of those has since cooled', () => {
    const warmThenCooledNow = candidate('a', {
      sourceDate: new Date(NOW - 365 * DAY_MS).toISOString(),
      // 6 months ago they'd been touched recently (warm then); today it's stale.
      warmthAt: new Date(NOW - (182 * DAY_MS) - 10 * DAY_MS).toISOString(),
    });
    const stillWarmBoth = candidate('b', {
      sourceDate: new Date(NOW - 365 * DAY_MS).toISOString(),
      warmthAt: new Date(NOW - 2 * DAY_MS).toISOString(), // touched 2 days ago -> warm then and now
    });
    const notOnBenchThen = candidate('c', { sourceDate: new Date(NOW - 30 * DAY_MS).toISOString() });

    const candidates = [warmThenCooledNow, stillWarmBoth, notOnBenchThen];
    const matches = {
      [warmThenCooledNow.id]: match(warmThenCooledNow.id, 80),
      [stillWarmBoth.id]: match(stillWarmBoth.id, 80),
      [notOnBenchThen.id]: match(notOnBenchThen.id, 80),
    };

    const summary = computeDriftSummary(candidates, matches, NOW, 6);
    expect(summary.warmThen).toBeGreaterThanOrEqual(1);
    expect(summary.cooledIds).toContain(warmThenCooledNow.id);
    expect(summary.cooledIds).not.toContain(stillWarmBoth.id);
  });

  it('WARM_DAYS_THRESHOLD is 30 days, matching "still warm" vocabulary elsewhere', () => {
    expect(WARM_DAYS_THRESHOLD).toBe(30);
  });
});
