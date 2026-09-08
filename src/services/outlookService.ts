/**
 * outlookService — pure Microsoft Graph REST layer (fetch, no SDK — DESIGN-v2.1.md §A). Every
 * function takes the caller's delegated access token explicitly (from microsoftAuth.getToken)
 * and never persists it anywhere; this module holds no state of its own.
 *
 * `sendDraft` is the one write with real consequences (an email actually leaves the mailbox),
 * so it re-checks `settings.outlookAllowSend` itself as a second gate, in addition to whatever
 * check the UI already did — belt-and-braces, same reasoning as api/score.ts's
 * `opted_out` filter never trusting the caller alone.
 */

import { dataService } from './dataService';
import { SETTINGS_KEYS } from '../types';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

export class OutlookError extends Error {
  constructor(message: string, public status?: number, public cause?: unknown) {
    super(message);
    this.name = 'OutlookError';
  }
}

/** Maps a failed Graph response to copy a recruiter can actually act on. */
async function friendlyError(res: Response, action: string): Promise<OutlookError> {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error?.message ?? '';
  } catch { /* not JSON */ }

  if (res.status === 401) return new OutlookError('Your Outlook connection expired — reconnect in Settings.', 401);
  if (res.status === 403) return new OutlookError('Outlook declined that permission — reconnect and accept Mail/Calendar access.', 403);
  if (res.status === 429) return new OutlookError('Outlook is rate-limiting us right now — try again in a moment.', 429);
  if (res.status >= 500) return new OutlookError('Outlook is having trouble right now — try again shortly.', res.status);
  return new OutlookError(`Couldn't ${action}${detail ? `: ${detail}` : ` (Outlook returned ${res.status})`}.`, res.status);
}

async function graphFetch(token: string, path: string, init: RequestInit, action: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${GRAPH_BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
  } catch (e) {
    throw new OutlookError('Could not reach Outlook — check your connection and try again.', undefined, e);
  }
  if (!res.ok) throw await friendlyError(res, action);
  return res;
}

// --------------------------------------------------------------------------------- draft/send

export interface CreateDraftInput {
  to: string;
  subject: string;
  /** HTML body — Graph messages default to HTML content type. */
  html: string;
}

export interface OutlookDraft {
  id: string;
  webLink: string;
}

/** POST /me/messages — creates (but never sends) a draft. Composer's "Create draft in Outlook". */
export async function createDraft(token: string, input: CreateDraftInput): Promise<OutlookDraft> {
  const res = await graphFetch(token, '/me/messages', {
    method: 'POST',
    body: JSON.stringify({
      subject: input.subject,
      body: { contentType: 'HTML', content: input.html },
      toRecipients: [{ emailAddress: { address: input.to } }],
    }),
  }, 'create the draft');
  const data = await res.json();
  return { id: data.id as string, webLink: data.webLink as string };
}

/**
 * POST /me/messages/{id}/send — only fires when `settings.outlookAllowSend` is true.
 * DESIGN-v2.1.md §A: "Send from Outlook (explicit click + confirm; logs email_sent)". This
 * function performs the send + the activity log; the confirm step belongs to the UI (B2).
 */
export async function sendDraft(token: string, id: string, candidateId?: string): Promise<void> {
  const allowed = await dataService.getSetting<boolean>(SETTINGS_KEYS.outlookAllowSend, false);
  if (!allowed) {
    throw new OutlookError('Sending from HQ is turned off — enable "allow sending from HQ" in Settings → Connections first.');
  }
  await graphFetch(token, `/me/messages/${encodeURIComponent(id)}/send`, { method: 'POST' }, 'send that message');
  if (candidateId) {
    await dataService.logActivity({
      candidateId,
      type: 'email_sent',
      body: `Sent from Outlook (message ${id})`,
      actor: 'owner',
    });
  }
}

// ------------------------------------------------------------------------------------- replies

export interface OutlookReplyHit {
  messageId: string;
  receivedAt: string;
  /** Plain-text snippet, already trimmed to a safe preview length. */
  snippet: string;
  subject: string;
}

const SNIPPET_MAX = 200;

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Read-only inbox search for replies from a specific address since a timestamp — DESIGN-v2.1.md
 * §A's reply-detection query. Graph's `$search` doesn't support a combined date filter cleanly,
 * so the since-cutoff is applied client-side after the search comes back; never deletes or
 * flags anything.
 */
export async function findRepliesFrom(token: string, email: string, sinceISO: string): Promise<OutlookReplyHit[]> {
  const search = encodeURIComponent(`"from:${email}"`);
  const select = 'id,receivedDateTime,subject,bodyPreview';
  const res = await graphFetch(
    token,
    `/me/mailFolders/inbox/messages?$search=${search}&$select=${select}&$top=25`,
    { method: 'GET', headers: { ConsistencyLevel: 'eventual' } },
    'check for replies',
  );
  const data = await res.json();
  const since = new Date(sinceISO).getTime();
  const items: Array<{ id: string; receivedDateTime: string; subject?: string; bodyPreview?: string }> = data.value ?? [];
  return items
    .filter(m => new Date(m.receivedDateTime).getTime() >= since)
    .sort((a, b) => new Date(a.receivedDateTime).getTime() - new Date(b.receivedDateTime).getTime())
    .map(m => ({
      messageId: m.id,
      receivedAt: m.receivedDateTime,
      subject: m.subject ?? '(no subject)',
      snippet: stripHtml(m.bodyPreview ?? '').slice(0, SNIPPET_MAX),
    }));
}

// ------------------------------------------------------------------------------------ calendar

export interface OutlookMeeting {
  subject: string;
  start: string;
  end: string;
}

/** GET /me/calendarView — "when did we last meet" (optional, Calendars.Read). Read-only. */
export async function lastMeetingWith(token: string, email: string): Promise<OutlookMeeting | null> {
  const now = new Date();
  const start = new Date(now.getTime() - 365 * 86_400_000).toISOString();
  const end = now.toISOString();
  const params = new URLSearchParams({
    startDateTime: start,
    endDateTime: end,
    $orderby: 'start/dateTime desc',
    $top: '50',
    $select: 'subject,start,end,attendees',
  });
  let res: Response;
  try {
    res = await graphFetch(token, `/me/calendarView?${params.toString()}`, { method: 'GET' }, 'check the calendar');
  } catch (e) {
    // Calendars.Read is optional per DESIGN-v2.1.md §A — a missing-scope 403 degrades to "unknown", not a crash.
    if (e instanceof OutlookError && e.status === 403) return null;
    throw e;
  }
  const data = await res.json();
  const events: Array<{ subject: string; start: { dateTime: string }; end: { dateTime: string }; attendees?: Array<{ emailAddress?: { address?: string } }> }> = data.value ?? [];
  const needle = email.trim().toLowerCase();
  const match = events.find(ev => (ev.attendees ?? []).some(a => a.emailAddress?.address?.trim().toLowerCase() === needle));
  if (!match) return null;
  return { subject: match.subject, start: match.start.dateTime, end: match.end.dateTime };
}

export const outlookService = { createDraft, sendDraft, findRepliesFrom, lastMeetingWith, OutlookError };

export default outlookService;
