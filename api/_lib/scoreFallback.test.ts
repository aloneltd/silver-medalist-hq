import { describe, it, expect } from 'vitest';
import { scoreOneCandidateFallback, keywordFitFallback } from './scoreFallback';
import type { ScoreCandidateInput, ScoreRoleInput } from '../../src/types';

const ROLE: ScoreRoleInput = {
  id: 'r1', title: 'Senior Backend Engineer', level: 'Senior', location: 'Berlin',
  compBand: { min: 80000, max: 100000, currency: 'EUR' },
  mustHaves: ['Go', 'PostgreSQL'], niceToHaves: ['Kubernetes'], dealbreakers: [],
};

function candidate(overrides: Partial<ScoreCandidateInput> = {}): ScoreCandidateInput {
  return {
    id: 'c1', name: 'Test', skills: ['Go', 'PostgreSQL', 'Kubernetes'], seniority: 'senior',
    currentTitle: 'Backend Engineer', currentEmployer: 'Acme',
    tenureStart: new Date(Date.now() - 24 * 30 * 86_400_000).toISOString(),
    location: 'Berlin', status: 'active', warmthAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('keyword-fit fallback (deterministic, no network)', () => {
  it('is deterministic: same input -> identical output', () => {
    const c = candidate();
    const a = scoreOneCandidateFallback(c, ROLE, 1_700_000_000_000);
    const b = scoreOneCandidateFallback(c, ROLE, 1_700_000_000_000);
    expect(a).toEqual(b);
  });

  it('is always labelled as a fallback row', () => {
    const rows = keywordFitFallback(ROLE, [candidate()]);
    expect(rows[0].fallback).toBe(true);
  });

  it('scores full skill overlap higher than zero overlap', () => {
    const strong = scoreOneCandidateFallback(candidate({ skills: ['Go', 'PostgreSQL', 'Kubernetes'] }), ROLE);
    const weak = scoreOneCandidateFallback(candidate({ id: 'c2', skills: ['Photoshop'] }), ROLE);
    expect(strong.score).toBeGreaterThan(weak.score);
    expect(weak.flags).toContain('no matched skills');
  });

  it('flags comp more than 5% above band', () => {
    const overBand = scoreOneCandidateFallback(candidate({
      compExpectation: { amount: 200000, currency: 'EUR', date: new Date().toISOString() },
    }), ROLE);
    expect(overBand.flags).toContain('comp above band');
  });

  it('rewards the 18-36 month tenure window as prime timing over a too-new hire', () => {
    const prime = scoreOneCandidateFallback(candidate({
      tenureStart: new Date(Date.now() - 24 * 30 * 86_400_000).toISOString(),
    }), ROLE);
    const tooNew = scoreOneCandidateFallback(candidate({
      tenureStart: new Date(Date.now() - 2 * 30 * 86_400_000).toISOString(),
    }), ROLE);
    expect(prime.sub.timing).toBeGreaterThan(tooNew.sub.timing);
  });

  it('penalizes timing while a snooze is still active, rewards it once past due', () => {
    const stillSnoozed = scoreOneCandidateFallback(candidate({
      snoozeUntil: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    }), ROLE);
    const pastDue = scoreOneCandidateFallback(candidate({
      snoozeUntil: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    }), ROLE);
    expect(pastDue.sub.timing).toBeGreaterThan(stillSnoozed.sub.timing);
  });

  it('keeps every sub-score within 0-100 even at extremes', () => {
    const extreme = scoreOneCandidateFallback(candidate({
      skills: [],
      compExpectation: { amount: 10_000_000, currency: 'EUR', date: new Date().toISOString() },
      tenureStart: new Date(Date.now() - 200 * 30 * 86_400_000).toISOString(),
    }), ROLE);
    for (const v of Object.values(extreme.sub)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});
