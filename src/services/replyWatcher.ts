/**
 * replyWatcher — polls Graph for inbound replies from candidates we've reached out to, and
 * flips them to "Replied" automatically. DESIGN-v2.1.md §A: "every 15 minutes while the app is
 * open (and on demand) ... a reply auto-moves the person to Replied, logs an activity with the
 * snippet, and shows a Today card." Read-only against Graph — never deletes or marks a message.
 *
 * "An outreach in the last 30 days" is modelled as a Match whose board stage is `reached_out`
 * with a recent `stageUpdatedAt` (BLUEPRINT-v2.md's own Board column for exactly this state) —
 * no separate bookkeeping needed. Idempotency is by Graph message id, encoded into the
 * `reply_detected` activity body (`msg:<id> ...`), so re-polling the same inbox never double-logs.
 */

import { dataService } from './dataService';
import * as microsoftAuth from './microsoftAuth';
import * as outlookService from './outlookService';
import type { Candidate, Match, Id } from '../types';

const LOOKBACK_DAYS = 30;
const POLL_INTERVAL_MS = 15 * 60_000;
const SNIPPET_MAX = 200;

export interface ReplyWatcherResult {
  /** Candidates actually checked against Graph this pass (0 when not connected/no candidates due). */
  checked: number;
  repliesFound: number;
  errors: string[];
}

function messageMarker(id: string): string {
  return `msg:${id}`;
}

async function candidatesAwaitingReply(): Promise<{ candidate: Candidate; match: Match }[]> {
  const cutoff = Date.now() - LOOKBACK_DAYS * 86_400_000;
  const [matches, candidates] = await Promise.all([
    dataService.list('matches'),
    dataService.list('candidates'),
  ]);
  const byId = new Map(candidates.map(c => [c.id, c]));
  const pairs: { candidate: Candidate; match: Match }[] = [];
  for (const m of matches) {
    if (m.stage !== 'reached_out') continue;
    if (new Date(m.stageUpdatedAt).getTime() < cutoff) continue;
    const candidate = byId.get(m.candidateId);
    if (candidate?.email) pairs.push({ candidate, match: m });
  }
  return pairs;
}

/** True when a `msg:<id>` marker has already been logged for this candidate — the dedupe check. */
function alreadyLogged(seenMarkers: Set<string>, messageId: string): boolean {
  return seenMarkers.has(messageMarker(messageId));
}

async function loadSeenMarkers(): Promise<Set<string>> {
  const activities = await dataService.list('activities');
  const seen = new Set<string>();
  for (const a of activities) {
    if (a.type !== 'reply_detected') continue;
    const match = /^(msg:\S+)/.exec(a.body);
    if (match) seen.add(match[1]);
  }
  return seen;
}

/**
 * Checks every candidate awaiting a reply once, using a live Graph token. Safe to call
 * concurrently with itself (later calls just re-derive `seen` fresh), and safe when Outlook
 * isn't connected — returns `{checked:0}` rather than throwing, since this runs on a timer.
 */
export async function runOnce(): Promise<ReplyWatcherResult> {
  const result: ReplyWatcherResult = { checked: 0, repliesFound: 0, errors: [] };
  if (!microsoftAuth.isConfigured()) return result;
  if (!microsoftAuth.getAccount()) return result;

  let token: string | null;
  try {
    token = await microsoftAuth.getToken(microsoftAuth.GRAPH_SCOPES.mail);
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : 'Could not get an Outlook token.');
    return result;
  }
  if (!token) return result;

  const [pairs, seen] = await Promise.all([candidatesAwaitingReply(), loadSeenMarkers()]);

  for (const { candidate, match } of pairs) {
    result.checked++;
    try {
      const hits = await outlookService.findRepliesFrom(token, candidate.email!, match.stageUpdatedAt);
      const fresh = hits.find(h => !alreadyLogged(seen, h.messageId));
      if (!fresh) continue;

      const snippet = fresh.snippet.slice(0, SNIPPET_MAX);
      await dataService.setStage(match.id, 'replied', `Reply detected — "${snippet}"`);
      await dataService.logActivity({
        candidateId: candidate.id,
        roleId: match.roleId,
        type: 'reply_detected',
        body: `${messageMarker(fresh.messageId)} ${snippet}`,
        actor: 'system',
        at: fresh.receivedAt,
      });
      seen.add(messageMarker(fresh.messageId));
      result.repliesFound++;
    } catch (e) {
      result.errors.push(`${candidate.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Starts the 15-minute poll loop (idempotent — a second call while running is a no-op). */
export function start(): void {
  if (timer) return;
  void runOnce();
  timer = setInterval(() => { void runOnce(); }, POLL_INTERVAL_MS);
}

export function stop(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

export function isRunning(): boolean {
  return timer !== null;
}

/**
 * `activities` where `type === 'reply_detected'` in the last 24h, newest first — exactly what
 * Today needs to render DESIGN-v2.1.md's "X replied — read" card. No separate feed to maintain.
 */
export async function recentReplies(withinHours = 24): Promise<{ candidateId: Id; candidateName: string; snippet: string; at: string }[]> {
  const cutoff = Date.now() - withinHours * 3_600_000;
  const [activities, candidates] = await Promise.all([
    dataService.list('activities'),
    dataService.list('candidates'),
  ]);
  const nameById = new Map(candidates.map(c => [c.id, c.name]));
  return activities
    .filter(a => a.type === 'reply_detected' && new Date(a.at).getTime() >= cutoff)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .map(a => ({
      candidateId: a.candidateId,
      candidateName: nameById.get(a.candidateId) ?? 'Someone',
      snippet: a.body.replace(/^msg:\S+\s*/, ''),
      at: a.at,
    }));
}

export const replyWatcher = { runOnce, start, stop, isRunning, recentReplies };

export default replyWatcher;
