/**
 * FROZEN CONTRACT — Silver Medalist HQ v2
 *
 * Every entity from BLUEPRINT-v2.md's data model, plus the AI request/response shapes
 * used by api/score, api/outreach, api/ingest-jd and api/parse-resume.
 *
 * B2 (bench/map/dossier/outreach) and B3 (shell/board/today/import/settings) code against
 * this file and against `dataService` in src/services/dataService.ts. Treat this as an API
 * contract, not a scratchpad — a shape change here is a breaking change for every consumer.
 */

export type Id = string;
/** ISO 8601 date or date-time string, always UTC-normalized (`new Date().toISOString()`). */
export type ISODate = string;

// ==================================================================== candidates

export type Seniority = 'junior' | 'mid' | 'senior' | 'staff' | 'principal' | 'exec';

export type CandidateStatus =
  | 'active'            // eligible for scoring, lives on the bench
  | 'silent'            // went quiet after outreach — still visible, de-prioritized in ranking
  | 'took_role'         // placed elsewhere; snoozed until a resurface date
  | 'do_not_reapproach' // values/HM/candidate-requested — never auto-resurfaces, never in Today
  | 'opted_out';        // erasure / consent withdrawal — excluded from scoring AND from AI prompts

/** A comp figure anchored to the date it was true — a 2024 number is a lie in 2026. */
export interface CompSnapshot {
  amount: number;
  currency: string;
  date: ISODate;
}

export interface Note {
  id: Id;
  body: string;
  at: ISODate;
  actor: string;
}

export interface Candidate {
  id: Id;
  name: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  location: string;
  /** expected on-site days/week, if known */
  onsiteDays?: number;
  currentEmployer: string;
  currentTitle: string;
  /** ISO date they started their current role — the strongest timing signal we have */
  tenureStart: ISODate;
  seniority: Seniority;
  /**
   * Computed hint only — e.g. "Staff-ready: 3y since last Senior process". Never persisted;
   * populated at read time by `computeSeniorityDrift`. Present on the type so UI code can
   * treat it as first-class without an extra lookup.
   */
  seniorityDriftHint?: string;
  skills: string[];
  /** what they were worth the last time we ran a process on them */
  compAtLastProcess?: CompSnapshot;
  /** what they say they want now */
  compExpectation?: CompSnapshot;
  noticePeriodDays?: number;
  visaNeed?: boolean;
  tags: string[];
  status: CandidateStatus;
  /** required alongside any non-'active' status — the recorded reason, in the recruiter's words */
  statusReason?: string;
  /** took_role: when to resurface (default +18 months from the process date) */
  snoozeUntil?: ISODate;
  /** last touch — the input to warmth decay */
  warmthAt: ISODate;
  /** consent / source-of-record date, for GDPR */
  sourceDate: ISODate;
  notes: Note[];
  createdAt: ISODate;
  updatedAt: ISODate;
}

// ========================================================================== roles

export type RoleStatus = 'open' | 'filled' | 'paused';

export interface CompBand {
  min: number;
  max: number;
  currency: string;
}

export interface RoleUrgency {
  score: 1 | 2 | 3 | 4 | 5;
  reasons: string[];
}

