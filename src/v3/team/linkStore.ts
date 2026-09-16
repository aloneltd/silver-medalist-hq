/**
 * The add-to-bench link, stored locally under `V3_SETTINGS_KEYS.addLink`. In shared mode
 * (see sharedSync.ts) writes also go to the Drive-backed store so the link is checkable from
 * a device that has never opened this app before — the whole point of a public link.
 */
import { dataService } from '../../services/dataService';
import { ulid } from '../../lib/ulid';
import { V3_SETTINGS_KEYS } from '../../types';
import { checkAddLinkToken, newExpiry, type AddLinkRecord, type TokenStatus } from './tokenLogic';

export async function getAddLink(): Promise<AddLinkRecord | undefined> {
  return dataService.getSetting<AddLinkRecord | undefined>(V3_SETTINGS_KEYS.addLink, undefined);
}

function freshLink(): AddLinkRecord {
  return { token: ulid(), createdAt: new Date().toISOString(), expiresAt: newExpiry(), revoked: false, useCount: 0, users: [] };
}

/** First call ever: create one. */
export async function ensureAddLink(): Promise<AddLinkRecord> {
  const existing = await getAddLink();
  if (existing) return existing;
  const link = freshLink();
  await dataService.setSetting(V3_SETTINGS_KEYS.addLink, link);
  return link;
}

/** New token, fresh 30-day clock, usage reset — the old link stops working immediately. */
export async function regenerateAddLink(): Promise<AddLinkRecord> {
  const link = freshLink();
  await dataService.setSetting(V3_SETTINGS_KEYS.addLink, link);
  return link;
}

export async function revokeAddLink(): Promise<AddLinkRecord | undefined> {
  const existing = await getAddLink();
  if (!existing) return undefined;
  const revoked = { ...existing, revoked: true };
  await dataService.setSetting(V3_SETTINGS_KEYS.addLink, revoked);
  return revoked;
}

export async function recordAddLinkUse(submitterLabel: string): Promise<void> {
  const existing = await getAddLink();
  if (!existing) return;
  const users = existing.users.includes(submitterLabel) ? existing.users : [...existing.users, submitterLabel];
  await dataService.setSetting(V3_SETTINGS_KEYS.addLink, { ...existing, useCount: existing.useCount + 1, users });
}

export async function validateAddLinkLocally(token: string): Promise<TokenStatus> {
  const link = await getAddLink();
  return checkAddLinkToken(link, token);
}

export { checkAddLinkToken, linkStatusLine } from './tokenLogic';
export type { AddLinkRecord, TokenStatus } from './tokenLogic';
