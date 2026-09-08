import { describe, it, expect } from 'vitest';
import {
  buildTargetGeometry, buildTargetPoints, colorForStatus, ringForFit,
  radiusForFit, angleForWarmthDays,
} from '../features/map/lib/geometry';
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

describe('buildTargetPoints', () => {
  const geo = buildTargetGeometry(640, 460);

  it('is deterministic — identical input produces identical pixels', () => {
    const candidates = [candidate('a'), candidate('b')];
    const matches = { a: match('a', 70), b: match('b', 40) };
    const first = buildTargetPoints(candidates, matches, geo, NOW);
    const second = buildTargetPoints(candidates, matches, geo, NOW);
    expect(first).toEqual(second);
  });

  it('only plots candidates that have a match for this role', () => {
    const candidates = [candidate('a'), candidate('b')];
    const matches = { a: match('a', 70) };
    const points = buildTargetPoints(candidates, matches, geo, NOW);
    expect(points.map(p => p.id)).toEqual(['a']);
  });

  it('a higher fit score plots closer to the centre', () => {
    const candidates = [candidate('a'), candidate('b')];
    const matches = { a: match('a', 90), b: match('b', 10) };
    const points = buildTargetPoints(candidates, matches, geo, NOW);
    const a = points.find(p => p.id === 'a')!;
    const b = points.find(p => p.id === 'b')!;
    const distA = Math.hypot(a.x - geo.cx, a.y - geo.cy);
    const distB = Math.hypot(b.x - geo.cx, b.y - geo.cy);
    expect(distA).toBeLessThan(distB);
  });

  it('an override score wins over the raw score for distance/ring', () => {
    const overridden: Match = { ...match('a', 20), override: { score: 95, reason: 'known quantity', at: new Date(NOW).toISOString() } };
    const points = buildTargetPoints([candidate('a')], { a: overridden }, geo, NOW);
    expect(points[0].fit).toBe(95);
    expect(points[0].ring).toBe('strong');
  });

  it('respects the seniority → size ordering', () => {
    const candidates = [candidate('a', { seniority: 'junior' }), candidate('b', { seniority: 'principal' })];
    const matches = { a: match('a', 50), b: match('b', 50) };
    const points = buildTargetPoints(candidates, matches, geo, NOW);
    const junior = points.find(p => p.id === 'a')!;
    const principal = points.find(p => p.id === 'b')!;
    expect(principal.r).toBeGreaterThan(junior.r);
  });

  it('someone touched this week sits at 12 o\'clock (angle 0)', () => {
    const points = buildTargetPoints(
      [candidate('a', { warmthAt: new Date(NOW).toISOString() })],
      { a: match('a', 50) }, geo, NOW,
    );
    expect(points[0].angleDeg).toBe(0);
    // top of the dial: x === centre, y < centre
    expect(Math.round(points[0].x)).toBe(geo.cx);
    expect(points[0].y).toBeLessThan(geo.cy);
  });
});

describe('ringForFit / radiusForFit', () => {
  const geo = buildTargetGeometry(640, 460);
  it('bands fit into the three rings at the documented boundaries', () => {
    expect(ringForFit(100)).toBe('strong');
    expect(ringForFit(80)).toBe('strong');
    expect(ringForFit(79.9)).toBe('possible');
    expect(ringForFit(60)).toBe('possible');
    expect(ringForFit(59.9)).toBe('not_yet');
    expect(ringForFit(0)).toBe('not_yet');
  });
  it('fit=80 lands exactly on the strong/possible boundary radius', () => {
    expect(radiusForFit(80, geo)).toBeCloseTo(geo.rStrong, 5);
  });
  it('fit=60 lands exactly on the possible/not-yet boundary radius', () => {
    expect(radiusForFit(60, geo)).toBeCloseTo(geo.rPossible, 5);
  });
  it('fit=100 sits at the centre', () => {
    expect(radiusForFit(100, geo)).toBeCloseTo(0, 5);
  });
});

describe('angleForWarmthDays', () => {
  it('0 days is the top of the dial (this week)', () => {
    expect(angleForWarmthDays(0)).toBe(0);
  });
  it('~6 months lands near the bottom (180°)', () => {
    expect(angleForWarmthDays(182.5)).toBeGreaterThan(170);
    expect(angleForWarmthDays(182.5)).toBeLessThan(190);
  });
  it('12 months caps just shy of a full turn, never wrapping onto "this week"', () => {
    expect(angleForWarmthDays(365)).toBeLessThan(360);
    expect(angleForWarmthDays(9999)).toBe(angleForWarmthDays(365));
  });
});

describe('colorForStatus', () => {
  it('maps every candidate status to a color, status only (no warmth double-encoding)', () => {
    expect(colorForStatus('active')).toMatch(/accent/);
    expect(colorForStatus('took_role')).toMatch(/info/);
    expect(colorForStatus('do_not_reapproach')).toMatch(/amber/);
    expect(colorForStatus('opted_out')).toMatch(/danger/);
  });
});
