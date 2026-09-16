import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/schema';
import { checkAddLinkToken, newExpiry, type AddLinkRecord } from '../v3/team/tokenLogic';
import { ensureAddLink, regenerateAddLink, revokeAddLink, recordAddLinkUse, getAddLink, validateAddLinkLocally } from '../v3/team/linkStore';

function makeLink(overrides: Partial<AddLinkRecord> = {}): AddLinkRecord {
  return {
    token: 'tok_123',
    createdAt: new Date().toISOString(),
    expiresAt: newExpiry(),
    revoked: false,
    useCount: 0,
    users: [],
    ...overrides,
  };
}

describe('checkAddLinkToken — pure logic', () => {
  it('is unknown when there is no stored link at all', () => {
    expect(checkAddLinkToken(null, 'anything')).toBe('unknown');
  });

  it('is unknown when the token does not match the stored one', () => {
    expect(checkAddLinkToken(makeLink({ token: 'tok_abc' }), 'tok_xyz')).toBe('unknown');
  });

  it('is revoked when the stored link is flagged revoked, even if not expired', () => {
    const link = makeLink({ token: 'tok_1', revoked: true });
    expect(checkAddLinkToken(link, 'tok_1')).toBe('revoked');
  });

  it('is expired when the expiry date is in the past', () => {
    const link = makeLink({ token: 'tok_1', expiresAt: new Date(Date.now() - 86_400_000).toISOString() });
    expect(checkAddLinkToken(link, 'tok_1')).toBe('expired');
  });

  it('is valid for a matching, non-revoked, non-expired token', () => {
    const link = makeLink({ token: 'tok_1', expiresAt: newExpiry() });
    expect(checkAddLinkToken(link, 'tok_1')).toBe('valid');
  });

  it('checks revoked before expired when both are true', () => {
    const link = makeLink({ token: 'tok_1', revoked: true, expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(checkAddLinkToken(link, 'tok_1')).toBe('revoked');
  });
});

describe('linkStore — local Dexie-backed link', () => {
  beforeEach(async () => {
    await db.settings.clear();
  });

  it('creates a fresh link on first call and reuses it on the next', async () => {
    const first = await ensureAddLink();
    const second = await ensureAddLink();
    expect(first.token).toBe(second.token);
    expect(first.revoked).toBe(false);
    expect(first.useCount).toBe(0);
  });

  it('regenerate issues a new token and resets usage', async () => {
    const first = await ensureAddLink();
    await recordAddLinkUse('Priya');
    const regenerated = await regenerateAddLink();
    expect(regenerated.token).not.toBe(first.token);
    expect(regenerated.useCount).toBe(0);
    expect(regenerated.users).toEqual([]);
    expect(await validateAddLinkLocally(first.token)).toBe('unknown');
    expect(await validateAddLinkLocally(regenerated.token)).toBe('valid');
  });

  it('revoke stops the current token working without changing it', async () => {
    const link = await ensureAddLink();
    const revoked = await revokeAddLink();
    expect(revoked?.token).toBe(link.token);
    expect(await validateAddLinkLocally(link.token)).toBe('revoked');
  });

  it('recordAddLinkUse increments the count and dedupes people by label', async () => {
    await ensureAddLink();
    await recordAddLinkUse('Priya');
    await recordAddLinkUse('Priya');
    await recordAddLinkUse('Noah');
    const link = await getAddLink();
    expect(link?.useCount).toBe(3);
    expect(link?.users.sort()).toEqual(['Noah', 'Priya']);
  });
});
