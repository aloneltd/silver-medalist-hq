/**
 * nlCommand — natural-language ⌘K (DESIGN-v2.1.md §C.2 + council amendment). The model
 * (api/nl-command.ts, Groq JSON mode) only ever produces a *plan*: an action, a filter
 * description, and raw parameters. It NEVER resolves a relative date and NEVER touches the
 * database — both of those happen here, in code, so "snooze everyone who took a role until
 * spring" is deterministic and auditable. `preview()` is safe to call on every keystroke-debounce;
 * `apply()` is the only function that writes, and only ever runs on an explicit Apply keypress
 * (never the Enter that submitted the command — B2's palette owns that distinction).
 */

import { dataService } from './dataService';
import type {
  Candidate, CandidateStatus, Seniority, BoardStage, Match, Id, ISODate,
} from '../types';

// ------------------------------------------------------------------------------------- schema

export type NLAction = 'snooze' | 'status' | 'tag' | 'filter' | 'compose' | 'move_stage';

/**
 * A description of *who* a plan targets — never resolved candidate ids. The model fills in
 * whichever fields the command actually mentioned; `resolveFilter` turns this into concrete
 * candidates against the live Dexie bench.
 */
export interface NLFilterSpec {
  /** Specific person names mentioned verbatim, e.g. "Kofi" — matched case-insensitively, substring. */
  names?: string[];
  status?: CandidateStatus[];
  tag?: string;
  location?: string;
  skillsInclude?: string[];
  seniority?: Seniority[];
  boardStage?: BoardStage;
  warmthMinDays?: number;
  warmthMaxDays?: number;
  /** Loose ceiling — only ever compared against a candidate's USD comp figure. */
  compMaxUSD?: number;
  /** Free-text fallback: substring matched across name/title/employer/skills. */
  text?: string;
}

export interface NLPlanParams {
  /** Raw relative-date phrase from the command, verbatim — e.g. "spring", "in 2 weeks". Resolved by resolveRelativeDate(), never by the model. */
  until?: string;
  status?: CandidateStatus;
  tag?: string;
  stage?: BoardStage;
  tone?: 'warm' | 'direct' | 'short';
}

export interface NLPlan {
  action: NLAction;
  target: NLFilterSpec;
  params: NLPlanParams;
  /** One short sentence describing what this does, in the recruiter's own words — shown in the chip. */
  explanation: string;
}

export interface NLPreviewMatch {
  id: Id;
  name: string;
}

export interface NLPreview {
  plan: NLPlan;
  matches: NLPreviewMatch[];
  resolved: { until?: ISODate };
  /** Council amendment: plans touching more than 10 people must show the name list before Apply. */
  overReach: boolean;
}

const OVERREACH_THRESHOLD = 10;

// -------------------------------------------------------------------------------- date rules

const SEASON_START_MONTH: Record<string, number> = { spring: 2, summer: 5, fall: 8, autumn: 8, winter: 11 };
const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

// All date math happens in UTC — ISODate is always UTC-normalized (see the `ISODate` doc
// comment in src/types/index.ts) and resolving "spring" against the *local* calendar would make
// the exact same command resolve to a different date depending on which timezone HQ runs in.
function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}
function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
}
/** The next 1st-of-`month` (UTC) strictly after `now` (this year if it hasn't happened yet, else next year). */
function nextOccurrenceOfMonth(now: Date, month: number): Date {
  const year = now.getUTCFullYear();
  const candidate = new Date(Date.UTC(year, month, 1));
  return candidate > startOfDayUTC(now) ? candidate : new Date(Date.UTC(year + 1, month, 1));
}

/**
 * Explicit, testable relative-date rules — BLUEPRINT-v2.1.md's council amendment: "relative
 * dates resolved in code with explicit rules, never by the model." Returns undefined for a
 * phrase it doesn't recognise, so the caller can ask the recruiter to pick a date instead of
 * silently guessing.
 */
export function resolveRelativeDate(phraseRaw: string, now: Date = new Date()): ISODate | undefined {
  const phrase = phraseRaw.trim().toLowerCase();
  if (!phrase) return undefined;

  // Already a concrete date (the model is allowed to pass one through verbatim if the user
  // typed one, e.g. "until March 1 2027" or "until 2027-03-01") — never re-interpreted.
  if (/\d{4}/.test(phraseRaw)) {
    const direct = new Date(phraseRaw);
    if (!Number.isNaN(direct.getTime())) return direct.toISOString();
  }

  if (phrase === 'today') return startOfDayUTC(now).toISOString();
  if (phrase === 'tomorrow') return addDays(now, 1).toISOString();
  if (phrase === 'next week') return addDays(now, 7).toISOString();
  if (phrase === 'next month') return addMonths(now, 1).toISOString();

  let m = /^in\s+(\d+)\s*day/.exec(phrase);
  if (m) return addDays(now, Number(m[1])).toISOString();
  m = /^in\s+(\d+)\s*week/.exec(phrase);
  if (m) return addDays(now, Number(m[1]) * 7).toISOString();
  m = /^in\s+(\d+)\s*month/.exec(phrase);
  if (m) return addMonths(now, Number(m[1])).toISOString();

  const season = Object.keys(SEASON_START_MONTH).find(s => phrase.includes(s));
  if (season) return nextOccurrenceOfMonth(now, SEASON_START_MONTH[season]).toISOString();

  const monthIdx = MONTH_NAMES.findIndex(mn => phrase.includes(mn));
  if (monthIdx !== -1) return nextOccurrenceOfMonth(now, monthIdx).toISOString();

  return undefined;
}

