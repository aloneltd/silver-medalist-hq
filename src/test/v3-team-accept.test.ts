import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/schema';
import { ulid } from '../lib/ulid';
import { acceptSubmission, rejectSubmission, sourceForSubmission, ENGINE_NOT_READY_MESSAGE } from '../v3/team/engineBridge';
import type { Submission } from '../types';

// This file deliberately does NOT mock src/v3/import — it is still `NOT_IMPLEMENTED` in this
// tree (owned by another builder), and the whole point of engineBridge.ts is that its calls
// throwing must never blank the screen or reject unhandled. See v3-team-accept-success.test.ts
// for the accepted-and-succeeds path with the engine mocked.

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

describe('acceptSubmission — engine not implemented yet (real module, honest failure)', () => {
  beforeEach(async () => {
    await db.submissions.clear();
  });

  it('returns ok:false with one honest sentence, never throwing', async () => {
    const sub = makeSubmission();
    await db.submissions.put(sub);
    const outcome = await acceptSubmission(sub, 'You');
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toBe(ENGINE_NOT_READY_MESSAGE);
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
