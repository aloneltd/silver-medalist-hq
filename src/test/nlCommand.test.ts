import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db/schema';
import { ulid } from '../lib/ulid';
import type { Candidate, Match } from '../types';
import {
  resolveRelativeDate, resolveFilter, preview, apply, undo, hasUndo,
} from '../services/nlCommand';

function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  const now = new Date().toISOString();
  return {
    id: ulid(), name: 'Test Candidate', location: 'Berlin, Germany', currentEmployer: 'Acme',
    currentTitle: 'Engineer', tenureStart: now, seniority: 'senior', skills: ['TypeScript'],
    tags: [], status: 'active', warmthAt: now, sourceDate: now, notes: [],
    createdAt: now, updatedAt: now, ...overrides,
  };
}

function makeMatch(candidateId: string, overrides: Partial<Match> = {}): Match {
  const now = new Date().toISOString();
  return {
    id: ulid(), roleId: 'role-1', candidateId, score: 70,
    sub: { skills: 70, seniority: 70, comp: 70, timing: 70 }, why: 'fit', flags: [],
    hash: 'h', stage: 'warm', stageUpdatedAt: now, updatedAt: now, ...overrides,
  };
}

beforeEach(async () => {
  await Promise.all([
    db.candidates.clear(), db.roles.clear(), db.processes.clear(),
    db.matches.clear(), db.activities.clear(), db.sequences.clear(), db.settings.clear(),
  ]);
});

describe('resolveRelativeDate', () => {
  // Fixed "now" so season/month math is deterministic regardless of when the suite runs.
  const NOW = new Date('2026-09-08T12:00:00.000Z');

  it('resolves "in 2 weeks" to +14 days', () => {
    const iso = resolveRelativeDate('in 2 weeks', NOW);
    const days = (new Date(iso!).getTime() - NOW.getTime()) / 86_400_000;
    expect(days).toBeCloseTo(14, 0);
  });

  it('resolves "spring" to next March 1st when spring has already passed this year', () => {
    const iso = resolveRelativeDate('spring', NOW);
    const d = new Date(iso!);
    expect(d.getUTCFullYear()).toBe(2027);
    expect(d.getUTCMonth()).toBe(2); // March, 0-indexed
  });

  it('resolves "next month" to the same day one calendar month later', () => {
    const iso = resolveRelativeDate('next month', NOW);
    const d = new Date(iso!);
    expect(d.getUTCMonth()).toBe(9); // October
  });

  it('resolves "tomorrow" to +1 day', () => {
    const iso = resolveRelativeDate('tomorrow', NOW);
    const days = Math.round((new Date(iso!).getTime() - NOW.getTime()) / 86_400_000);
    expect(days).toBe(1);
  });

  it('passes a concrete date through unchanged', () => {
    const iso = resolveRelativeDate('2027-03-01', NOW);
    expect(new Date(iso!).getUTCFullYear()).toBe(2027);
  });

  it('returns undefined for an unrecognised phrase rather than guessing', () => {
    expect(resolveRelativeDate('whenever, i guess', NOW)).toBeUndefined();
  });

  it('is deterministic for the same phrase and now', () => {
    const a = resolveRelativeDate('in 3 months', NOW);
    const b = resolveRelativeDate('in 3 months', NOW);
    expect(a).toBe(b);
  });
});

describe('resolveFilter', () => {
  it('filters by status', () => {
    const active = makeCandidate({ status: 'active' });
    const silent = makeCandidate({ status: 'silent' });
    const result = resolveFilter({ status: ['active'] }, [active, silent]);
    expect(result.map(c => c.id)).toEqual([active.id]);
  });

  it('filters by name substring, case-insensitive', () => {
    const kofi = makeCandidate({ name: 'Kofi Mensah' });
    const other = makeCandidate({ name: 'Someone Else' });
    const result = resolveFilter({ names: ['kofi'] }, [kofi, other]);
    expect(result.map(c => c.id)).toEqual([kofi.id]);
  });

  it('filters by skills requiring every listed skill present', () => {
    const has = makeCandidate({ skills: ['Go', 'Kubernetes', 'PostgreSQL'] });
    const partial = makeCandidate({ skills: ['Go'] });
    const result = resolveFilter({ skillsInclude: ['Go', 'Kubernetes'] }, [has, partial]);
    expect(result.map(c => c.id)).toEqual([has.id]);
  });

  it('filters by board stage using the matches array', () => {
    const repliedCandidate = makeCandidate();
    const warmCandidate = makeCandidate();
    const matches = [makeMatch(repliedCandidate.id, { stage: 'replied' }), makeMatch(warmCandidate.id, { stage: 'warm' })];
    const result = resolveFilter({ boardStage: 'replied' }, [repliedCandidate, warmCandidate], matches);
    expect(result.map(c => c.id)).toEqual([repliedCandidate.id]);
  });

  it('falls back to free-text search across name/title/employer/skills', () => {
    const match = makeCandidate({ currentTitle: 'Staff SRE' });
    const nomatch = makeCandidate({ currentTitle: 'Product Designer' });
    const result = resolveFilter({ text: 'SRE' }, [match, nomatch]);
    expect(result.map(c => c.id)).toEqual([match.id]);
  });
});

