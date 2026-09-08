/**
 * briefFacts — the Daily Brief (DESIGN-v2.1.md §C.1 + council amendment). Code computes every
 * fact and count from the live bench; `api/brief.ts` (Groq, streaming) is only ever allowed to
 * *order and phrase* that exact list — never predict, never invent a name or number. This file
 * owns: computing the facts, the cache-per-(day, benchHash) lookup in `settings.briefCache`, the
 * deterministic template fallback (used verbatim when there are zero facts, and as the safety
 * net when the model is down or hallucinates a name), and the post-check that rejects a
 * phrasing containing a name that isn't in the fact list.
 */

import { dataService } from './dataService';
import { contentHash } from '../lib/hash';
import { SETTINGS_KEYS } from '../types';
import type { Candidate, Match, Sequence, Process, Id, ISODate } from '../types';

export type BriefFactKind =
  | 'resurface_window' | 'reply_unanswered' | 'stale_strong' | 'best_shortlist'
  | 'sequence_due' | 'placement_this_month';

export interface BriefFact {
  kind: BriefFactKind;
  count: number;
  /** Real names only, straight off the bench — never invented, capped for prompt size. */
  names: string[];
  /**
   * Candidate id parallel to `names[i]` — a name string alone isn't a safe key or a safe click
   * target: the bench can (and, past a few thousand rows, will) contain two people with the same
   * name. Optional only so existing test fixtures that hand-build a BriefFact literal still typecheck.
   */
  ids?: Id[];
  /** `?c=<id>` for a single person, `?filter=<kind>[&roleId=...]` for a group — B2's Bench/Today read this. */
  link: string;
  /** best_shortlist only. */
  roleTitle?: string;
}

export interface BriefFactList {
  /** Start of "today", UTC-normalized. */
  dateISO: ISODate;
  /** "Tuesday 8 September" (DESIGN-v2.1.md §C.4: "{Weekday} {D Month}") — computed here so neither the model nor the cache key ever drifts on TZ. */
  dateLabel: string;
  /** hash(all record ids + updatedAt) — the "benchHash" half of the settings.briefCache cache key. */
  benchHash: string;
  facts: BriefFact[];
}

const RESURFACE_WINDOW_DAYS = 7;
const STALE_DAYS = 30;
const STRONG_FIT_THRESHOLD = 80;
const SHORTLIST_FIT_THRESHOLD = 70;
const NAME_CAP = 8;

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function withinNextDays(iso: ISODate, days: number, from: Date): boolean {
  const diffDays = (new Date(iso).getTime() - from.getTime()) / 86_400_000;
  return diffDays >= 0 && diffDays <= days;
}

function isSameUTCDay(iso: ISODate, from: Date): boolean {
  const d = new Date(iso);
  return d.getUTCFullYear() === from.getUTCFullYear() && d.getUTCMonth() === from.getUTCMonth() && d.getUTCDate() === from.getUTCDate();
}

function isSameUTCMonth(iso: ISODate, from: Date): boolean {
  const d = new Date(iso);
  return d.getUTCFullYear() === from.getUTCFullYear() && d.getUTCMonth() === from.getUTCMonth();
}

/**
 * DESIGN-v2.1.md §C.4: opening line format "{Weekday} {D Month} — ...". `en-US` day-numeric +
 * month-long formats as "Weekday, Month D" (comma, month before day) — build the exact
 * "Weekday D Month" shape ourselves instead of relying on locale ordering.
 */
function formatDateLabel(d: Date): string {
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const day = d.getUTCDate();
  const month = d.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  return `${weekday} ${day} ${month}`;
}

function linkFor(kind: BriefFactKind, ids: Id[], roleId?: Id): string {
  if (ids.length === 1) return `?c=${ids[0]}`;
  return `?filter=${kind}${roleId ? `&roleId=${roleId}` : ''}`;
}

/** Pairs a name with the id it came from so a duplicate-named bench never mislinks or double-keys. */
interface NamedId { id: Id; name: string }

function toFact(kind: BriefFactKind, people: NamedId[], link: string, extra: Partial<BriefFact> = {}): BriefFact | null {
  if (!people.length) return null;
  const capped = people.slice(0, NAME_CAP);
  return { kind, count: people.length, names: capped.map(p => p.name), ids: capped.map(p => p.id), link, ...extra };
}

