/**
 * Pure add-to-bench-link logic — no Dexie, no fetch, no React. Shared by the client
 * (src/v3/team/linkStore.ts) and the server (api/team.ts), so "expired" means the same thing
 * in a browser tab and in a Vercel function without either one importing the other's runtime.
 */

export interface AddLinkRecord {
  token: string;
  /** ISODate */
  createdAt: string;
  /** ISODate */
  expiresAt: string;
  revoked: boolean;
  useCount: number;
  /** Distinct submitter names/emails seen so far — the "used N times by M people" line. */
  users: string[];
}

export type TokenStatus = 'valid' | 'expired' | 'revoked' | 'unknown';

export const ADD_LINK_TTL_DAYS = 30;

export function newExpiry(now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + ADD_LINK_TTL_DAYS);
  return d.toISOString();
}

/** The one honest sentence for each token state — used verbatim by the public /add page. */
export const TOKEN_STATUS_SENTENCE: Record<TokenStatus, string> = {
  valid: '',
  expired: 'This link has expired. Ask for a fresh one — links last 30 days.',
  revoked: 'This link has been turned off. Ask for a new one.',
  unknown: "We don't recognize this link.",
};

export function checkAddLinkToken(
  link: AddLinkRecord | null | undefined,
  token: string,
  now: Date = new Date(),
): TokenStatus {
  if (!token || !link || link.token !== token) return 'unknown';
  if (link.revoked) return 'revoked';
  if (new Date(link.expiresAt).getTime() <= now.getTime()) return 'expired';
  return 'valid';
}

export function recordUse(link: AddLinkRecord, submitterLabel: string): AddLinkRecord {
  const users = link.users.includes(submitterLabel) ? link.users : [...link.users, submitterLabel];
  return { ...link, useCount: link.useCount + 1, users };
}

/** "Expires in 30 days. Used 12 times by 5 people." / "Expired 3 days ago." */
export function linkStatusLine(link: AddLinkRecord, now: Date = new Date()): string {
  const status = checkAddLinkToken(link, link.token, now);
  const days = Math.ceil((new Date(link.expiresAt).getTime() - now.getTime()) / 86_400_000);
  const usage = `Used ${link.useCount} time${link.useCount === 1 ? '' : 's'} by ${link.users.length} ${link.users.length === 1 ? 'person' : 'people'}.`;
  if (status === 'revoked') return `Revoked. ${usage}`;
  if (status === 'expired') return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago. ${usage}`;
  return `Expires in ${days} day${days === 1 ? '' : 's'}. ${usage}`;
}
