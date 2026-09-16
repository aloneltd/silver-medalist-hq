import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../db/schema';
import { ulid } from '../lib/ulid';
import type { Submission, StagedPerson, PersonSource, ImportBatch } from '../types';

// A stand-in for the import engine, once it exists — proves engineBridge.ts wires
// stagePerson -> commitStaged -> submission state correctly, independent of that engine's
// own (separately owned) implementation.
let lastCommitArgs: { staged: StagedPerson[]; source: PersonSource; opts?: unknown } | null = null;

vi.mock('../v3/import', () => ({
  stagePerson: vi.fn(async (draft: Partial<{ name: string }>, source: PersonSource): Promise<StagedPerson> => ({
    key: 'k1',
    draft: {
      id: ulid(), name: draft.name ?? 'Unknown', location: '', currentEmployer: '', currentTitle: '',
      tenureStart: new Date().toISOString(), seniority: 'mid', skills: [], tags: [], status: 'active',
      warmthAt: new Date().toISOString(), sourceDate: new Date().toISOString(), notes: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source,
    },
    decision: 'create',
  })),
  commitStaged: vi.fn(async (staged: StagedPerson[], source: PersonSource, opts?: unknown): Promise<ImportBatch> => {
    lastCommitArgs = { staged, source, opts };
    return {
      id: 'batch1', at: new Date().toISOString(), kind: source.kind, sourceLabel: source.label, rowCount: staged.length,
      createdIds: staged.map(s => s.draft.id), mergedIds: [], before: {}, processIds: [], actor: 'You',
    };
  }),
}));

const { acceptSubmission } = await import('../v3/team/engineBridge');

function makeSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: ulid(),
    at: new Date().toISOString(),
    via: 'link',
    addedBy: 'Dana',
    note: 'Ran platform at N26',
    draft: { name: 'Lina Novak' },
    state: 'waiting',
    ...overrides,
  };
}

describe('acceptSubmission — engine wired and succeeding', () => {
  beforeEach(async () => {
    await db.submissions.clear();
    lastCommitArgs = null;
  });

  it('runs stagePerson then commitStaged with the sender as the source badge', async () => {
    const sub = makeSubmission({ via: 'link', addedBy: 'Dana' });
    await db.submissions.put(sub);

    const outcome = await acceptSubmission(sub, 'You');

    expect(outcome.ok).toBe(true);
    expect(lastCommitArgs).not.toBeNull();
    expect(lastCommitArgs!.source.kind).toBe('link');
    expect(lastCommitArgs!.source.addedBy).toBe('Dana');
  });

  it('moves the submission to accepted once the bench write succeeds', async () => {
    const sub = makeSubmission();
    await db.submissions.put(sub);
    await acceptSubmission(sub, 'You');
    const stored = await db.submissions.get(sub.id);
    expect(stored?.state).toBe('accepted');
  });

  it('badges a capture submission with the capturer, not the sourcer of the link', async () => {
    const sub = makeSubmission({ via: 'capture', addedBy: 'Sam', draft: { name: 'Sofia Karlsson' } });
    await db.submissions.put(sub);
    await acceptSubmission(sub, 'You');
    expect(lastCommitArgs!.source.kind).toBe('capture');
    expect(lastCommitArgs!.source.addedBy).toBe('Sam');
  });
});
