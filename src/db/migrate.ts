import type { SilverMedalistDB } from './schema';
import type { Candidate, Role, Match, CandidateStatus } from '../types';
import { ulid } from '../lib/ulid';

const JOBS_KEY = 'sm_jobs';
const CANDIDATES_KEY = 'sm_candidates';
const MATCHES_KEY = 'sm_matches';
export const MIGRATED_SETTING_KEY = 'migratedV2';

/** The v1 shapes, kept only here so the one-time migration can read them. v1's src/types.ts
 *  is gone — this is deliberately a loose/partial shape, not a full re-declaration. */
interface LegacyJob {
  job_id: string;
  title: string;
  level?: string;
  location?: string;
  remote_policy?: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  comp_range?: { min: number | 'unknown'; max: number | 'unknown'; currency: string | 'unknown' };
  must_haves?: string[];
  dealbreakers?: string[];
  urgency?: { score_1_to_5?: number; reasons?: string[] };
  recruiter_owner?: { name?: string };
}

interface LegacyCandidate {
  candidate_id: string;
  name: string;
  current_stage?: string;
  availability?: { status?: 'active' | 'passive' | 'unknown' };
  locations?: string[];
  comp_expectation?: { min: number | 'unknown'; max: number | 'unknown'; currency: string | 'unknown' };
  skills?: string[];
  silver_medalist?: { why_not_selected?: string[]; strengths?: string[] };
  dealbreakers?: string[];
}

interface LegacyMatch {
  job_id: string;
  candidate_id: string;
  match_score: number;
  redeployment_strategy?: string;
  risk_heatmap?: { tech: number; culture: number; comp: number; timing: number };
}

interface LegacyMatchResponse {
  matches?: LegacyMatch[];
}

function readLegacyJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

const REMOTE_TO_ONSITE_DAYS: Record<string, number | undefined> = {
  remote: 0, hybrid: 3, onsite: 5, unknown: undefined,
};

function legacyStatusToV2(status: string | undefined): CandidateStatus {
  if (status === 'passive') return 'silent';
  return 'active';
}

function legacyJobToRole(j: LegacyJob, now: string): Role {
  const min = typeof j.comp_range?.min === 'number' ? j.comp_range.min : 0;
  const max = typeof j.comp_range?.max === 'number' ? j.comp_range.max : 0;
  const currency = typeof j.comp_range?.currency === 'string' && j.comp_range.currency !== 'unknown'
    ? j.comp_range.currency : 'USD';
  return {
    id: j.job_id || ulid(),
    title: j.title || 'Untitled role',
    level: j.level || 'unspecified',
    location: j.location || 'unspecified',
    onsiteDays: j.remote_policy ? REMOTE_TO_ONSITE_DAYS[j.remote_policy] : undefined,
    compBand: { min, max, currency },
    mustHaves: j.must_haves ?? [],
    niceToHaves: [],
    dealbreakers: j.dealbreakers ?? [],
    urgency: {
      score: (Math.min(5, Math.max(1, j.urgency?.score_1_to_5 ?? 3)) as 1 | 2 | 3 | 4 | 5),
      reasons: j.urgency?.reasons ?? [],
    },
    status: 'open',
    hiringManager: j.recruiter_owner?.name,
    createdAt: now,
    updatedAt: now,
  };
}

