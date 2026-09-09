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
  /** v3 — where this person came into the bench from, and the way back to the original. */
  source?: PersonSource;
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

export type ActivityType =
  | 'touch' | 'email_copied' | 'note' | 'stage' | 'status' | 'reminder' | 'import'
  // v2.1 — B1 integration (Outlook + NL command): a real Outlook draft was created / sent,
  // replyWatcher.ts detected an inbound reply, or nlCommand.ts applied a natural-language plan.
  | 'email_drafted' | 'email_sent' | 'reply_detected' | 'nl_command';

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
  // v2.1 — B1 integration
  /** true once the user has completed Microsoft sign-in at least once (MSAL owns the actual token/account). */
  msConnected: 'msConnected',
  /** explicit opt-in before outlookService.sendDraft() is allowed to actually send, not just draft. */
  outlookAllowSend: 'outlookAllowSend',
  /** briefFacts.ts / api/brief.ts cache, keyed by (day, benchHash) inside the stored value. */
  briefCache: 'briefCache',
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

// ==================================================================================== v3
//
// FROZEN CONTRACT — Silver Medalist HQ v3 (Sources · Team · the Paper shell).
// Everything below is additive: no v2 shape changed, so every v2.1 service keeps working.
// The v3 builders (import engine, Sources, People, Team) code against these names.

/** Where a person came into the bench from. One badge per person, forever. */
export type SourceKind =
  | 'sample'      // the seeded demo bench
  | 'manual'      // typed in by hand
  | 'resume'      // a dropped PDF/DOCX
  | 'csv'         // a generic spreadsheet
  | 'ats'         // Greenhouse / Lever / Ashby / Workable / Teamtailor / Bullhorn export
  | 'linkedin'    // a LinkedIn Recruiter / Sales Navigator export
  | 'jobboard'    // LinkedIn Jobs / Indeed / Welcome to the Jungle export
  | 'slack'       // a Slack channel export zip
  | 'outlook'     // an Outlook mailbox scan
  | 'drive'       // a watched Google Drive folder
  | 'capture'     // the Capture bookmarklet
  | 'link'        // the public add-to-bench link
  | 'teammate';   // added by a teammate inside the app

export interface PersonSource {
  kind: SourceKind;
  /** Human label shown on the card: "Greenhouse export", "LinkedIn capture", "added by Dana". */
  label: string;
  /** Back to the original: a profile URL, a file name, a mail deep link. */
  url?: string;
  /** The import batch that brought them in — the handle undo needs. */
  importId?: Id;
  /** Display name of whoever added them. */
  addedBy?: string;
  at: ISODate;
}

/** Every field a column can map to. `skip` means "ignore this column". */
export type ImportFieldKey =
  | 'name' | 'firstName' | 'lastName' | 'email' | 'phone' | 'linkedin' | 'location'
  | 'currentEmployer' | 'currentTitle' | 'seniority' | 'skills' | 'tenureStart'
  | 'compExpectation' | 'compAtLastProcess' | 'noticePeriodDays' | 'tags' | 'notes'
  | 'status' | 'statusReason'
  | 'processRole' | 'processStage' | 'processReason' | 'processDate' | 'processLostTo'
  | 'sourceUrl' | 'skip';

export interface ColumnMapping {
  /** The header as it appears in the file. */
  column: string;
  field: ImportFieldKey;
  /** `exact` = a known header we match by rule; `guess` = the AI (or fuzzy) proposed it. */
  confidence: 'exact' | 'guess';
  /** First non-empty value in that column, shown next to the mapping. */
  sample?: string;
}

/** What a dedupe match was made on — the recruiter seat's trust ladder. */
export type DedupeKey = 'email' | 'linkedin' | 'phone' | 'name+employer';

export interface StagedPerson {
  /** Stable within one plan; used as a React key and as the decision handle. */
  key: string;
  /** A fully-formed candidate, ids already assigned. */
  draft: Candidate;
  /** The candidacy record this row describes, when the file carried one. */
  process?: Omit<Process, 'id' | 'candidateId' | 'roleId' | 'createdAt' | 'updatedAt'> & { roleTitle?: string };
  /** Set when this row looks like somebody already on the bench. */
  existing?: Candidate;
  matchOn?: DedupeKey;
  /** `exact` merges by default; `probable` never auto-merges (three Sarah Chens). */
  confidence?: 'exact' | 'probable';
  /** One sentence saying why we think they are the same person, in plain words. */
  explain?: string;
  /** What the merge would actually change on the existing record. */
  changedFields?: string[];
  decision: 'create' | 'merge' | 'skip';
  warnings?: string[];
}

export interface ImportPlan {
  id: Id;
  kind: SourceKind;
  /** "Greenhouse export", "12 résumés", "#referrals Slack export". */
  sourceLabel: string;
  filename?: string;
  rowCount: number;
  /** Present for tabular imports; absent for résumé/capture imports. */
  columns?: ColumnMapping[];
  people: StagedPerson[];
  /** Honest notes shown above the preview ("Greenhouse exports carry no résumés"). */
  notes: string[];
  /** True when the column mapping came from the AI rather than known-header rules. */
  mappedByAI?: boolean;
}

/** One committed import, kept so it can be undone. */
export interface ImportBatch {
  id: Id;
  at: ISODate;
  kind: SourceKind;
  sourceLabel: string;
  filename?: string;
  rowCount: number;
  createdIds: Id[];
  mergedIds: Id[];
  /** Pre-merge copies of every record we touched — undo restores these verbatim. */
  before: Record<Id, Candidate>;
  /** Process rows this import created, so undo can remove them too. */
  processIds: Id[];
  actor: string;
  undone?: boolean;
}

// ------------------------------------------------------------------------------- team

export type TeamRole = 'owner' | 'editor' | 'contributor';

export interface TeamMember {
  id: Id;
  name: string;
  email: string;
  role: TeamRole;
  addedAt: ISODate;
  lastActiveAt?: ISODate;
  /** How many people they have put on the bench — the attribution line in the brief. */
  addedCount?: number;
  /** Seeded sample teammate, clearly labelled in local mode. */
  sample?: boolean;
}

export type SubmissionState = 'waiting' | 'accepted' | 'rejected';

/** Something waiting in the Inbox — never on the bench until a human accepts it. */
export interface Submission {
  id: Id;
  at: ISODate;
  via: 'link' | 'capture' | 'outlook' | 'drive' | 'teammate' | 'resume';
  /** Who sent it: a teammate's name, or the name typed into the public form. */
  addedBy: string;
  /** "why they were strong", in the sender's words. */
  note?: string;
  /** Which role they were suggested for, as free text. */
  roleHint?: string;
  draft: Partial<Candidate> & { name: string };
  /** The original text/URL we structured this from. */
  raw?: string;
  sourceUrl?: string;
  state: SubmissionState;
  sample?: boolean;
}

/** What the Capture bookmarklet posts into /capture, as URL params or a POST body. */
export interface CaptureDraft {
  name?: string;
  headline?: string;
  location?: string;
  url?: string;
  /** The visible text of the page, trimmed — we structure this with the AI ladder. */
  text?: string;
  site?: string;
}

export const V3_SETTINGS_KEYS = {
  /** The 8-stop tour: set once it has been finished or skipped. */
  tourDone: 'v3TourDone',
  /** Public add-to-bench link token + expiry. */
  addLink: 'v3AddLink',
  /** Which people-list layout the user last chose: 'cards' | 'list' | 'target'. */
  peopleLayout: 'v3PeopleLayout',
  /** Drive folder id being watched for résumés. */
  driveResumeFolder: 'v3DriveResumeFolder',
} as const;
