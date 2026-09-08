import { describe, it, expect } from 'vitest';
import { buildSampleBench } from '../lib/sampleBench';
import type { BoardStage } from '../types';

/**
 * Red-team pass over the pre-scored sample bench. This is the first thing a buyer sees, so a
 * contradiction in it — someone Placed on one board and Warm on another, a resurface date we
 * already missed, a negative day count — reads as a broken product, not as demo data.
 */
describe('sample bench: internal consistency', () => {
  const bench = buildSampleBench();
  const now = Date.now();

  it('has the blueprint shape: 8 roles, 60 candidates, and a scored match per contactable person per role', () => {
    expect(bench.roles).toHaveLength(8);
    expect(bench.candidates).toHaveLength(60);
    const contactable = bench.candidates.filter(c => c.status !== 'opted_out');
    expect(bench.matches).toHaveLength(bench.roles.length * contactable.length);
  });

  it('never scores someone who withdrew consent', () => {
    const optedOut = new Set(bench.candidates.filter(c => c.status === 'opted_out').map(c => c.id));
    expect(optedOut.size).toBe(2);
    expect(bench.matches.some(m => optedOut.has(m.candidateId))).toBe(false);
  });

  it('gives every candidate ONE board stage across every role — nobody is placed and also warm', () => {
    const byCandidate = new Map<string, Set<BoardStage>>();
    for (const m of bench.matches) {
      const set = byCandidate.get(m.candidateId) ?? new Set<BoardStage>();
      set.add(m.stage);
      byCandidate.set(m.candidateId, set);
    }
    const conflicted = [...byCandidate.entries()].filter(([, stages]) => stages.size > 1);
    expect(conflicted).toEqual([]);
  });

  it('spreads the board across every stage with a real pipeline in the middle', () => {
    const roleId = bench.roles[0].id;
    const counts: Record<string, number> = {};
    for (const m of bench.matches.filter(x => x.roleId === roleId)) {
      counts[m.stage] = (counts[m.stage] ?? 0) + 1;
    }
    for (const stage of ['warm', 'reached_out', 'replied', 'interviewing', 'offer', 'placed', 'passed']) {
      expect(counts[stage] ?? 0).toBeGreaterThan(0);
    }
    const nonWarm = Object.entries(counts).filter(([s]) => s !== 'warm').reduce((n, [, v]) => n + v, 0);
    expect(nonWarm).toBeGreaterThanOrEqual(20);
    expect(nonWarm).toBeLessThanOrEqual(32);
  });

  it('keeps stage and status telling the same story', () => {
    const byId = new Map(bench.candidates.map(c => [c.id, c]));
    const roleId = bench.roles[0].id;
    for (const m of bench.matches.filter(x => x.roleId === roleId)) {
      const c = byId.get(m.candidateId)!;
      if (m.stage === 'placed') expect(c.status).toBe('took_role');
      if (m.stage === 'passed') expect(c.status).toBe('do_not_reapproach');
      if (['replied', 'interviewing', 'offer'].includes(m.stage)) expect(c.status).toBe('active');
    }
    // Everyone shown as Placed on the board has a placement on their record.
    const placedIds = new Set(bench.matches.filter(m => m.stage === 'placed').map(m => m.candidateId));
    for (const id of placedIds) {
      expect(bench.processes.some(p => p.candidateId === id && p.finishedAs === 'placed')).toBe(true);
    }
  });

  it('keeps warmth consistent with the pipeline — an in-motion card was touched recently', () => {
    const inMotion = new Set(['reached_out', 'replied', 'interviewing', 'offer']);
    const byId = new Map(bench.candidates.map(c => [c.id, c]));
    const roleId = bench.roles[0].id;
    const cards = bench.matches.filter(m => m.roleId === roleId && inMotion.has(m.stage));
    expect(cards.length).toBeGreaterThan(15);
    for (const m of cards) {
      const days = (now - new Date(byId.get(m.candidateId)!.warmthAt).getTime()) / 86_400_000;
      expect(days).toBeLessThanOrEqual(21);
    }
    // Amber has to mean something: some drifted past 14 days, most did not.
    const stale = cards.filter(m => (now - new Date(byId.get(m.candidateId)!.warmthAt).getTime()) / 86_400_000 > 14);
    expect(stale.length).toBeGreaterThan(0);
    expect(stale.length).toBeLessThan(cards.length / 2);
  });

  it('reports exactly 5 placements, so the honest ROI counter reads 5', () => {
    expect(bench.processes.filter(p => p.finishedAs === 'placed')).toHaveLength(5);
  });

  it('never shows a resurface date that is already in the past', () => {
    const snoozed = bench.candidates.filter(c => c.snoozeUntil);
    expect(snoozed.length).toBe(7);
    for (const c of snoozed) {
      expect(new Date(c.snoozeUntil!).getTime()).toBeGreaterThan(now);
    }
    // …and at least one opens soon enough to reach the Today queue.
    const soon = snoozed.filter(c => new Date(c.snoozeUntil!).getTime() - now <= 21 * 86_400_000);
    expect(soon.length).toBeGreaterThanOrEqual(1);
  });

  it('never produces a negative day count on any screen', () => {
    for (const c of bench.candidates) {
      expect(new Date(c.warmthAt).getTime()).toBeLessThan(now);
      expect(new Date(c.tenureStart).getTime()).toBeLessThan(now);
      expect(new Date(c.sourceDate).getTime()).toBeLessThan(now);
      if (c.compAtLastProcess) expect(new Date(c.compAtLastProcess.date).getTime()).toBeLessThan(now);
      if (c.compExpectation) expect(new Date(c.compExpectation.date).getTime()).toBeLessThan(now);
    }
    for (const p of bench.processes) expect(new Date(p.date).getTime()).toBeLessThan(now);
    for (const a of bench.activities) expect(new Date(a.at).getTime()).toBeLessThanOrEqual(now);
  });

  it('gives every scored row a real number and a real sentence', () => {
    for (const m of bench.matches) {
      expect(m.score).toBeGreaterThanOrEqual(0);
      expect(m.score).toBeLessThanOrEqual(100);
      for (const v of Object.values(m.sub)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
      expect(m.why.trim().length).toBeGreaterThan(20);
      expect(m.why).not.toMatch(/undefined|NaN|\[object/);
    }
  });

  it('gives every role a shortlist worth reading — a strong top, and a spread beneath it', () => {
    const active = new Set(bench.candidates.filter(c => c.status === 'active').map(c => c.id));
    for (const role of bench.roles) {
      const rows = bench.matches
        .filter(m => m.roleId === role.id && active.has(m.candidateId))
        .sort((a, b) => b.score - a.score);
      expect(rows.length).toBeGreaterThanOrEqual(8);
      expect(rows[0].score).toBeGreaterThanOrEqual(80);          // a clear number one
      expect(rows.filter(m => m.score >= 70).length).toBeGreaterThanOrEqual(4);
      expect(rows[7].score).toBeGreaterThanOrEqual(55);          // the 8th is still plausible
    }
    // …and the bench is not one flat number: there is a real spread across all 8 roles.
    const all = bench.matches.map(m => m.score);
    expect(Math.max(...all) - Math.min(...all)).toBeGreaterThan(50);
  });

  it('does not write the same why-now sentence for everyone', () => {
    const roleId = bench.roles[0].id;
    const whys = bench.matches.filter(m => m.roleId === roleId).map(m => m.why);
    expect(new Set(whys).size / whys.length).toBeGreaterThan(0.9);
  });

  it('seeds an activity trail and two live sequences', () => {
    expect(bench.activities.filter(a => a.type === 'touch').length).toBeGreaterThan(40);
    expect(bench.activities.filter(a => a.type === 'note').length).toBeGreaterThan(5);
    expect(bench.activities.filter(a => a.type === 'email_copied').length).toBeGreaterThan(5);
    expect(bench.sequences).toHaveLength(2);
    for (const s of bench.sequences) {
      expect(s.steps).toHaveLength(3);
      expect(new Date(s.nextDueAt!).getTime()).toBeLessThanOrEqual(now);
    }
  });

  it('is deterministic — the same seed produces the same bench twice', () => {
    const a = buildSampleBench();
    const b = buildSampleBench();
    expect(a.candidates.map(c => c.name)).toEqual(b.candidates.map(c => c.name));
    expect(a.matches.map(m => m.score)).toEqual(b.matches.map(m => m.score));
  });
});