// -------------------------------------------------------------------------------- get a plan

export class NLCommandError extends Error {}

/** Calls api/nl-command.ts. Throws NLCommandError on any failure — callers decide the fallback. */
export async function getPlan(text: string): Promise<NLPlan> {
  const res = await fetch('/api/nl-command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new NLCommandError(body?.error ?? `Could not understand that command (${res.status}).`);
  }
  const data = await res.json();
  if (!data?.plan) throw new NLCommandError('The AI returned an empty plan.');
  return data.plan as NLPlan;
}

// -------------------------------------------------------------------------- resolve → Dexie

function textMatches(c: Candidate, needle: string): boolean {
  const hay = `${c.name} ${c.currentTitle} ${c.currentEmployer} ${c.skills.join(' ')}`.toLowerCase();
  return hay.includes(needle.toLowerCase());
}

function matchesSpec(c: Candidate, f: NLFilterSpec): boolean {
  if (f.names?.length) {
    const needles = f.names.map(n => n.toLowerCase().trim()).filter(Boolean);
    if (needles.length && !needles.some(n => c.name.toLowerCase().includes(n))) return false;
  }
  if (f.status?.length && !f.status.includes(c.status)) return false;
  if (f.tag && !c.tags.some(t => t.toLowerCase() === f.tag!.toLowerCase())) return false;
  if (f.location && !c.location.toLowerCase().includes(f.location.toLowerCase())) return false;
  if (f.seniority?.length && !f.seniority.includes(c.seniority)) return false;
  if (f.skillsInclude?.length) {
    const have = new Set(c.skills.map(s => s.toLowerCase()));
    if (!f.skillsInclude.every(s => have.has(s.toLowerCase()))) return false;
  }
  if (f.compMaxUSD !== undefined) {
    const comp = c.compExpectation ?? c.compAtLastProcess;
    if (comp && comp.currency === 'USD' && comp.amount > f.compMaxUSD) return false;
  }
  if (f.warmthMinDays !== undefined || f.warmthMaxDays !== undefined) {
    const days = dataService.computeWarmthDays(c.warmthAt);
    if (f.warmthMinDays !== undefined && days < f.warmthMinDays) return false;
    if (f.warmthMaxDays !== undefined && days > f.warmthMaxDays) return false;
  }
  if (f.text && !textMatches(c, f.text)) return false;
  return true;
}

/** Resolves a filter spec against a live candidate/match set. Pure — no I/O of its own. */
export function resolveFilter(filter: NLFilterSpec, candidates: Candidate[], matches: Match[] = []): Candidate[] {
  if (!filter.boardStage) return candidates.filter(c => matchesSpec(c, filter));
  const stageByCandidate = new Set(matches.filter(m => m.stage === filter.boardStage).map(m => m.candidateId));
  return candidates.filter(c => stageByCandidate.has(c.id) && matchesSpec(c, filter));
}

/** Gets a plan (falling back to a plain-search plan on any AI failure — DESIGN-v2.1.md §C.2), then resolves it against the live bench. */
export async function preview(text: string): Promise<NLPreview> {
  let plan: NLPlan;
  try {
    plan = await getPlan(text);
  } catch {
    plan = { action: 'filter', target: { text }, params: {}, explanation: `Search for "${text}"` };
  }

  const [candidates, matches] = await Promise.all([
    dataService.list('candidates'),
    dataService.list('matches'),
  ]);
  const resolvedCandidates = resolveFilter(plan.target, candidates, matches);
  const resolvedUntil = plan.params.until ? resolveRelativeDate(plan.params.until) : undefined;

  return {
    plan,
    matches: resolvedCandidates.map(c => ({ id: c.id, name: c.name })),
    resolved: resolvedUntil ? { until: resolvedUntil } : {},
    overReach: resolvedCandidates.length > OVERREACH_THRESHOLD,
  };
}

// --------------------------------------------------------------------------------------- apply

export interface NLApplyOptions {
  /** Required for `move_stage` — which role's board this command acts on. */
  roleId?: Id;
  /** The original text the recruiter typed, for the activity-log audit trail. */
  originalText?: string;
}

export interface NLApplyResult {
  affected: number;
  /** Re-runs the single stored undo entry for this apply — a no-op once already undone. */
  undo: () => Promise<void>;
}

interface UndoEntry {
  description: string;
  run: () => Promise<void>;
}

/** BLUEPRINT-v2.1.md: "records ONE undo entry ... with an undo()" — a single in-memory slot, overwritten by the next apply. */
let lastUndo: UndoEntry | null = null;

