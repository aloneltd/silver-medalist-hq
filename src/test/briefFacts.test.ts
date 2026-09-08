import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db/schema';
import { ulid } from '../lib/ulid';
import type { Candidate, Match, Process, Sequence } from '../types';
import {
  computeBriefFacts, templateBrief, validatePhrasing, getBrief,
} from '../services/briefFacts';

const NOW = new Date('2026-09-08T12:00:00.000Z');

function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  const now = new Date().toISOString();
  return {
    id: ulid(), name: 'Test Candidate', location: 'Remote', currentEmployer: 'Acme',
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

describe('computeBriefFacts', () => {
  it('returns an empty fact list for an empty bench', async () => {
    const result = await computeBriefFacts(undefined, NOW);
    expect(result.facts).toHaveLength(0);
  });

  it('surfaces a resurface window opening within 7 days, not one 30 days out', async () => {
    const soon = makeCandidate({
      name: 'Soon Resurface', status: 'took_role',
      snoozeUntil: new Date(NOW.getTime() + 3 * 86_400_000).toISOString(),
    });
    const far = makeCandidate({
      name: 'Far Resurface', status: 'took_role',
      snoozeUntil: new Date(NOW.getTime() + 30 * 86_400_000).toISOString(),
    });
    await db.candidates.bulkPut([soon, far]);

    const result = await computeBriefFacts(undefined, NOW);
    const fact = result.facts.find(f => f.kind === 'resurface_window');
    expect(fact?.names).toEqual(['Soon Resurface']);
    expect(fact?.link).toBe(`?c=${soon.id}`);
  });

  it('surfaces candidates whose Match sits in the replied stage as reply_unanswered', async () => {
    const c = makeCandidate({ name: 'Replied Person' });
    await db.candidates.put(c);
    await db.matches.put(makeMatch(c.id, { stage: 'replied' }));

    const result = await computeBriefFacts(undefined, NOW);
    const fact = result.facts.find(f => f.kind === 'reply_unanswered');
    expect(fact?.names).toEqual(['Replied Person']);
  });

  it('surfaces stale-but-strong: fit >= 80 and no touch in 30+ days, but not a fresh strong fit', async () => {
    const stale = makeCandidate({
      name: 'Stale Strong', status: 'active',
      warmthAt: new Date(NOW.getTime() - 45 * 86_400_000).toISOString(),
    });
    const fresh = makeCandidate({
      name: 'Fresh Strong', status: 'active',
      warmthAt: new Date(NOW.getTime() - 2 * 86_400_000).toISOString(),
    });
    await db.candidates.bulkPut([stale, fresh]);
    await db.matches.bulkPut([
      makeMatch(stale.id, { score: 85 }),
      makeMatch(fresh.id, { score: 90 }),
    ]);

    const result = await computeBriefFacts(undefined, NOW);
    const fact = result.facts.find(f => f.kind === 'stale_strong');
    expect(fact?.names).toEqual(['Stale Strong']);
  });

  it('does not surface stale_strong below the 80 fit threshold', async () => {
    const weak = makeCandidate({
      name: 'Stale Weak', status: 'active',
      warmthAt: new Date(NOW.getTime() - 60 * 86_400_000).toISOString(),
    });
    await db.candidates.put(weak);
    await db.matches.put(makeMatch(weak.id, { score: 60 }));

    const result = await computeBriefFacts(undefined, NOW);
    expect(result.facts.find(f => f.kind === 'stale_strong')).toBeUndefined();
  });

  it('computes best_shortlist only when a roleId is given, fit >= 70, active + warm only', async () => {
    await db.roles.put({
      id: 'role-1', title: 'Staff SRE', level: 'Staff', location: 'Remote',
      compBand: { min: 1, max: 2, currency: 'USD' }, mustHaves: [], niceToHaves: [], dealbreakers: [],
      urgency: { score: 3, reasons: [] }, status: 'open', createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
    });
    const strong = makeCandidate({ name: 'Shortlist Strong', status: 'active' });
    const notWarm = makeCandidate({ name: 'Already Reached', status: 'active' });
    const inactive = makeCandidate({ name: 'Inactive Person', status: 'silent' });
    await db.candidates.bulkPut([strong, notWarm, inactive]);
    await db.matches.bulkPut([
      makeMatch(strong.id, { roleId: 'role-1', score: 92, stage: 'warm' }),
      makeMatch(notWarm.id, { roleId: 'role-1', score: 95, stage: 'reached_out' }),
      makeMatch(inactive.id, { roleId: 'role-1', score: 99, stage: 'warm' }),
    ]);

    const withoutRole = await computeBriefFacts(undefined, NOW);
    expect(withoutRole.facts.find(f => f.kind === 'best_shortlist')).toBeUndefined();

    const withRole = await computeBriefFacts('role-1', NOW);
    const fact = withRole.facts.find(f => f.kind === 'best_shortlist');
    expect(fact?.names).toEqual(['Shortlist Strong']);
    expect(fact?.roleTitle).toBe('Staff SRE');
  });

  it('surfaces sequence steps due today, not tomorrow', async () => {
    const c = makeCandidate({ name: 'Due Today' });
    await db.candidates.put(c);
    const seq: Sequence = {
      id: ulid(), candidateId: c.id, roleId: 'role-1',
      steps: [{ day: 3, channel: 'email', body: 'x' }],
      nextDueAt: NOW.toISOString(), createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
    };
    const notDue: Sequence = {
      id: ulid(), candidateId: c.id, roleId: 'role-1',
      steps: [{ day: 3, channel: 'email', body: 'x' }],
      nextDueAt: new Date(NOW.getTime() + 3 * 86_400_000).toISOString(),
      createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
    };
    await db.sequences.bulkPut([seq, notDue]);

    const result = await computeBriefFacts(undefined, NOW);
    const fact = result.facts.find(f => f.kind === 'sequence_due');
    expect(fact?.count).toBe(1);
  });

  it('surfaces placements finished this calendar month only', async () => {
    const c = makeCandidate({ name: 'Placed This Month' });
    await db.candidates.put(c);
    const thisMonth: Process = {
      id: ulid(), candidateId: c.id, roleId: 'role-1', date: NOW.toISOString(),
      finishedAs: 'placed', reason: 'great fit', createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
    };
    const lastMonth: Process = {
      id: ulid(), candidateId: c.id, roleId: 'role-2',
      date: new Date(Date.UTC(2026, 7, 15)).toISOString(),
      finishedAs: 'placed', reason: 'great fit', createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
    };
    await db.processes.bulkPut([thisMonth, lastMonth]);

    const result = await computeBriefFacts(undefined, NOW);
    const fact = result.facts.find(f => f.kind === 'placement_this_month');
    expect(fact?.count).toBe(1);
  });

  it('benchHash changes when a candidate is updated', async () => {
    const c = makeCandidate();
    await db.candidates.put(c);
    const before = await computeBriefFacts(undefined, NOW);
    await db.candidates.put({ ...c, updatedAt: new Date(NOW.getTime() + 1000).toISOString() });
    const after = await computeBriefFacts(undefined, NOW);
    expect(after.benchHash).not.toBe(before.benchHash);
  });
});

describe('templateBrief', () => {
  it('says "Nothing needs you today" for an empty fact list', () => {
    expect(templateBrief({ dateLabel: 'Tuesday, 8 September', facts: [] })).toBe('Nothing needs you today.');
  });

  it('opens with the weekday/date and total count, biggest fact first', () => {
    const text = templateBrief({
      dateLabel: 'Tuesday, 8 September',
      facts: [
        { kind: 'sequence_due', count: 1, names: ['Ada'], link: '?c=1' },
        { kind: 'resurface_window', count: 3, names: ['Ada', 'Bo', 'Cy'], link: '?filter=resurface_window' },
      ],
    });
    expect(text.startsWith('Tuesday, 8 September — 4 things need you.')).toBe(true);
    expect(text).toContain('resurface window');
  });
});

describe('validatePhrasing', () => {
  const facts = [
    { kind: 'resurface_window' as const, count: 2, names: ['Kofi Mensah', 'Ada Lovelace'], link: '?filter=resurface_window' },
  ];

  it('accepts a phrasing that only uses given names', () => {
    expect(validatePhrasing('Tuesday — 2 things need you. Kofi Mensah and Ada Lovelace are due to resurface.', facts)).toBe(true);
  });

  it('rejects a phrasing that introduces a name not in the fact list', () => {
    expect(validatePhrasing('Tuesday — reach out to Sarah Connor today.', facts)).toBe(false);
  });

  it('accepts plain sentences with no name-shaped spans at all', () => {
    expect(validatePhrasing('Nothing needs you today.', [])).toBe(true);
  });
});

describe('getBrief', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('returns the template with zero facts and never calls the network', async () => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    const brief = await getBrief(undefined, NOW);
    expect(brief.text).toBe('Nothing needs you today.');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('uses the model phrasing when it validates', async () => {
    const c = makeCandidate({ name: 'Kofi Mensah', status: 'took_role', snoozeUntil: new Date(NOW.getTime() + 2 * 86_400_000).toISOString() });
    await db.candidates.put(c);
    globalThis.fetch = vi.fn(async () => new Response('Tuesday — 1 thing needs you. Kofi Mensah is due to resurface.', { status: 200 })) as unknown as typeof fetch;

    const brief = await getBrief(undefined, NOW);
    expect(brief.text).toContain('Kofi Mensah');
  });

  it('falls back to the template when the model hallucinates a name', async () => {
    const c = makeCandidate({ name: 'Kofi Mensah', status: 'took_role', snoozeUntil: new Date(NOW.getTime() + 2 * 86_400_000).toISOString() });
    await db.candidates.put(c);
    globalThis.fetch = vi.fn(async () => new Response('Tuesday — reach out to Sarah Connor.', { status: 200 })) as unknown as typeof fetch;

    const brief = await getBrief(undefined, NOW);
    expect(brief.text).not.toContain('Sarah Connor');
    expect(brief.text).toContain('Kofi Mensah');
  });

  it('caches per (day, benchHash) — a second call with no bench change hits the cache, zero network', async () => {
    const c = makeCandidate({ name: 'Kofi Mensah', status: 'took_role', snoozeUntil: new Date(NOW.getTime() + 2 * 86_400_000).toISOString() });
    await db.candidates.put(c);
    const fetchSpy = vi.fn(async () => new Response('Tuesday — Kofi Mensah is due to resurface.', { status: 200 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const first = await getBrief(undefined, NOW);
    expect(first.cached).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const second = await getBrief(undefined, NOW);
    expect(second.cached).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(second.text).toBe(first.text);
  });
});