describe('preview', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('flags overReach when more than 10 candidates match', async () => {
    const candidates = Array.from({ length: 12 }, () => makeCandidate({ status: 'active' }));
    await db.candidates.bulkPut(candidates);

    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      plan: { action: 'status', target: { status: ['active'] }, params: { status: 'silent' }, explanation: 'mark everyone silent' },
    }), { status: 200 })) as unknown as typeof fetch;

    const result = await preview('mark everyone silent');
    expect(result.matches.length).toBe(12);
    expect(result.overReach).toBe(true);
    globalThis.fetch = originalFetch;
  });

  it('falls back to a plain-search plan when the API call fails', async () => {
    globalThis.fetch = vi.fn(async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    const result = await preview('anything at all');
    expect(result.plan.action).toBe('filter');
    globalThis.fetch = originalFetch;
  });
});

describe('apply + undo', () => {
  it('snoozes the resolved candidates and undo restores the previous snoozeUntil', async () => {
    const c = makeCandidate({ status: 'took_role' });
    await db.candidates.put(c);

    const plan = {
      action: 'snooze' as const,
      target: { status: ['took_role' as const] },
      params: { until: '2027-03-01' },
      explanation: 'Snooze until spring',
    };
    const result = await apply(plan, [c.id], { originalText: 'snooze until spring' });
    expect(result.affected).toBe(1);

    const updated = await db.candidates.get(c.id);
    expect(new Date(updated!.snoozeUntil!).getUTCFullYear()).toBe(2027);

    const activities = await db.activities.where('candidateId').equals(c.id).toArray();
    expect(activities.some(a => a.type === 'nl_command')).toBe(true);

    expect(hasUndo()).toBe(true);
    await undo();
    const reverted = await db.candidates.get(c.id);
    expect(reverted!.snoozeUntil).toBeUndefined();
    expect(hasUndo()).toBe(false);
  });

  it('changes status through dataService.applyStatus and logs the reason', async () => {
    const c = makeCandidate({ status: 'active' });
    await db.candidates.put(c);

    const plan = {
      action: 'status' as const,
      target: { status: ['active' as const] },
      params: { status: 'do_not_reapproach' as const },
      explanation: 'Values mismatch',
    };
    await apply(plan, [c.id]);
    const updated = await db.candidates.get(c.id);
    expect(updated!.status).toBe('do_not_reapproach');
  });

  it('adds a tag without duplicating it on a second apply', async () => {
    const c = makeCandidate({ tags: ['existing'] });
    await db.candidates.put(c);
    const plan = { action: 'tag' as const, target: {}, params: { tag: 'founding-team' }, explanation: 'Tag founding team' };
    await apply(plan, [c.id]);
    await apply(plan, [c.id]);
    const updated = await db.candidates.get(c.id);
    expect(updated!.tags.filter(t => t === 'founding-team')).toHaveLength(1);
  });

  it('moves board stage via the correct match id for the given role', async () => {
    const c = makeCandidate();
    const match = makeMatch(c.id, { stage: 'replied' });
    await db.candidates.put(c);
    await db.matches.put(match);

    const plan = { action: 'move_stage' as const, target: { boardStage: 'replied' as const }, params: { stage: 'interviewing' as const }, explanation: 'Move to interviewing' };
    await apply(plan, [c.id], { roleId: 'role-1' });
    const updated = await db.matches.get(match.id);
    expect(updated!.stage).toBe('interviewing');
  });

  it('throws a clear error for move_stage without a roleId', async () => {
    const c = makeCandidate();
    await db.candidates.put(c);
    const plan = { action: 'move_stage' as const, target: {}, params: { stage: 'offer' as const }, explanation: 'x' };
    await expect(apply(plan, [c.id])).rejects.toThrow(/role/i);
  });

  it('is a no-op with nothing to undo for a filter/compose plan', async () => {
    const c = makeCandidate();
    await db.candidates.put(c);
    const plan = { action: 'filter' as const, target: {}, params: {}, explanation: 'Search' };
    const result = await apply(plan, [c.id]);
    expect(result.affected).toBe(1);
    expect(hasUndo()).toBe(false);
  });

  it('returns affected:0 and a safe no-op undo for an empty id list', async () => {
    const plan = { action: 'status' as const, target: {}, params: { status: 'silent' as const }, explanation: 'x' };
    const result = await apply(plan, []);
    expect(result.affected).toBe(0);
    await expect(result.undo()).resolves.toBeUndefined();
  });
});
