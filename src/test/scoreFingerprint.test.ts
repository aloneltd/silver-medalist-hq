import { describe, it, expect } from 'vitest';
import { scoreFingerprint } from '../lib/scoreFingerprint';
import type { ScoreCandidateInput, ScoreRoleInput } from '../types';

const role: ScoreRoleInput = {
  id: 'r1', title: 'X', level: 'Senior', location: 'Remote',
  compBand: { min: 1, max: 2, currency: 'USD' }, mustHaves: ['a', 'b'], niceToHaves: [], dealbreakers: [],
};

function cand(id: string, overrides: Partial<ScoreCandidateInput> = {}): ScoreCandidateInput {
  return {
    id, name: 'n', skills: ['a'], seniority: 'senior', currentTitle: 't', currentEmployer: 'e',
    tenureStart: '2024-01-01T00:00:00.000Z', location: 'Remote', status: 'active',
    warmthAt: '2024-01-01T00:00:00.000Z', ...overrides,
  };
}

describe('scoreFingerprint', () => {
  it('is order-independent across candidates', () => {
    const a = scoreFingerprint(role, [cand('c1'), cand('c2')]);
    const b = scoreFingerprint(role, [cand('c2'), cand('c1')]);
    expect(a).toBe(b);
  });

  it('is stable for identical input', () => {
    const a = scoreFingerprint(role, [cand('c1')]);
    const b = scoreFingerprint(role, [cand('c1')]);
    expect(a).toBe(b);
  });

  it('changes when a candidate skill changes', () => {
    const a = scoreFingerprint(role, [cand('c1')]);
    const b = scoreFingerprint(role, [cand('c1', { skills: ['a', 'b'] })]);
    expect(a).not.toBe(b);
  });

  it('changes when the role changes', () => {
    const a = scoreFingerprint(role, [cand('c1')]);
    const b = scoreFingerprint({ ...role, mustHaves: ['a', 'b', 'c'] }, [cand('c1')]);
    expect(a).not.toBe(b);
  });
});
