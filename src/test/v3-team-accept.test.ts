import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../db/schema';
import { ulid } from '../lib/ulid';
import type { Submission } from '../types';

// The engine is wired now (it used to be NOT_IMPLEMENTED in this tree, and this file used to
// lean on that to get a failure for free). The invariant engineBridge.ts actually exists to
// hold is the one tested here, and it outlives that: when the engine throws — a corrupt draft,
// a write that loses a race with a sync — the Inbox shows one honest sentence and the
// submission is left exactly where it was, never half-accepted. So the throw is now forced
// explicitly. See v3-team-accept-success.test.ts for the succeeds path.
vi.mock('../v3/import', () => ({
  stagePerson: vi.fn(async () => { throw new Error('engine exploded'); }),
  commitStaged: vi.fn(async () => { throw new Error('engine exploded'); }),
}));

const { acceptSubmission, rejectSubmission, sourceForSubmission, ENGINE_FAILED_MESSAGE } =
  await import('../v3/team/engineBridge');

function makeSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: ulid(),
    at: new Date().toISOString(),
    via: 'link',
    addedBy: 'Dana',
    note: 'Great candidate',
    draft: { name: 'Lina Novak' },
    state: 'waiting',
    ...overrides,
  };
}

describe('sourceForSubmission — the badge a person gets on accept', () => {
  it('mirrors `via` as the source kind and carries the sender as addedBy', () => {
    const sub = makeSubmission({ via: 'link', addedBy: 'Dana' });
    const source = sourceForSubmission(sub);
    expect(source.kind).toBe('link');
    expect(source.addedBy).toBe('Dana');
  });

  it('captured-from-LinkedIn submissions badge with the capturer', () => {
    const sub = makeSubmission({ via: 'capture', addedBy: 'Sam' });
    const source = sourceForSubmission(sub);
    expect(source.kind).toBe('capture');
    expect(source.addedBy).toBe('Sam');
    expect(source.label).toMatch(/capture/i);
  });

  it('leaves addedBy undefined (not an empty string) when the sender is unknown', () => {
    const sub = makeSubmission({ via: 'outlook', addedBy: '' });
    const source = sourceForSubmission(sub);
    expect(source.addedBy).toBeUndefined();
  });
});

describe('acceptSubmission — the engine throws (honest failure, bench untouched)', () => {
  beforeEach(async () => {
    await db.submissions.clear();
  });

  it('returns ok:false with one honest sentence, never throwing', async () => {
    const sub = makeSubmission();
    await db.submissions.put(sub);
    const outcome = await acceptSubmission(sub, 'You');
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toBe(ENGINE_FAILED_MESSAGE);
  });

  it('never touches the submission state when the engine call fails', async () => {
    const sub = makeSubmission();
    await db.submissions.put(sub);
    await acceptSubmission(sub, 'You');
    const stored = await db.submissions.get(sub.id);
    expect(stored?.state).toBe('waiting');
  });
});

describe('rejectSubmission', () => {
  beforeEach(async () => {
    await db.submissions.clear();
  });

  it('moves state to rejected and keeps the record (so it is not re-proposed)', async () => {
    const sub = makeSubmission();
    await db.submissions.put(sub);
    await rejectSubmission(sub);
    const stored = await db.submissions.get(sub.id);
    expect(stored?.state).toBe('rejected');
    expect(stored).toBeTruthy();
  });
});