function legacyCandidateToCandidate(c: LegacyCandidate, now: string): Candidate {
  const min = typeof c.comp_expectation?.min === 'number' ? c.comp_expectation.min : undefined;
  const max = typeof c.comp_expectation?.max === 'number' ? c.comp_expectation.max : undefined;
  const currency = typeof c.comp_expectation?.currency === 'string' && c.comp_expectation.currency !== 'unknown'
    ? c.comp_expectation.currency : 'USD';
  const context = [
    ...(c.silver_medalist?.why_not_selected ?? []),
    ...(c.silver_medalist?.strengths ?? []),
  ].join('; ');

  return {
    id: c.candidate_id || ulid(),
    name: c.name || 'Unnamed candidate',
    location: c.locations?.[0] ?? 'unspecified',
    currentEmployer: 'Unknown (migrated from v1)',
    currentTitle: c.current_stage || 'Unknown (migrated from v1)',
    tenureStart: now,
    seniority: 'mid',
    skills: c.skills ?? [],
    compExpectation: max !== undefined ? { amount: max, currency, date: now } : undefined,
    tags: ['migrated-v1'],
    status: legacyStatusToV2(c.availability?.status),
    warmthAt: now,
    sourceDate: now,
    notes: context ? [{ id: ulid(), body: `Migrated from v1: ${context}`, at: now, actor: 'migration' }] : [],
    createdAt: now,
    updatedAt: now,
  };
}

function legacyMatchToMatch(m: LegacyMatch, now: string): Match {
  const risk = m.risk_heatmap ?? { tech: 50, culture: 50, comp: 50, timing: 50 };
  return {
    id: ulid(),
    roleId: m.job_id,
    candidateId: m.candidate_id,
    score: m.match_score ?? 0,
    // Best-effort mapping — v1 had no skills/seniority/comp/timing sub-scores, only a risk
    // heatmap along different axes. tech -> skills and culture -> seniority is an approximation.
    sub: { skills: risk.tech, seniority: risk.culture, comp: risk.comp, timing: risk.timing },
    why: m.redeployment_strategy || 'Migrated from a v1 match — no structured reason recorded.',
    flags: [],
    hash: `legacy:${m.job_id}:${m.candidate_id}`,
    fallback: true,
    stage: 'warm',
    stageUpdatedAt: now,
    updatedAt: now,
  };
}

/**
 * One-time import of v1's localStorage data (sm_jobs/sm_candidates/sm_matches) into Dexie.
 * Idempotent: checks + sets settings.migratedV2 so it only ever runs once per browser, and
 * never throws — a malformed legacy blob just means nothing to migrate.
 */
export async function migrateLegacyLocalStorage(db: SilverMedalistDB): Promise<{ migrated: boolean; counts: { roles: number; candidates: number; matches: number } }> {
  const already = await db.settings.get(MIGRATED_SETTING_KEY);
  if (already?.value === true) return { migrated: false, counts: { roles: 0, candidates: 0, matches: 0 } };

  const now = new Date().toISOString();
  const counts = { roles: 0, candidates: 0, matches: 0 };

  try {
    const legacyJobs = readLegacyJSON<LegacyJob[]>(JOBS_KEY) ?? [];
    const legacyCandidates = readLegacyJSON<LegacyCandidate[]>(CANDIDATES_KEY) ?? [];
    const legacyMatchResponse = readLegacyJSON<LegacyMatchResponse>(MATCHES_KEY);

    if (legacyJobs.length) {
      const roles = legacyJobs.map(j => legacyJobToRole(j, now));
      await db.roles.bulkPut(roles);
      counts.roles = roles.length;
    }

    if (legacyCandidates.length) {
      const candidates = legacyCandidates.map(c => legacyCandidateToCandidate(c, now));
      await db.candidates.bulkPut(candidates);
      counts.candidates = candidates.length;
    }

    const legacyMatches = legacyMatchResponse?.matches ?? [];
    if (legacyMatches.length) {
      // Only keep matches whose role+candidate actually made it across.
      const roleIds = new Set(legacyJobs.map(j => j.job_id));
      const candidateIds = new Set(legacyCandidates.map(c => c.candidate_id));
      const matches = legacyMatches
        .filter(m => roleIds.has(m.job_id) && candidateIds.has(m.candidate_id))
        .map(m => legacyMatchToMatch(m, now));
      if (matches.length) {
        await db.matches.bulkPut(matches);
        counts.matches = matches.length;
      }
    }
  } catch (e) {
    console.warn('[migrate] legacy localStorage import failed, skipping:', e);
  }

  await db.settings.put({ key: MIGRATED_SETTING_KEY, value: true });
  return { migrated: true, counts };
}
