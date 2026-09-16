/**
 * Committing an import, and taking it back.
 *
 * "What kills trust for good: a silent merge; one I can't undo." — council/recruiter-v3.md §2.
 * Undo has to put the bench back exactly as it was, and has to be safe to press twice.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db/schema';
import type { Candidate } from '../types';
import { ulid } from '../lib/ulid';
import {
  buildPlanFromFiles, buildPlanFromText, commitPlan, commitStaged, listImports, sourceStats,
  stagePerson, undoImport,
} from '../v3/import';
import { forgetPlans } from '../v3/import/plan';
import { clearAiCache } from '../v3/import/ai';

const GREENHOUSE_CSV = [
  'Candidate ID,First Name,Last Name,Email,Job,Stage,Status,Created At,Rejection Reason',
  '1001,Kofi,Mensah,kofi@example.com,Staff SRE,Final Interview,Rejected,2025-05-12,"Strong, but the team wanted deeper Go"',
  '1002,Elena,Rossi,elena@example.com,Staff SRE,Offer,Rejected,2025-05-14,Took a counter-offer',
].join('\n');

function file(body: string, name: string): File {
  return new File([body], name, { type: 'text/csv' });
}

function benchPerson(overrides: Partial<Candidate> = {}): Candidate {
  const now = '2024-01-01T12:00:00.000Z';
  return {
    id: ulid(), name: 'Kofi Mensah', location: 'London, UK', currentEmployer: 'Monzo',
    currentTitle: 'Staff SRE', tenureStart: now, seniority: 'staff', skills: ['Go'], tags: [],
    status: 'active', warmthAt: now, sourceDate: now, notes: [], createdAt: now, updatedAt: now,
    ...overrides,
  };
}

beforeEach(async () => {
  await Promise.all([
    db.candidates.clear(), db.roles.clear(), db.processes.clear(), db.matches.clear(),
    db.activities.clear(), db.sequences.clear(), db.settings.clear(), db.imports.clear(),
  ]);
  forgetPlans();
  clearAiCache();
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network in tests')));
});

afterEach(() => vi.unstubAllGlobals());

// ---------------------------------------------------------------------------- commit

describe('commitPlan', () => {
  it('writes the people, the job they went for, and one activity each', async () => {
    const plan = await buildPlanFromFiles([file(GREENHOUSE_CSV, 'candidates.csv')]);
    const batch = await commitPlan(plan);

    expect(batch.createdIds).toHaveLength(2);
    expect(await db.candidates.count()).toBe(2);

    const roles = await db.roles.toArray();
    expect(roles).toHaveLength(1);
    expect(roles[0].title).toBe('Staff SRE');
    // A job named in an old export is history, not an open req.
    expect(roles[0].status).toBe('paused');

    const processes = await db.processes.toArray();
    expect(processes).toHaveLength(2);
    expect(processes.map(p => p.reason)).toContain('Strong, but the team wanted deeper Go');

    const activities = await db.activities.where('type').equals('import').toArray();
    expect(activities).toHaveLength(2);
    expect(activities[0].body).toMatch(/Greenhouse export/);
  });

  it('stamps every person with where they came from and which import brought them', async () => {
    const plan = await buildPlanFromFiles([file(GREENHOUSE_CSV, 'candidates.csv')]);
    const batch = await commitPlan(plan, { actor: 'Dana' });
    const people = await db.candidates.toArray();
    for (const person of people) {
      expect(person.source).toMatchObject({ kind: 'ats', label: 'Greenhouse export', importId: batch.id, addedBy: 'Dana' });
    }
  });

  it('reuses a job that already exists, matching on the title whatever its case', async () => {
    await db.roles.put({
      id: 'role-1', title: 'staff sre', level: 'Staff', location: 'London',
      compBand: { min: 0, max: 0, currency: 'GBP' }, mustHaves: [], niceToHaves: [], dealbreakers: [],
      urgency: { score: 3, reasons: [] }, status: 'open',
      createdAt: '2024-01-01T12:00:00.000Z', updatedAt: '2024-01-01T12:00:00.000Z',
    });
    await commitPlan(await buildPlanFromFiles([file(GREENHOUSE_CSV, 'candidates.csv')]));
    const roles = await db.roles.toArray();
    expect(roles).toHaveLength(1);
    expect(roles[0].status).toBe('open');            // the existing job is left alone
    expect((await db.processes.toArray()).every(p => p.roleId === 'role-1')).toBe(true);
  });

  it('skips a row the user marked skip', async () => {
    const plan = await buildPlanFromFiles([file(GREENHOUSE_CSV, 'candidates.csv')]);
    plan.people[0].decision = 'skip';
    const batch = await commitPlan(plan);
    expect(batch.createdIds).toHaveLength(1);
    expect(await db.candidates.count()).toBe(1);
  });

  it('merges into the person already on the bench rather than adding a second one', async () => {
    await db.candidates.put(benchPerson({ email: 'kofi@example.com' }));
    const plan = await buildPlanFromFiles([file(GREENHOUSE_CSV, 'candidates.csv')]);
    const batch = await commitPlan(plan);
    expect(batch.mergedIds).toHaveLength(1);
    expect(batch.createdIds).toHaveLength(1);
    expect(await db.candidates.count()).toBe(2);
  });
});

// ------------------------------------------------------------------------------ undo

describe('undoImport', () => {
  it('deletes the people it created, and everything hanging off them', async () => {
    const batch = await commitPlan(await buildPlanFromFiles([file(GREENHOUSE_CSV, 'candidates.csv')]));
    await undoImport(batch.id);

    expect(await db.candidates.count()).toBe(0);
    expect(await db.processes.count()).toBe(0);
    expect(await db.activities.count()).toBe(0);
    expect(await db.roles.count()).toBe(0);          // the job it invented goes too
  });

  it('restores a merged person byte for byte, notes and all', async () => {
    const before = benchPerson({
      email: 'kofi@example.com',
      notes: [{ id: 'n1', body: 'Said no to relocating', at: '2024-02-01T12:00:00.000Z', actor: 'owner' }],
      tags: ['silver'],
    });
    await db.candidates.put(before);

    const batch = await commitPlan(await buildPlanFromFiles([file(GREENHOUSE_CSV, 'candidates.csv')]));
    const afterMerge = await db.candidates.get(before.id);
    expect(afterMerge?.updatedAt).not.toBe(before.updatedAt);   // the merge really happened

    await undoImport(batch.id);
    expect(await db.candidates.get(before.id)).toEqual(before);
    expect(await db.candidates.count()).toBe(1);
  });

  it('leaves a job alone that already existed before the import', async () => {
    await db.roles.put({
      id: 'role-1', title: 'Staff SRE', level: 'Staff', location: 'London',
      compBand: { min: 0, max: 0, currency: 'GBP' }, mustHaves: [], niceToHaves: [], dealbreakers: [],
      urgency: { score: 3, reasons: [] }, status: 'open',
      createdAt: '2024-01-01T12:00:00.000Z', updatedAt: '2024-01-01T12:00:00.000Z',
    });
    const batch = await commitPlan(await buildPlanFromFiles([file(GREENHOUSE_CSV, 'candidates.csv')]));
    await undoImport(batch.id);
    expect(await db.roles.count()).toBe(1);
  });

  it('removes the candidacy it added to somebody who was already here', async () => {
    await db.candidates.put(benchPerson({ email: 'kofi@example.com' }));
    const batch = await commitPlan(await buildPlanFromFiles([file(GREENHOUSE_CSV, 'candidates.csv')]));
    expect(await db.processes.count()).toBe(2);
    await undoImport(batch.id);
    expect(await db.processes.count()).toBe(0);
  });

  it('is safe to press twice', async () => {
    await db.candidates.put(benchPerson({ email: 'kofi@example.com' }));
    const batch = await commitPlan(await buildPlanFromFiles([file(GREENHOUSE_CSV, 'candidates.csv')]));
    await undoImport(batch.id);
    const after = await db.candidates.toArray();
    await undoImport(batch.id);
    await undoImport(batch.id);
    expect(await db.candidates.toArray()).toEqual(after);
    expect((await db.imports.get(batch.id))?.undone).toBe(true);
  });

  it('does nothing at all for an import id that does not exist', async () => {
    await expect(undoImport('never-happened')).resolves.toBeUndefined();
  });
});

// ------------------------------------------------------------------ history and stats

describe('listImports and sourceStats', () => {
  it('lists imports newest first', async () => {
    const a = await commitPlan(await buildPlanFromText('Name,Email\nKofi,kofi@example.com', 'First paste'));
    await new Promise(r => setTimeout(r, 5));
    const b = await commitPlan(await buildPlanFromText('Name,Email\nElena,elena@example.com', 'Second paste'));
    const list = await listImports();
    expect(list.map(i => i.id)).toEqual([b.id, a.id]);
    expect(list[0].sourceLabel).toBe('Second paste');
  });

  it('counts people per source with the last time one arrived', async () => {
    await commitPlan(await buildPlanFromFiles([file(GREENHOUSE_CSV, 'candidates.csv')]));
    const stats = await sourceStats();
    expect(stats.ats?.count).toBe(2);
    expect(stats.ats?.lastAt).toBeTruthy();
  });

  it('counts a person with no badge at all as added by hand', async () => {
    await db.candidates.put(benchPerson());
    expect((await sourceStats()).manual?.count).toBe(1);
  });

  it('counts the badgeless people on a demo bench as sample people, not hand-typed ones', async () => {
    await db.settings.put({ key: 'sampleFlag', value: true });
    await db.candidates.put(benchPerson());
    const stats = await sourceStats();
    expect(stats.sample?.count).toBe(1);
    expect(stats.manual).toBeUndefined();
  });
});

// -------------------------------------------------------------- one person at a time

describe('stagePerson and commitStaged', () => {
  const source = { kind: 'link' as const, label: 'Add-to-bench link', at: '2026-09-09T10:00:00.000Z', addedBy: 'Dana' };

  it('fills in everything a person needs from a half-filled draft', async () => {
    const staged = await stagePerson({ name: 'Priya Nair', email: 'Priya+Jobs@Example.com' }, source);
    expect(staged.decision).toBe('create');
    expect(staged.draft.email).toBe('priya@example.com');
    expect(staged.draft.status).toBe('active');
    expect(staged.draft.location).toBe('unspecified');
    expect(staged.draft.source).toMatchObject({ kind: 'link' });
  });

  it('runs the same dedupe check an import runs', async () => {
    await db.candidates.put(benchPerson({ email: 'kofi@example.com' }));
    const staged = await stagePerson({ name: 'Kofi M', email: 'kofi@example.com' }, source);
    expect(staged.decision).toBe('merge');
    expect(staged.matchOn).toBe('email');
  });

  it('will not join a single person onto a name-and-employer lookalike', async () => {
    await db.candidates.put(benchPerson({ name: 'Sarah Chen', currentEmployer: 'Stripe', email: 'sarah@stripe.com' }));
    const staged = await stagePerson({ name: 'Sarah Chen', currentEmployer: 'Stripe' }, source);
    expect(staged.confidence).toBe('probable');
    expect(staged.decision).toBe('create');
  });

  it('commits staged people as one batch that can be undone', async () => {
    const staged = await stagePerson({ name: 'Priya Nair', email: 'priya@example.com' }, source);
    const batch = await commitStaged([staged], source);
    expect(batch.sourceLabel).toBe('Add-to-bench link');
    expect(batch.actor).toBe('Dana');
    expect(await db.candidates.count()).toBe(1);

    await undoImport(batch.id);
    expect(await db.candidates.count()).toBe(0);
  });
});
