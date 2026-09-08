import { db } from '../../db';
import { dataService } from '../../services/dataService';
import { contentHash } from '../../lib/hash';
import type { Candidate, Id, Role } from '../../types';

/**
 * Daily Brief fact computation — council amendments §4, the hard boundary: "code computes
 * every fact and count ... the model only orders and phrases a JSON fact list." Everything in
 * this file is deterministic and reads only from the live bench (dataService/Dexie); no AI
 * call happens here. DailyBrief.tsx hands the resulting facts to /api/brief for phrasing, and
 * falls back to `fact.plain` verbatim if that call is unavailable — either way, no sentence
 * says anything this file didn't already know.
 */

export type BriefFactKind = 'resurface' | 'reply' | 'stale_strong' | 'best_shortlist';
export type BriefActionKind = 'reach_out' | 'open_shortlist' | 'snooze' | 'open_candidate';

export interface BriefFact {
  id: string;
  kind: BriefFactKind;
  /** The plain-English sentence this fact supports on its own — the honest fallback when no
   * AI phrasing is available, and the ground truth the AI is not allowed to contradict. */
  plain: string;
  candidateId?: Id;
  candidateName?: string;
  roleId?: Id;
  roleTitle?: string;
  action: BriefActionKind;
}

const RESURFACE_LOOKAHEAD_DAYS = 21;
const STALE_STRONG_FIT_MIN = 80;
const STALE_STRONG_DAYS_MIN = 14;
const REPLY_LOOKBACK_DAYS = 4;
const MAX_FACTS = 5;

function daysUntil(iso: string, now: number): number {
  return Math.ceil((new Date(iso).getTime() - now) / 86_400_000);
}

async function resurfaceFacts(candidates: Candidate[], now: number): Promise<BriefFact[]> {
  const out: BriefFact[] = [];
  for (const c of candidates) {
    if (c.status !== 'took_role' || !c.snoozeUntil) continue;
    const days = daysUntil(c.snoozeUntil, now);
    if (days > RESURFACE_LOOKAHEAD_DAYS) continue;
    out.push({
      id: `resurface-${c.id}`,
      kind: 'resurface',
      plain: days <= 0
        ? `${c.name}'s resurface window is open now.`
        : `${c.name}'s resurface window opens in ${days} day${days === 1 ? '' : 's'}.`,
      candidateId: c.id,
      candidateName: c.name,
      action: 'open_candidate',
    });
  }
  out.sort((a, b) => (a.candidateId! < b.candidateId! ? -1 : 1));
  return out;
}

/** Reads real replyWatcher/Outlook activity — `reply_detected` per ActivityType (types/index.ts). */
async function replyFacts(now: number): Promise<BriefFact[]> {
  const sinceMs = now - REPLY_LOOKBACK_DAYS * 86_400_000;
  const recent = await db.activities
    .where('type').equals('reply_detected')
    .filter(a => new Date(a.at).getTime() >= sinceMs)
    .toArray();
  if (!recent.length) return [];
  const byId = new Map<Id, Candidate>();
  for (const a of recent) {
    if (byId.has(a.candidateId)) continue;
    const c = await dataService.get('candidates', a.candidateId);
    if (c) byId.set(a.candidateId, c);
  }
  return recent
    .filter(a => byId.has(a.candidateId))
    .map(a => {
      const c = byId.get(a.candidateId)!;
      const day = new Date(a.at).toLocaleDateString(undefined, { weekday: 'long' });
      return {
        id: `reply-${a.id}`,
        kind: 'reply' as const,
        plain: `${c.name} replied ${day} and hasn't been answered.`,
        candidateId: c.id,
        candidateName: c.name,
        action: 'reach_out' as const,
      };
    });
}

async function staleStrongFacts(roleId: Id | undefined, candidates: Candidate[], now: number): Promise<BriefFact[]> {
  if (!roleId) return [];
  const matches = await dataService.getMatchesForRole(roleId);
  const role = await dataService.get('roles', roleId);
  const byId = new Map(candidates.map(c => [c.id, c]));
  const out: BriefFact[] = [];
  for (const m of matches) {
    const c = byId.get(m.candidateId);
    if (!c || c.status !== 'active') continue;
    const fit = m.override?.score ?? m.score;
    if (fit < STALE_STRONG_FIT_MIN) continue;
    const days = dataService.computeWarmthDays(c.warmthAt, new Date(now));
    if (days < STALE_STRONG_DAYS_MIN) continue;
    out.push({
      id: `stale-${c.id}`,
      kind: 'stale_strong',
      plain: `${c.name} is a ${Math.round(fit)}-fit for ${role?.title ?? 'the open role'} and hasn't been touched in ${days} days.`,
      candidateId: c.id,
      candidateName: c.name,
      roleId,
      roleTitle: role?.title,
      action: 'reach_out',
    });
  }
  out.sort((a, b) => (a.candidateId! < b.candidateId! ? -1 : 1));
  return out;
}

async function bestShortlistFact(): Promise<BriefFact | null> {
  const roles = await dataService.list('roles');
  const openRoles = roles.filter((r: Role) => r.status === 'open');
  if (!openRoles.length) return null;
  let best: { role: Role; count: number } | null = null;
  for (const role of openRoles) {
    const matches = await dataService.getMatchesForRole(role.id);
    const strong = matches.filter(m => (m.override?.score ?? m.score) >= STALE_STRONG_FIT_MIN).length;
    if (strong > 0 && (!best || strong > best.count)) best = { role, count: strong };
  }
  if (!best) return null;
  return {
    id: `shortlist-${best.role.id}`,
    kind: 'best_shortlist',
    plain: `${best.role.title} has the strongest shortlist right now — ${best.count} people at 80+ fit.`,
    roleId: best.role.id,
    roleTitle: best.role.title,
    action: 'open_shortlist',
  };
}

export interface DailyBriefData {
  facts: BriefFact[];
  /** Deterministic per (day, fact set) — cache key for DailyBrief.tsx. */
  hash: string;
}

/**
 * Gathers up to MAX_FACTS facts, prioritized: replies (most time-sensitive) > resurface
 * windows opening > stale-but-strong fits > the role with the best shortlist. Never more than
 * one `best_shortlist` fact (it's a bench-wide summary, not a per-person alert).
 */
export async function computeDailyBriefFacts(selectedRoleId: Id | undefined, now: number = Date.now()): Promise<DailyBriefData> {
  const candidates = await dataService.list('candidates');
  const [replies, resurfaces, staleStrong, shortlist] = await Promise.all([
    replyFacts(now),
    resurfaceFacts(candidates, now),
    staleStrongFacts(selectedRoleId, candidates, now),
    bestShortlistFact(),
  ]);

  const ordered = [...replies, ...resurfaces, ...staleStrong, ...(shortlist ? [shortlist] : [])];
  const facts = ordered.slice(0, MAX_FACTS);
  const hash = contentHash(facts.map(f => f.id).join('|'));
  return { facts, hash };
}
