import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../db/schema';
import { dataService } from '../services/dataService';
import { ulid } from '../lib/ulid';
import type { Candidate, Match } from '../types';

// Fake Graph: microsoftAuth reports a connected account, outlookService.findRepliesFrom is a
// stub the test controls per-call. replyWatcher must only ever go through these two seams.
vi.mock('../services/microsoftAuth', () => ({
  isConfigured: vi.fn(() => true),
  getAccount: vi.fn(() => ({ homeAccountId: 'h1', username: 'owner@example.com' })),
  getToken: vi.fn(async () => 'fake-token'),
  GRAPH_SCOPES: { identity: ['User.Read'], mail: ['Mail.ReadWrite'], send: ['Mail.Send'], calendar: ['Calendars.Read'] },
}));

vi.mock('../services/outlookService', () => ({
  findRepliesFrom: vi.fn(),
}));

import * as microsoftAuth from '../services/microsoftAuth';
import * as outlookService from '../services/outlookService';
import { runOnce, recentReplies } from '../services/replyWatcher';

function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  const now = new Date().toISOString();
  return {
    id: ulid(), name: 'Ada Reply', email: 'ada@example.com', location: 'Remote',
    currentEmployer: 'Acme', currentTitle: 'Engineer', tenureStart: now, seniority: 'senior',
    skills: ['TypeScript'], tags: [], status: 'active', warmthAt: now, sourceDate: now,
    notes: [], createdAt: now, updatedAt: now, ...overrides,
  };
}

function makeMatch(candidateId: string, overrides: Partial<Match> = {}): Match {
  const now = new Date().toISOString();
  return {
    id: ulid(), roleId: 'role-1', candidateId, score: 80,
    sub: { skills: 80, seniority: 80, comp: 80, timing: 80 }, why: 'strong fit', flags: [],
    hash: 'h', stage: 'reached_out', stageUpdatedAt: now, updatedAt: now, ...overrides,
  };
}

beforeEach(async () => {
  await Promise.all([
    db.candidates.clear(), db.roles.clear(), db.processes.clear(),
    db.matches.clear(), db.activities.clear(), db.sequences.clear(), db.settings.clear(),
  ]);
  vi.mocked(outlookService.findRepliesFrom).mockReset();
  vi.mocked(microsoftAuth.getToken).mockClear();
});

describe('replyWatcher.runOnce', () => {
  it('does nothing when Microsoft is not configured', async () => {
    vi.mocked(microsoftAuth.isConfigured).mockReturnValueOnce(false);
    const result = await runOnce();
    expect(result.checked).toBe(0);
    expect(outlookService.findRepliesFrom).not.toHaveBeenCalled();
  });

  it('moves a candidate to replied and logs a snippet on a fresh reply', async () => {
    const candidate = makeCandidate();
    const match = makeMatch(candidate.id);
    await db.candidates.put(candidate);
    await db.matches.put(match);

    vi.mocked(outlookService.findRepliesFrom).mockResolvedValueOnce([
      { messageId: 'graph-msg-1', receivedAt: new Date().toISOString(), subject: 'Re: hello', snippet: 'Yes, I would love to chat!' },
    ]);

    const result = await runOnce();
    expect(result.checked).toBe(1);
    expect(result.repliesFound).toBe(1);

    const updatedMatch = await db.matches.get(match.id);
    expect(updatedMatch?.stage).toBe('replied');

    const activities = await db.activities.where('candidateId').equals(candidate.id).toArray();
    const reply = activities.find(a => a.type === 'reply_detected');
    expect(reply?.body).toContain('msg:graph-msg-1');
    expect(reply?.body).toContain('Yes, I would love to chat!');
  });

  it('is idempotent: a second poll with the same message id does not re-log or re-move', async () => {
    const candidate = makeCandidate();
    const match = makeMatch(candidate.id);
    await db.candidates.put(candidate);
    await db.matches.put(match);

    vi.mocked(outlookService.findRepliesFrom).mockResolvedValue([
      { messageId: 'graph-msg-1', receivedAt: new Date().toISOString(), subject: 'Re: hello', snippet: 'Yes!' },
    ]);

    await runOnce();
    // First pass already flipped stage away from 'reached_out', so a second pass finds no
    // candidates awaiting reply at all — the real-world idempotency guarantee.
    const second = await runOnce();
    expect(second.checked).toBe(0);
    expect(second.repliesFound).toBe(0);

    const activities = await db.activities.where('candidateId').equals(candidate.id).toArray();
    expect(activities.filter(a => a.type === 'reply_detected')).toHaveLength(1);
  });

  it('skips candidates without an email on file', async () => {
    const candidate = makeCandidate({ email: undefined });
    const match = makeMatch(candidate.id);
    await db.candidates.put(candidate);
    await db.matches.put(match);

    const result = await runOnce();
    expect(result.checked).toBe(0);
    expect(outlookService.findRepliesFrom).not.toHaveBeenCalled();
  });

  it('ignores an outreach older than the 30-day lookback', async () => {
    const candidate = makeCandidate();
    const match = makeMatch(candidate.id, { stageUpdatedAt: new Date(Date.now() - 40 * 86_400_000).toISOString() });
    await db.candidates.put(candidate);
    await db.matches.put(match);

    const result = await runOnce();
    expect(result.checked).toBe(0);
    expect(outlookService.findRepliesFrom).not.toHaveBeenCalled();
  });

  it('collects a friendly error per candidate without aborting the whole pass', async () => {
    const a = makeCandidate({ name: 'A' });
    const b = makeCandidate({ name: 'B' });
    await db.candidates.bulkPut([a, b]);
    await db.matches.bulkPut([makeMatch(a.id), makeMatch(b.id)]);

    vi.mocked(outlookService.findRepliesFrom)
      .mockRejectedValueOnce(new Error('Outlook is having trouble right now'))
      .mockResolvedValueOnce([]);

    const result = await runOnce();
    expect(result.checked).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Outlook is having trouble');
  });
});

describe('replyWatcher.recentReplies', () => {
  it('surfaces a reply_detected activity from the last 24h, newest first, snippet only', async () => {
    const candidate = makeCandidate({ name: 'Kofi' });
    await db.candidates.put(candidate);
    await dataService.logActivity({
      candidateId: candidate.id, type: 'reply_detected', actor: 'system',
      body: 'msg:m1 Sounds great, let\'s talk', at: new Date().toISOString(),
    });

    const items = await recentReplies();
    expect(items).toHaveLength(1);
    expect(items[0].candidateName).toBe('Kofi');
    expect(items[0].snippet).toBe("Sounds great, let's talk");
  });

  it('excludes replies older than the window', async () => {
    const candidate = makeCandidate();
    await db.candidates.put(candidate);
    await dataService.logActivity({
      candidateId: candidate.id, type: 'reply_detected', actor: 'system',
      body: 'msg:old stale', at: new Date(Date.now() - 48 * 3_600_000).toISOString(),
    });

    const items = await recentReplies(24);
    expect(items).toHaveLength(0);
  });
});