/** candidateId -> name, deduped by id and filtered to ids that still resolve on the current bench. */
function namedIds(ids: Id[], candidateById: Map<Id, Candidate>): NamedId[] {
  const seen = new Set<Id>();
  const out: NamedId[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const c = candidateById.get(id);
    if (!c) continue;
    seen.add(id);
    out.push({ id, name: c.name });
  }
  return out;
}

function computeBenchHash(candidates: Candidate[], matches: Match[], sequences: Sequence[], processes: Process[]): string {
  const parts = [
    ...candidates.map(c => `c:${c.id}:${c.updatedAt}`).sort(),
    ...matches.map(m => `m:${m.id}:${m.updatedAt}`).sort(),
    ...sequences.map(s => `s:${s.id}:${s.updatedAt}`).sort(),
    ...processes.map(p => `p:${p.id}:${p.updatedAt}`).sort(),
  ];
  return contentHash(parts.join('|'));
}

/**
 * Computes every Daily Brief fact from the live bench. `roleId` (the currently selected role)
 * is required for the "best shortlist" fact — DESIGN-v2.1.md's addendum: "best shortlist for
 * the selected role" — and that fact is simply omitted when no role is selected.
 */
export async function computeBriefFacts(roleId?: Id, now: Date = new Date()): Promise<BriefFactList> {
  const [candidates, matches, sequences, processes] = await Promise.all([
    dataService.list('candidates'),
    dataService.list('matches'),
    dataService.list('sequences'),
    dataService.list('processes'),
  ]);
  const candidateById = new Map(candidates.map(c => [c.id, c]));
  const facts: BriefFact[] = [];

  // 1. Resurface windows opening within 7 days.
  const resurfacing = candidates.filter(c => c.status === 'took_role' && c.snoozeUntil && withinNextDays(c.snoozeUntil, RESURFACE_WINDOW_DAYS, now));
  const resurfacePeople = namedIds(resurfacing.map(c => c.id), candidateById);
  const resurfaceFact = toFact('resurface_window', resurfacePeople, linkFor('resurface_window', resurfacePeople.map(p => p.id)));
  if (resurfaceFact) facts.push(resurfaceFact);

  // 2. Replies detected and still unanswered — a Match sitting in the 'replied' board stage.
  // A candidate can be matched (and replied) on more than one role, so count/name PEOPLE, not
  // matches — a bench where 6 people replied across 8 roles each must never read "48 replies".
  const unansweredCandidateIds = matches.filter(m => m.stage === 'replied').map(m => m.candidateId);
  const unansweredPeople = namedIds(unansweredCandidateIds, candidateById);
  const replyFact = toFact('reply_unanswered', unansweredPeople, linkFor('reply_unanswered', unansweredPeople.map(p => p.id)));
  if (replyFact) facts.push(replyFact);

  // 3. Stale-but-strong: best fit >= 80 across any of their matches, active, no touch in 30+ days.
  const bestScoreByCandidate = new Map<Id, number>();
  for (const m of matches) {
    const score = m.override?.score ?? m.score;
    if (score > (bestScoreByCandidate.get(m.candidateId) ?? -1)) bestScoreByCandidate.set(m.candidateId, score);
  }
  const staleStrong = candidates.filter(c => {
    if (c.status !== 'active') return false;
    const best = bestScoreByCandidate.get(c.id);
    if (best === undefined || best < STRONG_FIT_THRESHOLD) return false;
    return dataService.computeWarmthDays(c.warmthAt, now) > STALE_DAYS;
  });
  const stalePeople = namedIds(staleStrong.map(c => c.id), candidateById);
  const staleFact = toFact('stale_strong', stalePeople, linkFor('stale_strong', stalePeople.map(p => p.id)));
  if (staleFact) facts.push(staleFact);

  // 4. Best shortlist for the selected role — active candidates, still 'warm', fit >= 70.
  if (roleId) {
    const role = await dataService.get('roles', roleId);
    const shortlist = matches
      .filter(m => m.roleId === roleId && m.stage === 'warm')
      .map(m => ({ candidate: candidateById.get(m.candidateId), score: m.override?.score ?? m.score }))
      .filter((x): x is { candidate: Candidate; score: number } => !!x.candidate && x.candidate.status === 'active' && x.score >= SHORTLIST_FIT_THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const shortlistPeople: NamedId[] = shortlist.map(x => ({ id: x.candidate.id, name: x.candidate.name }));
    const shortlistFact = toFact(
      'best_shortlist',
      shortlistPeople,
      linkFor('best_shortlist', shortlistPeople.map(p => p.id), roleId),
      { roleTitle: role?.title },
    );
    if (shortlistFact) facts.push(shortlistFact);
  }

  // 5. Sequence steps due today. (A person can legitimately have two sequences due the same
  // day across two roles — that's still "2 steps", so this one is intentionally NOT deduped by
  // candidate the way reply_unanswered is; each due step gets its own name/id pair.)
  const dueToday = sequences.filter(s => s.nextDueAt && isSameUTCDay(s.nextDueAt, now));
  const duePeople = dueToday.map(s => candidateById.get(s.candidateId)).filter((c): c is Candidate => !!c).map(c => ({ id: c.id, name: c.name }));
  const dueFact = toFact('sequence_due', duePeople, linkFor('sequence_due', duePeople.map(p => p.id)));
  if (dueFact) facts.push(dueFact);

  // 6. Placements this month.
  const placedThisMonth = processes.filter(p => p.finishedAs === 'placed' && isSameUTCMonth(p.date, now));
  const placedPeople = placedThisMonth.map(p => candidateById.get(p.candidateId)).filter((c): c is Candidate => !!c).map(c => ({ id: c.id, name: c.name }));
  const placedFact = toFact('placement_this_month', placedPeople, linkFor('placement_this_month', placedPeople.map(p => p.id)));
  if (placedFact) facts.push(placedFact);

  return {
    dateISO: startOfDayUTC(now).toISOString(),
    dateLabel: formatDateLabel(now),
    benchHash: computeBenchHash(candidates, matches, sequences, processes),
    facts,
  };
}

// ------------------------------------------------------------------------------ deterministic prose

function namesList(names: string[]): string {
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
}

const KIND_SENTENCE: Record<BriefFactKind, (f: BriefFact) => string> = {
  resurface_window: f => `${f.count} resurface window${f.count === 1 ? '' : 's'} opening this week (${namesList(f.names)})`,
  reply_unanswered: f => `${f.count} repl${f.count === 1 ? 'y' : 'ies'} waiting on you (${namesList(f.names)})`,
  stale_strong: f => `${f.count} strong fit${f.count === 1 ? '' : 's'} gone quiet for a month or more (${namesList(f.names)})`,
  best_shortlist: f => `${f.roleTitle ? `${f.roleTitle} has your` : 'Your'} best shortlist: ${namesList(f.names)}`,
  sequence_due: f => `${f.count} sequence step${f.count === 1 ? '' : 's'} due today (${namesList(f.names)})`,
  placement_this_month: f => `${f.count} placement${f.count === 1 ? '' : 's'} this month (${namesList(f.names)})`,
};

/**
 * The deterministic fallback — DESIGN-v2.1.md §C.1: "fallback = deterministic template
 * sentences when the model is down." Also the exact "no facts" copy from the council amendment.
 */
export function templateBrief(factList: Pick<BriefFactList, 'dateLabel' | 'facts'>): string {
  if (!factList.facts.length) return 'Nothing needs you today.';
  const total = factList.facts.reduce((s, f) => s + f.count, 0);
  const [biggest, ...rest] = [...factList.facts].sort((a, b) => b.count - a.count);
  const opening = `${factList.dateLabel} — ${total} thing${total === 1 ? '' : 's'} need you. ${KIND_SENTENCE[biggest.kind](biggest)}.`;
  return [opening, ...rest.map(f => `${KIND_SENTENCE[f.kind](f)}.`)].join(' ');
}

// -------------------------------------------------------------------------------------- guard

const KNOWN_SENTENCE_OPENERS = new Set([
  'Today', 'This', 'That', 'Your', 'Nothing', 'Needs', 'You',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
]);

/** Two-or-three-capitalized-word runs — the shape of a person's name in prose. */
const NAME_LIKE_PATTERN = /\b[A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){1,2}\b/g;

/**
 * Rejects a model phrasing that mentions a name-shaped span not present anywhere in the given
 * facts. Defense in depth: `getBrief` always has the deterministic template to fall back to, so
 * this only needs to be strict enough to catch a hallucinated name, never perfectly precise.
 */
/** Strips a trailing possessive ("Abara's" -> "abara", "Osei'" -> "osei") before comparing —
 * natural phrasing like "Chiara Abara's window" must not read as a hallucinated name just
 * because NAME_LIKE_PATTERN's word-chars include the apostrophe the possessive is built from. */
function stripPossessive(word: string): string {
  return word.replace(/'s$/i, '').replace(/'$/, '');
}

/** snake_case fact-kind values (e.g. "stale_strong") are internal identifiers, never prose — if
 * one leaks into the model's sentence verbatim (a prompt-following glitch, not a hallucinated
 * name, so the NAME_LIKE_PATTERN check below never catches it), reject the phrasing. */
const FACT_KIND_PATTERN = /\b[a-z]+(?:_[a-z]+)+\b/;

export function validatePhrasing(text: string, facts: BriefFact[]): boolean {
  if (FACT_KIND_PATTERN.test(text)) return false;
  const allowedFull = new Set(facts.flatMap(f => f.names).map(n => n.toLowerCase()));
  const allowedWords = new Set(facts.flatMap(f => f.names).flatMap(n => n.split(/\s+/).map(w => w.toLowerCase())));
  for (const f of facts) if (f.roleTitle) for (const w of f.roleTitle.split(/\s+/)) allowedWords.add(w.toLowerCase());

  const spans = text.match(NAME_LIKE_PATTERN) ?? [];
  for (const span of spans) {
    if (KNOWN_SENTENCE_OPENERS.has(span.split(/\s+/)[0])) continue;
    const lower = span.toLowerCase();
    if (allowedFull.has(lower) || allowedFull.has(stripPossessive(lower))) continue;
    const words = lower.split(/\s+/).map(stripPossessive);
    if (words.every(w => allowedWords.has(w))) continue;
    return false; // a name-shaped span that traces to nothing in the fact list
  }
  return true;
}

// ------------------------------------------------------------------------------------- getBrief

interface CachedBrief {
  dateISO: ISODate;
  benchHash: string;
  text: string;
}

export interface DailyBrief {
  text: string;
  facts: BriefFact[];
  /** true when this came from settings.briefCache rather than a fresh compute/phrase. */
  cached: boolean;
}

async function cacheBrief(factList: BriefFactList, text: string): Promise<void> {
  const record: CachedBrief = { dateISO: factList.dateISO, benchHash: factList.benchHash, text };
  await dataService.setSetting(SETTINGS_KEYS.briefCache, record);
}

/**
 * The full pipeline: compute facts, check `settings.briefCache` for (day, benchHash), otherwise
 * phrase via api/brief.ts (falling back to the deterministic template on any failure or a
 * rejected phrasing), then cache. Safe to call on every Today mount — cache hits do zero network.
 */
export async function getBrief(roleId?: Id, now: Date = new Date()): Promise<DailyBrief> {
  const factList = await computeBriefFacts(roleId, now);

  if (factList.facts.length === 0) {
    const text = templateBrief(factList);
    await cacheBrief(factList, text);
    return { text, facts: [], cached: false };
  }

  const cached = await dataService.getSetting<CachedBrief | null>(SETTINGS_KEYS.briefCache, null);
  if (cached && cached.dateISO === factList.dateISO && cached.benchHash === factList.benchHash) {
    return { text: cached.text, facts: factList.facts, cached: true };
  }

  let text = templateBrief(factList);
  try {
    const res = await fetch('/api/brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts: factList.facts, dateLabel: factList.dateLabel }),
    });
    if (res.ok) {
      const modelText = (await res.text()).trim();
      if (modelText && validatePhrasing(modelText, factList.facts)) text = modelText;
    }
  } catch {
    // network/model down — the deterministic template already stands.
  }

  await cacheBrief(factList, text);
  return { text, facts: factList.facts, cached: false };
}

export const briefFacts = { computeBriefFacts, getBrief, templateBrief, validatePhrasing };

export default briefFacts;
