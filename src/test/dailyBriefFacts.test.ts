import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/schema';
import { dataService } from '../services/dataService';
import { ulid } from '../lib/ulid';
import { computeDailyBriefFacts } from '../features/today/dailyBriefFacts';
import type { Candidate, Role, Match, Activity } from '../types';

function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  const now = new Date().toISOString();
  return {
    id: ulid(), name: 'Test Candidate', location: 'Remote', currentEmployer: 'Acme',
    currentTitle: 'Engineer', tenureStart: now, seniority: 'senior', skills: ['TypeScript'],
    tags: [], status: 'active', warmthAt: now, sourceDate: now, notes: [],
    createdAt: now, updatedAt: now, ...overrides,
  };
}

function makeRole(overrides: Partial<Role> = {}): Role {
  const now = new Date().toISOString();
  return {
    id: ulid(), title: 'Staff SRE', level: 'staff', location: 'Remote',
    compBand: { min: 100_000, max: 200_000, currency: 'USD' },
    mustHaves: [], niceToHaves: [], dealbreakers: [], urgency: { score: 3, reasons: [] },
    status: 'open', createdAt: now, updatedAt: now, ...overrides,
  };
}

function makeMatch(roleId: string, candidateId: string, overrides: Partial<Match> = {}): Match {
  const now = new Date().toISOString();
  return {
    id: ulid(), roleId, candidateId, score: 50,
    sub: { skills: 50, seniority: 50, comp: 50, timing: 50 },
    why: 'because', flags: [], hash: 'h', stage: 'warm', stageUpdatedAt: now, updatedAt: now,
    ...overrides,
  };
}

beforeEach(async () => {
  await Promise.all([
    db.candidates.clear(), db.roles.clear(), db.processes.clear(),
    db.matches.clear(), db.activities.clear(), db.sequences.clear(), db.settings.clear(),
  ]);
});

describe('computeDailyBriefFacts', () => {
  it('returns no facts (and the empty hash is stable) on an empty bench', async () => {
    const { facts, hash } = await computeDailyBriefFacts(undefined);
    expect(facts).toEqual([]);
    expect(hash).toBe((await computeDailyBriefFacts(undefined)).hash);
  });

  it('surfaces a resurface fact for a took_role candidate whose window opens within 21 days', async () => {
    const now = Date.now();
    const c = makeCandidate({ status: 'took_role', snoozeUntil: new Date(now + 5 * 86_400_000).toISOString() });
    await dataService.put('candidates', c);
    const { facts } = await computeDailyBriefFacts(undefined, now);
    expect(facts.some(f => f.kind === 'resurface' && f.candidateId === c.id)).toBe(true);
  });

  it('does not surface a resurface fact more than 21 days out', async () => {
    const now = Date.now();
    const c = makeCandidate({ status: 'took_role', snoozeUntil: new Date(now + 60 * 86_400_000).toISOString() });
    await dataService.put('candidates', c);
    const { facts } = await computeDailyBriefFacts(undefined, now);
    expect(facts.some(f => f.kind === 'resurface')).toBe(false);
  });

  it('surfaces a reply fact from a recent reply_detected activity', async () => {
    const now = Date.now();
    const c = makeCandidate();
    await dataService.put('candidates', c);
    const activity: Activity = {
      id: ulid(), candidateId: c.id, type: 'reply_detected', at: new Date(now - 86_400_000).toISOString(),
      body: 'Replied: sounds interesting', actor: 'replyWatcher',
    };
    await db.activities.put(activity);
    const { facts } = await computeDailyBriefFacts(undefined, now);
    const reply = facts.find(f => f.kind === 'reply');
    expect(reply?.candidateId).toBe(c.id);
    expect(reply?.action).toBe('reach_out');
  });

  it('surfaces a stale-strong fact: active, fit >= 80, untouched 14+ days, for the selected role', async () => {
    const now = Date.now();
    const role = makeRole();
    await dataService.put('roles', role);
    const c = makeCandidate({ warmthAt: new Date(now - 20 * 86_400_000).toISOString() });
    await dataService.put('candidates', c);
    await dataService.put('matches', makeMatch(role.id, c.id, { score: 90 }));
    const { facts } = await computeDailyBriefFacts(role.id, now);
    expect(facts.some(f => f.kind === 'stale_strong' && f.candidateId === c.id)).toBe(true);
  });

  it('does not surface stale-strong for a fresh touch', async () => {
    const now = Date.now();
    const role = makeRole();
    await dataService.put('roles', role);
    const c = makeCandidate({ warmthAt: new Date(now - 1 * 86_400_000).toISOString() });
    await dataService.put('candidates', c);
    await dataService.put('matches', makeMatch(role.id, c.id, { score: 90 }));
    const { facts } = await computeDailyBriefFacts(role.id, now);
    expect(facts.some(f => f.kind === 'stale_strong')).toBe(false);
  });

  it('surfaces the best-shortlist fact for the open role with the most 80+ fits', async () => {
    const now = Date.now();
    const roleA = makeRole({ title: 'Role A' });
    const roleB = makeRole({ title: 'Role B' });
    await dataService.put('roles', roleA);
    await dataService.put('roles', roleB);
    const c1 = makeCandidate();
    const c2 = makeCandidate();
    const c3 = makeCandidate();
    await Promise.all([c1, c2, c3].map(c => dataService.put('candidates', c)));
    await dataService.put('matches', makeMatch(roleA.id, c1.id, { score: 85 }));
    await dataService.put('matches', makeMatch(roleA.id, c2.id, { score: 88 }));
    await dataService.put('matches', makeMatch(roleB.id, c3.id, { score: 82 }));
    const { facts } = await computeDailyBriefFacts(undefined, now);
    const shortlist = facts.find(f => f.kind === 'best_shortlist');
    expect(shortlist?.roleId).toBe(roleA.id);
  });

  it('caps at 5 facts and orders replies/resurface ahead of stale-strong/shortlist', async () => {
    const now = Date.now();
    const role = makeRole();
    await dataService.put('roles', role);
    for (let i = 0; i < 3; i++) {
      const c = makeCandidate({ warmthAt: new Date(now - 30 * 86_400_000).toISOString() });
      await dataService.put('candidates', c);
      await dataService.put('matches', makeMatch(role.id, c.id, { score: 90 }));
    }
    const replyCandidate = makeCandidate();
    await dataService.put('candidates', replyCandidate);
    await db.activities.put({
      id: ulid(), candidateId: replyCandidate.id, type: 'reply_detected',
      at: new Date(now - 86_400_000).toISOString(), body: 'replied', actor: 'replyWatcher',
    });
    const { facts } = await computeDailyBriefFacts(role.id, now);
    expect(facts.length).toBeLessThanOrEqual(5);
    expect(facts[0].kind).toBe('reply');
  });
});
