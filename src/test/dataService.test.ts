import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/schema';
import { dataService, computeWarmthDays, computeSeniorityDrift } from '../services/dataService';
import { ulid } from '../lib/ulid';
import type { Candidate, Match } from '../types';

function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  const now = new Date().toISOString();
  return {
    id: ulid(), name: 'Test Candidate', location: 'Remote', currentEmployer: 'Acme',
    currentTitle: 'Engineer', tenureStart: now, seniority: 'senior', skills: ['TypeScript'],
    tags: [], status: 'active', warmthAt: now, sourceDate: now, notes: [],
    createdAt: now, updatedAt: now, ...overrides,
  };
}

beforeEach(async () => {
  await Promise.all([
    db.candidates.clear(), db.roles.clear(), db.processes.clear(),
    db.matches.clear(), db.activities.clear(), db.sequences.clear(), db.settings.clear(),
  ]);
});

describe('computeWarmthDays', () => {
  it('computes whole days since last touch', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    expect(computeWarmthDays(tenDaysAgo)).toBe(10);
  });

  it('never returns negative for a future timestamp', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(computeWarmthDays(future)).toBe(0);
  });
});

describe('computeSeniorityDrift', () => {
  it('hints at the next level after 24+ months tenure', () => {
    const c = makeCandidate({ seniority: 'senior', tenureStart: new Date(Date.now() - 30 * 30 * 86_400_000).toISOString() });
    expect(computeSeniorityDrift(c)).toMatch(/staff-ready/i);
  });

  it('says nothing for a fresh tenure', () => {
    const c = makeCandidate({ seniority: 'senior', tenureStart: new Date().toISOString() });
    expect(computeSeniorityDrift(c)).toBeUndefined();
  });

  it('says nothing at the top of the ladder', () => {
    const c = makeCandidate({ seniority: 'exec', tenureStart: new Date(Date.now() - 60 * 30 * 86_400_000).toISOString() });
    expect(computeSeniorityDrift(c)).toBeUndefined();
  });
});

describe('dataService.applyStatus', () => {
  it('sets a default ~18-month resurface date for took_role and logs the reason', async () => {
    const c = makeCandidate();
    await db.candidates.put(c);

    const updated = await dataService.applyStatus(c.id, 'took_role', 'accepted elsewhere');
    expect(updated.status).toBe('took_role');
    expect(updated.snoozeUntil).toBeTruthy();

    const monthsOut = (new Date(updated.snoozeUntil!).getTime() - Date.now()) / (30 * 86_400_000);
    expect(monthsOut).toBeGreaterThan(17);
    expect(monthsOut).toBeLessThan(19);

    const activities = await db.activities.where('candidateId').equals(c.id).toArray();
    expect(activities.some(a => a.type === 'status' && a.body.includes('accepted elsewhere'))).toBe(true);
  });

  it('clears statusReason and snoozeUntil when reactivated', async () => {
    const c = makeCandidate({ status: 'silent', statusReason: 'went quiet', snoozeUntil: new Date().toISOString() });
    await db.candidates.put(c);

    const updated = await dataService.applyStatus(c.id, 'active');
    expect(updated.statusReason).toBeUndefined();
    expect(updated.snoozeUntil).toBeUndefined();
  });
});