async function auditLog(ids: Id[], summary: string): Promise<void> {
  await Promise.all(ids.map(id => dataService.logActivity({ candidateId: id, type: 'nl_command', body: summary, actor: 'owner' })));
}

/**
 * Writes `plan` through `dataService` for the given resolved candidate ids, and records one
 * undo entry. Never called from the Enter that submitted the command — B2's palette requires a
 * separate Apply keypress (council amendment).
 */
export async function apply(plan: NLPlan, ids: Id[], opts: NLApplyOptions = {}): Promise<NLApplyResult> {
  if (ids.length === 0) {
    lastUndo = null;
    return { affected: 0, undo: async () => {} };
  }

  const now = () => new Date().toISOString();
  const summary = `NL command${opts.originalText ? ` — "${opts.originalText}"` : ''}: ${plan.explanation}`;

  switch (plan.action) {
    case 'snooze': {
      const untilISO = plan.params.until ? resolveRelativeDate(plan.params.until) : undefined;
      if (!untilISO) throw new NLCommandError('Could not work out a date for "until" — try a specific date.');
      const before = new Map<Id, ISODate | undefined>();
      for (const id of ids) {
        const candidate = await dataService.get('candidates', id);
        if (!candidate) continue;
        before.set(id, candidate.snoozeUntil);
        await dataService.put('candidates', { ...candidate, snoozeUntil: untilISO, updatedAt: now() });
      }
      await auditLog(ids, summary);
      lastUndo = {
        description: summary,
        run: async () => {
          for (const [id, prev] of before) {
            const c = await dataService.get('candidates', id);
            if (c) await dataService.put('candidates', { ...c, snoozeUntil: prev, updatedAt: now() });
          }
        },
      };
      break;
    }

    case 'status': {
      const status = plan.params.status;
      if (!status) throw new NLCommandError('No target status named in this command.');
      const before = new Map<Id, { status: CandidateStatus; statusReason?: string; snoozeUntil?: ISODate }>();
      for (const id of ids) {
        const candidate = await dataService.get('candidates', id);
        if (!candidate) continue;
        before.set(id, { status: candidate.status, statusReason: candidate.statusReason, snoozeUntil: candidate.snoozeUntil });
        await dataService.applyStatus(id, status, plan.explanation);
      }
      await auditLog(ids, summary);
      lastUndo = {
        description: summary,
        run: async () => {
          for (const [id, prev] of before) {
            await dataService.applyStatus(id, prev.status, 'Undo of NL command', prev.snoozeUntil);
          }
        },
      };
      break;
    }

    case 'tag': {
      const tag = plan.params.tag;
      if (!tag) throw new NLCommandError('No tag named in this command.');
      const before = new Map<Id, string[]>();
      for (const id of ids) {
        const candidate = await dataService.get('candidates', id);
        if (!candidate) continue;
        before.set(id, candidate.tags);
        if (candidate.tags.includes(tag)) continue;
        await dataService.put('candidates', { ...candidate, tags: [...candidate.tags, tag], updatedAt: now() });
      }
      await auditLog(ids, summary);
      lastUndo = {
        description: summary,
        run: async () => {
          for (const [id, prevTags] of before) {
            const c = await dataService.get('candidates', id);
            if (c) await dataService.put('candidates', { ...c, tags: prevTags, updatedAt: now() });
          }
        },
      };
      break;
    }

    case 'move_stage': {
      const stage = plan.params.stage;
      if (!stage) throw new NLCommandError('No board stage named in this command.');
      if (!opts.roleId) throw new NLCommandError('Pick a role first — moving board stage needs to know which one.');
      const matches = await dataService.getMatchesForRole(opts.roleId);
      const matchByCandidate = new Map(matches.map(m => [m.candidateId, m]));
      const before = new Map<Id, Match['stage']>();
      for (const id of ids) {
        const match = matchByCandidate.get(id);
        if (!match) continue;
        before.set(match.id, match.stage);
        await dataService.setStage(match.id, stage, plan.explanation);
      }
      await auditLog(ids, summary);
      lastUndo = {
        description: summary,
        run: async () => {
          for (const [matchId, prevStage] of before) {
            await dataService.setStage(matchId, prevStage, 'Undo of NL command');
          }
        },
      };
      break;
    }

    case 'compose':
    case 'filter':
    default:
      // Neither mutates anything — 'compose' hands the resolved ids + tone to B2's composer,
      // 'filter' is a pure search. Nothing to log, nothing to undo.
      lastUndo = null;
      break;
  }

  return {
    affected: ids.length,
    undo: async () => {
      if (lastUndo) { await lastUndo.run(); lastUndo = null; }
    },
  };
}

/** Re-runs the single stored undo entry, if any. Returns false when there is nothing to undo. */
export async function undo(): Promise<boolean> {
  if (!lastUndo) return false;
  await lastUndo.run();
  lastUndo = null;
  return true;
}

export function hasUndo(): boolean {
  return lastUndo !== null;
}

export const nlCommand = { getPlan, preview, resolveFilter, resolveRelativeDate, apply, undo, hasUndo };

export default nlCommand;