export interface Role {
  id: Id;
  title: string;
  team?: string;
  level: string;
  location: string;
  onsiteDays?: number;
  compBand: CompBand;
  mustHaves: string[];
  niceToHaves: string[];
  dealbreakers: string[];
  urgency: RoleUrgency;
  status: RoleStatus;
  hiringManager?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

// ===================================================================== processes

export type FinishedAs = 'second' | 'final' | 'shortlist' | 'offer_declined' | 'placed';

export interface Process {
  id: Id;
  candidateId: Id;
  roleId: Id;
  date: ISODate;
  finishedAs: FinishedAs;
  /** the thing that must survive — why they didn't get it, in the recruiter's own words */
  reason: string;
  /** who or what beat them — a name or a req id */
  lostTo?: string;
  interviewers?: string[];
  scorecard?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

// ========================================================================= matches

export interface MatchSubScores {
  skills: number;
  seniority: number;
  comp: number;
  timing: number;
}

export interface MatchOverride {
  score: number;
  reason: string;
  at: ISODate;
}

/** Pipeline board columns — a match only enters the board once a recruiter acts on it. */
export type BoardStage =
  | 'warm' | 'reached_out' | 'replied' | 'interviewing' | 'offer' | 'placed' | 'passed';

export interface Match {
  id: Id;
  roleId: Id;
  candidateId: Id;
  score: number;
  sub: MatchSubScores;
  why: string;
  flags: string[];
  /** a human override wins display but the underlying AI score + reason are kept for audit */
  override?: MatchOverride;
  /** hash(role fingerprint + this candidate's fingerprint) — identical hash ⇒ zero network */
  hash: string;
  /** true when the deterministic keyword-fit fallback produced this row, not the LLM */
  fallback?: boolean;
  stage: BoardStage;
  stageUpdatedAt: ISODate;
  updatedAt: ISODate;
}

// ======================================================================= activities

export type ActivityType = 'touch' | 'email_copied' | 'note' | 'stage' | 'status' | 'reminder' | 'import';

export interface Activity {
  id: Id;
  candidateId: Id;
  roleId?: Id;
  type: ActivityType;
  at: ISODate;
  body: string;
  actor: string;
}

// ======================================================================= sequences

export type Channel = 'email' | 'linkedin' | 'call';

export interface SequenceStep {
  /** offset from Day 0 — 0, 3, 7 by convention */
  day: number;
  channel: Channel;
  body: string;
  doneAt?: ISODate;
}

export interface Sequence {
  id: Id;
  candidateId: Id;
  roleId: Id;
  steps: SequenceStep[];
  nextDueAt?: ISODate;
  createdAt: ISODate;
  updatedAt: ISODate;
}

// ========================================================================= settings

export interface SettingRecord {
  key: string;
  value: unknown;
}

export const SETTINGS_KEYS = {
  theme: 'theme',
  owner: 'owner',
  sampleFlag: 'sampleFlag',
  migratedV2: 'migratedV2',
  driveSnapshotAt: 'driveSnapshotAt',
  driveConflict: 'driveConflict',
} as const;
export type SettingsKey = typeof SETTINGS_KEYS[keyof typeof SETTINGS_KEYS];

// ====================================================================== today queue

export type TodayActionKind = 'reach_out' | 'follow_up' | 'recheck_comp' | 'resurface';

export interface TodayQueueAction {
  label: 'Reach out' | 'Follow up' | 'Re-check comp' | 'Resurface';
  kind: TodayActionKind;
}

export interface TodayQueueItem {
  candidate: Candidate;
  reason: string;
  action: TodayQueueAction;
  warmthDays: number;
  /** Set when the item came from the selected role's ranking — drives the card's fit ring. */
  roleId?: Id;
  /** 0–100 fit for `roleId`, when this item is a top-fit suggestion for that role. */
  fit?: number;
}

// =================================================================== AI: /api/score

export interface ScoreCandidateInput {
  id: Id;
  name: string;
  skills: string[];
  seniority: Seniority;
  currentTitle: string;
  currentEmployer: string;
  tenureStart: ISODate;
  compExpectation?: CompSnapshot;
  compAtLastProcess?: CompSnapshot;
  location: string;
  status: CandidateStatus;
  snoozeUntil?: ISODate;
  warmthAt: ISODate;
  /** most recent process.reason for this candidate, if any — grounds the AI's "why" line */
  priorReason?: string;
}

export interface ScoreRoleInput {
  id: Id;
  title: string;
  level: string;
  location: string;
  compBand: CompBand;
  mustHaves: string[];
  niceToHaves: string[];
  dealbreakers: string[];
}

/** Candidates must be pre-filtered to status === 'active' by the caller and capped at 60. */
export interface ScoreRequestBody {
  role: ScoreRoleInput;
  candidates: ScoreCandidateInput[];
}

export interface ScoredRow {
  candidateId: Id;
  score: number;
  sub: MatchSubScores;
  why: string;
  flags: string[];
  /** true when this specific row came from the deterministic keyword-fit fallback */
  fallback?: boolean;
}

export interface ScoreResponseBody {
  roleId: Id;
  scored: ScoredRow[];
  /** true when the LLM call failed entirely and every row is `fallback: true` */
  fallback: boolean;
  /** hash(role fingerprint + sorted candidate fingerprints) — cache this on the client */
  hash: string;
}

// ================================================================= AI: /api/outreach

export interface OutreachRequestBody {
  candidateName: string;
  roleTitle: string;
  tone: 'warm' | 'direct' | 'short';
  /** the process reason / why-now context — never invent facts beyond this */
  reason: string;
  candidateNotes?: string;
  sequenceStep?: 0 | 3 | 7;
}

// ================================================================ AI: /api/ingest-jd

export interface IngestJdRequestBody {
  text: string;
}

export type IngestJdResponseBody = Partial<Omit<Role, 'id' | 'createdAt' | 'updatedAt'>> & { title: string };

// =============================================================== AI: /api/parse-resume

export interface ParseResumeRequestBody {
  base64: string;
  mimeType?: string;
  filename?: string;
}

export type ParseResumeResponseBody =
  Partial<Omit<Candidate, 'id' | 'createdAt' | 'updatedAt' | 'notes'>> & { name: string };