describe('dataService.computeTodayQueue', () => {
  it('excludes do_not_reapproach and opted_out entirely', async () => {
    await db.candidates.bulkPut([
      makeCandidate({ status: 'do_not_reapproach', warmthAt: new Date(Date.now() - 400 * 86_400_000).toISOString() }),
      makeCandidate({ status: 'opted_out', warmthAt: new Date(Date.now() - 400 * 86_400_000).toISOString() }),
    ]);
    const queue = await dataService.computeTodayQueue(10);
    expect(queue).toHaveLength(0);
  });

  it('surfaces a took_role candidate once the snooze date has passed', async () => {
    const c = makeCandidate({ status: 'took_role', snoozeUntil: new Date(Date.now() - 86_400_000).toISOString() });
    await db.candidates.put(c);
    const queue = await dataService.computeTodayQueue(10);
    expect(queue).toHaveLength(1);
    expect(queue[0].action.kind).toBe('resurface');
  });

  it('does not surface a took_role candidate before the snooze date', async () => {
    const c = makeCandidate({ status: 'took_role', snoozeUntil: new Date(Date.now() + 30 * 86_400_000).toISOString() });
    await db.candidates.put(c);
    const queue = await dataService.computeTodayQueue(10);
    expect(queue).toHaveLength(0);
  });

  it('flags a never-touched stale candidate as reach-out, not follow-up', async () => {
    const staleTimestamp = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const neverTouched = makeCandidate({ status: 'active', createdAt: staleTimestamp, warmthAt: staleTimestamp });
    await db.candidates.put(neverTouched);
    const queue = await dataService.computeTodayQueue(10);
    expect(queue).toHaveLength(1);
    expect(queue[0].action.kind).toBe('reach_out');
  });

  it('flags a previously-touched stale candidate as follow-up', async () => {
    const touched = makeCandidate({
      status: 'active',
      createdAt: new Date(Date.now() - 200 * 86_400_000).toISOString(),
      warmthAt: new Date(Date.now() - 20 * 86_400_000).toISOString(),
    });
    await db.candidates.put(touched);
    const queue = await dataService.computeTodayQueue(10);
    expect(queue[0].action.kind).toBe('follow_up');
  });

  it('does not surface a fresh active candidate under the stale threshold', async () => {
    const fresh = makeCandidate({ status: 'active', warmthAt: new Date().toISOString() });
    await db.candidates.put(fresh);
    const queue = await dataService.computeTodayQueue(10);
    expect(queue).toHaveLength(0);
  });

  it('prioritizes resurface over recheck_comp over follow_up, and respects the limit', async () => {
    const now = Date.now();
    await db.candidates.bulkPut([
      makeCandidate({ status: 'took_role', snoozeUntil: new Date(now - 1000).toISOString() }),
      makeCandidate({
        status: 'active',
        warmthAt: new Date(now - 400 * 86_400_000).toISOString(),
        compAtLastProcess: { amount: 100000, currency: 'USD', date: new Date(now - 400 * 86_400_000).toISOString() },
      }),
      makeCandidate({ status: 'silent', warmthAt: new Date(now - 20 * 86_400_000).toISOString() }),
    ]);
    const queue = await dataService.computeTodayQueue(2);
    expect(queue).toHaveLength(2);
    expect(queue[0].action.kind).toBe('resurface');
    expect(queue[1].action.kind).toBe('recheck_comp');
  });
});

describe('dataService.setOverride', () => {
  it('preserves the underlying AI score/why for audit while the override wins display', async () => {
    const now = new Date().toISOString();
    const match: Match = {
      id: ulid(), roleId: 'r1', candidateId: 'c1', score: 60,
      sub: { skills: 60, seniority: 60, comp: 60, timing: 60 }, why: 'AI reason', flags: [],
      hash: 'h1', stage: 'warm', stageUpdatedAt: now, updatedAt: now,
    };
    await db.matches.put(match);

    const updated = await dataService.setOverride(match.id, 90, 'I know this candidate personally');
    expect(updated.override?.score).toBe(90);
    expect(updated.override?.reason).toBe('I know this candidate personally');
    expect(updated.why).toBe('AI reason');
    expect(updated.score).toBe(60);
  });
});

describe('dataService.applyScoreResults', () => {
  it('preserves stage and override across a re-score, and reuses the match id', async () => {
    const roleId = 'r1';
    const first = await dataService.applyScoreResults(roleId, 'hash-1', [
      { candidateId: 'c1', score: 50, sub: { skills: 50, seniority: 50, comp: 50, timing: 50 }, why: 'first pass', flags: [] },
    ]);
    const matchId = first[0].id;
    await dataService.setStage(matchId, 'reached_out', 'sent the first email');
    await dataService.setOverride(matchId, 80, 'manual bump');

    const second = await dataService.applyScoreResults(roleId, 'hash-2', [
      { candidateId: 'c1', score: 55, sub: { skills: 55, seniority: 55, comp: 55, timing: 55 }, why: 'second pass', flags: [] },
    ]);

    expect(second[0].id).toBe(matchId);
    expect(second[0].stage).toBe('reached_out');
    expect(second[0].override?.score).toBe(80);
    expect(second[0].score).toBe(55); // the new AI score still updates
  });
});
