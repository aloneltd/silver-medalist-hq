import { describe, it, expect } from 'vitest';
import { findLookalikes, cosineSimilarity } from '../lib/lookalikes';
import type { Candidate } from '../types';

function makeCandidate(id: string, overrides: Partial<Candidate> = {}): Candidate {
  const now = new Date().toISOString();
  return {
    id, name: `Candidate ${id}`, location: 'Berlin, Germany', currentEmployer: 'Acme',
    currentTitle: 'Engineer', tenureStart: now, seniority: 'senior',
    skills: ['TypeScript', 'React', 'Node'], tags: [], status: 'active',
    warmthAt: now, sourceDate: now, notes: [], createdAt: now, updatedAt: now, ...overrides,
  };
}

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors', () => {
    const v = new Map([['a', 2], ['b', 3]]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1);
  });

  it('is 0 for disjoint vectors', () => {
    const a = new Map([['a', 1]]);
    const b = new Map([['b', 1]]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('is 0 when either vector is empty', () => {
    expect(cosineSimilarity(new Map(), new Map([['a', 1]]))).toBe(0);
  });
});

describe('findLookalikes', () => {
  it('ranks a near-identical profile above an unrelated one', () => {
    const target = makeCandidate('target');
    const close = makeCandidate('close', { skills: ['TypeScript', 'React', 'GraphQL'] });
    const far = makeCandidate('far', {
      skills: ['Photoshop', 'Figma'], seniority: 'junior', location: 'Manila, Philippines',
    });

    const results = findLookalikes(target, [close, far]);
    expect(results[0].candidateId).toBe('close');
    expect(results[0].score).toBeGreaterThan(results[1]?.score ?? 0);
  });

  it('excludes the target itself even if present in the pool', () => {
    const target = makeCandidate('t1');
    const results = findLookalikes(target, [target, makeCandidate('other')]);
    expect(results.every(r => r.candidateId !== 't1')).toBe(true);
  });

  it('excludes opted_out and do_not_reapproach from the pool', () => {
    const target = makeCandidate('t1');
    const optedOut = makeCandidate('opted', { status: 'opted_out' });
    const doNot = makeCandidate('donot', { status: 'do_not_reapproach' });
    const results = findLookalikes(target, [optedOut, doNot]);
    expect(results).toHaveLength(0);
  });

  it('caps results at the given limit', () => {
    const target = makeCandidate('t1');
    const pool = Array.from({ length: 10 }, (_, i) => makeCandidate(`p${i}`));
    const results = findLookalikes(target, pool, 5);
    expect(results).toHaveLength(5);
  });

  it('produces a reason mentioning shared skills and seniority', () => {
    const target = makeCandidate('t1', { skills: ['Go', 'Kubernetes'] });
    const other = makeCandidate('o1', { skills: ['Go', 'Kubernetes', 'Docker'] });
    const [result] = findLookalikes(target, [other]);
    expect(result.reason).toMatch(/shared skill/i);
    expect(result.reason).toMatch(/same seniority/i);
  });

  it('never includes a zero-similarity candidate', () => {
    const target = makeCandidate('t1', { skills: ['Rust'], seniority: 'exec', location: 'Reykjavik, Iceland' });
    const unrelated = makeCandidate('u1', { skills: ['Sales'], seniority: 'junior', location: 'Lagos, Nigeria' });
    const results = findLookalikes(target, [unrelated]);
    expect(results).toHaveLength(0);
  });

  it('is deterministic across repeated calls on identical input', () => {
    const target = makeCandidate('t1');
    const pool = [makeCandidate('a'), makeCandidate('b'), makeCandidate('c')];
    const first = findLookalikes(target, pool);
    const second = findLookalikes(target, pool);
    expect(first).toEqual(second);
  });
});
