import { describe, it, expect } from 'vitest';
import { buildPoints, colorForStatus } from '../features/map/lib/geometry';
import type { Candidate, Match } from '../types';

const NOW = new Date('2026-06-01T00:00:00.000Z').getTime();

function candidate(id: string, overrides: Partial<Candidate> = {}): Candidate {
  return {
    id, name: `Cand ${id}`, location: 'Remote', currentEmployer: 'Acme', currentTitle: 'Eng',
    tenureStart: '2024-01-01T00:00:00.000Z', seniority: 'senior', skills: [], tags: [],
    status: 'active', warmthAt: '2026-05-01T00:00:00.000Z', sourceDate: '2024-01-01T00:00:00.000Z',
    notes: [], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
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

describe('buildPoints', () => {
  it('is deterministic — identical input produces identical pixels', () => {
    const candidates = [candidate('a'), candidate('b')];
    const matches = { a: match('a', 70), b: match('b', 40) };
    const first = buildPoints(candidates, matches, 640, 420, undefined, NOW);
    const second = buildPoints(candidates, matches, 640, 420, undefined, NOW);
    expect(first.points).toEqual(second.points);
  });

  it('only plots candidates that have a match for this role', () => {
    const candidates = [candidate('a'), candidate('b')];
    const matches = { a: match('a', 70) };
    const { points } = buildPoints(candidates, matches, 640, 420, undefined, NOW);
    expect(points.map(p => p.id)).toEqual(['a']);
  });

  it('a higher fit score plots further right', () => {
    const candidates = [candidate('a'), candidate('b')];
    const matches = { a: match('a', 90), b: match('b', 10) };
    const { points } = buildPoints(candidates, matches, 640, 420, undefined, NOW);
    const a = points.find(p => p.id === 'a')!;
    const b = points.find(p => p.id === 'b')!;
    expect(a.x).toBeGreaterThan(b.x);
  });

  it('an override score wins over the raw score for x position', () => {
    const overridden: Match = { ...match('a', 20), override: { score: 95, reason: 'known quantity', at: new Date(NOW).toISOString() } };
    const { points } = buildPoints([candidate('a')], { a: overridden }, 640, 420, undefined, NOW);
    expect(points[0].fit).toBe(95);
  });

  it('respects the seniority → size ordering', () => {
    const candidates = [candidate('a', { seniority: 'junior' }), candidate('b', { seniority: 'principal' })];
    const matches = { a: match('a', 50), b: match('b', 50) };
    const { points } = buildPoints(candidates, matches, 640, 420, undefined, NOW);
    const junior = points.find(p => p.id === 'a')!;
    const principal = points.find(p => p.id === 'b')!;
    expect(principal.r).toBeGreaterThan(junior.r);
  });
});

describe('colorForStatus', () => {
  it('maps every candidate status to a color', () => {
    expect(colorForStatus('active')).toMatch(/accent/);
    // Polish pass palette: took-a-role is blue (informational), do-not-re-approach is amber
    // (a caution you can still see past), opted-out is the only red.
    expect(colorForStatus('took_role')).toMatch(/info/);
    expect(colorForStatus('do_not_reapproach')).toMatch(/amber/);
    expect(colorForStatus('opted_out')).toMatch(/danger/);
  });
});
