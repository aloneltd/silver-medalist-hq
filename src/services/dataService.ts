import type { Table } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { migrateLegacyLocalStorage } from '../db/migrate';
import { buildSampleBench } from '../lib/sampleBench';
import { ulid } from '../lib/ulid';
import { scoreFingerprint } from '../lib/scoreFingerprint';
import { driveService, type DriveSnapshot } from './driveService';
import {
  SETTINGS_KEYS,
  type Candidate, type Role, type Process, type Match, type Activity, type Sequence,
  type CandidateStatus, type TodayQueueItem, type ISODate, type Id, type MatchOverride,
  type ScoredRow, type ScoreCandidateInput, type ScoreRoleInput, type Seniority,
} from '../types';

// ------------------------------------------------------------------------ table plumbing

interface TableMap {
  candidates: Candidate;
  roles: Role;
  processes: Process;
  matches: Match;
  activities: Activity;
  sequences: Sequence;
}
type TableName = keyof TableMap;

function table<K extends TableName>(name: K): Table<TableMap[K], string> {
  return db[name] as unknown as Table<TableMap[K], string>;
}

function nowISO(): ISODate {
  return new Date().toISOString();
}

const STALE_DAYS = 14;
const RECHECK_COMP_DAYS = 365;
const DRIVE_DEBOUNCE_MS = 3000;
const DEFAULT_RESURFACE_MONTHS = 18;

// ---------------------------------------------------------------------------- generic CRUD

async function list<K extends TableName>(name: K): Promise<TableMap[K][]> {
  return table(name).toArray();
}

async function get<K extends TableName>(name: K, id: Id): Promise<TableMap[K] | undefined> {
  return table(name).get(id);
}

/** Upsert-by-id. Callers are responsible for stamping createdAt/updatedAt before calling. */
async function put<K extends TableName>(name: K, record: TableMap[K]): Promise<Id> {
  await table(name).put(record);
  scheduleDriveSnapshot();
  return (record as { id: Id }).id;
}

async function bulkPut<K extends TableName>(name: K, records: TableMap[K][]): Promise<Id[]> {
  if (!records.length) return [];
  await table(name).bulkPut(records);
  scheduleDriveSnapshot();
  return records.map(r => (r as { id: Id }).id);
}

async function del<K extends TableName>(name: K, id: Id): Promise<void> {
  await table(name).delete(id);
  scheduleDriveSnapshot();
}

// -------------------------------------------------------------------------------- settings

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row ? (row.value as T) : fallback;
}

async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

// ---------------------------------------------------------------------- warmth / seniority

/** Whole days since the given ISO timestamp. Never negative. */
export function computeWarmthDays(warmthAt: ISODate, now: Date = new Date()): number {
  const ms = now.getTime() - new Date(warmthAt).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function daysBetween(a: ISODate, now: Date): number {
  return (now.getTime() - new Date(a).getTime()) / 86_400_000;
}

const SENIORITY_ORDER: Seniority[] = ['junior', 'mid', 'senior', 'staff', 'principal', 'exec'];

/**
 * "A strong Senior in 2024 is a Staff candidate now" — a computed, non-persisted hint. Not a
 * status change, never written to the DB; purely advisory copy for the dossier/bench UI.
 */
export function computeSeniorityDrift(candidate: Candidate, now: Date = new Date()): string | undefined {
  const idx = SENIORITY_ORDER.indexOf(candidate.seniority);
  if (idx === -1 || idx === SENIORITY_ORDER.length - 1) return undefined;
  const monthsTenure = daysBetween(candidate.tenureStart, now) / 30;
  if (monthsTenure < 24) return undefined;
  const nextLevel = SENIORITY_ORDER[idx + 1];
  const confidence = monthsTenure >= 36 ? 'Likely' : 'Possibly';
  return `${confidence} ${nextLevel}-ready now — ${Math.round(monthsTenure)} months since this ${candidate.seniority} process started.`;
}

function attachDrift(c: Candidate): Candidate {
  const hint = computeSeniorityDrift(c);
  return hint ? { ...c, seniorityDriftHint: hint } : c;
}

function defaultResurfaceDate(from: Date = new Date()): ISODate {
  const d = new Date(from);
  d.setMonth(d.getMonth() + DEFAULT_RESURFACE_MONTHS);
  return d.toISOString();
}

// -------------------------------------------------------------------------------- activities

interface LogActivityInput {
  candidateId: Id;
  roleId?: Id;
  type: Activity['type'];
  body: string;
  actor: string;
  at?: ISODate;
}

async function logActivity(entry: LogActivityInput): Promise<Id> {
  const activity: Activity = {
    id: ulid(),
    candidateId: entry.candidateId,
    roleId: entry.roleId,
    type: entry.type,
    at: entry.at ?? nowISO(),
    body: entry.body,
    actor: entry.actor,
  };
  await put('activities', activity);
  return activity.id;
}

// ------------------------------------------------------------------------------ candidates

/** Status changes always log a reason to Activity — BLUEPRINT-v2.md: "status changes ask for the reason". */
async function applyStatus(candidateId: Id, status: CandidateStatus, reason?: string, snoozeUntil?: ISODate): Promise<Candidate> {
  const candidate = await get('candidates', candidateId);
  if (!candidate) throw new Error(`Candidate ${candidateId} not found`);

  const updated: Candidate = {
    ...candidate,
    status,
    statusReason: status === 'active' ? undefined : (reason ?? candidate.statusReason),
    snoozeUntil: status === 'took_role' ? (snoozeUntil ?? defaultResurfaceDate()) : undefined,
    updatedAt: nowISO(),
  };
  await put('candidates', updated);
  await logActivity({
    candidateId,
    type: 'status',
    body: `Status changed to "${status}"${reason ? ` — ${reason}` : ''}`,
    actor: 'owner',
  });
  return updated;
}

// ----------------------------------------------------------------------------------- today

const ACTION: Record<string, TodayQueueItem['action']> = {
  reach_out: { label: 'Reach out', kind: 'reach_out' },
  follow_up: { label: 'Follow up', kind: 'follow_up' },
  recheck_comp: { label: 'Re-check comp', kind: 'recheck_comp' },
  resurface: { label: 'Resurface', kind: 'resurface' },
};

function priorityRank(kind: string): number {
  if (kind === 'resurface') return 0;
  if (kind === 'recheck_comp') return 1;
  return 2;
}

/**
 * Bench-wide "who needs attention today" — deliberately independent of any AI match score,
 * so Today is populated (and testable) with zero network calls. Excludes do_not_reapproach
 * and opted_out entirely; took_role only surfaces once its snooze date has passed.
 */
async function computeTodayQueue(limit = 5): Promise<TodayQueueItem[]> {
  const now = new Date();
  const candidates = await list('candidates');
  const items: TodayQueueItem[] = [];

  for (const raw of candidates) {
    if (raw.status === 'do_not_reapproach' || raw.status === 'opted_out') continue;
    const c = attachDrift(raw);
    const warmthDays = computeWarmthDays(c.warmthAt, now);

    if (c.status === 'took_role') {
      if (c.snoozeUntil && new Date(c.snoozeUntil) <= now) {
        items.push({
          candidate: c,
          reason: `Took another role — resurface window is open${c.statusReason ? ` (${c.statusReason})` : ''}`,
          action: ACTION.resurface,
          warmthDays,
        });
      }
      continue;
    }

    if (c.status === 'silent') {
      if (warmthDays >= STALE_DAYS) {
        items.push({
          candidate: c,
          reason: `Went quiet ${warmthDays} days ago${c.statusReason ? ` — ${c.statusReason}` : ''}`,
          action: ACTION.follow_up,
          warmthDays,
        });
      }
      continue;
    }

    // active — "no comp on file" is not the same as "stale comp on file"; only nag once
    // there's an actual snapshot old enough to distrust.
    const compAgeDays = c.compAtLastProcess ? daysBetween(c.compAtLastProcess.date, now) : null;
    if (compAgeDays !== null && compAgeDays >= RECHECK_COMP_DAYS) {
      const years = Math.round((compAgeDays / 365) * 10) / 10;
      items.push({
        candidate: c,
        reason: `Comp on file is ${years} years old — worth a re-check before pitching`,
        action: ACTION.recheck_comp,
        warmthDays,
      });
    } else if (warmthDays >= STALE_DAYS) {
      const neverTouched = c.warmthAt === c.createdAt;
      items.push({
        candidate: c,
        reason: neverTouched ? `On the bench ${warmthDays} days, never reached out` : `No touch in ${warmthDays} days`,
        action: neverTouched ? ACTION.reach_out : ACTION.follow_up,
        warmthDays,
      });
    }
  }

  items.sort((a, b) => {
    const rankDiff = priorityRank(a.action.kind) - priorityRank(b.action.kind);
    return rankDiff !== 0 ? rankDiff : b.warmthDays - a.warmthDays;
  });

  return items.slice(0, limit);
}

// ---------------------------------------------------------------------------------- matches

async function getMatchesForRole(roleId: Id): Promise<Match[]> {
  return db.matches.where('roleId').equals(roleId).toArray();
}

function toScoreRoleInput(r: Role): ScoreRoleInput {
  return {
    id: r.id, title: r.title, level: r.level, location: r.location, compBand: r.compBand,
    mustHaves: r.mustHaves, niceToHaves: r.niceToHaves, dealbreakers: r.dealbreakers,
  };
}

async function toScoreCandidateInput(c: Candidate): Promise<ScoreCandidateInput> {
  const lastProcess = await db.processes.where('candidateId').equals(c.id).last();
  return {
    id: c.id, name: c.name, skills: c.skills, seniority: c.seniority,
    currentTitle: c.currentTitle, currentEmployer: c.currentEmployer, tenureStart: c.tenureStart,
    compExpectation: c.compExpectation, compAtLastProcess: c.compAtLastProcess,
    location: c.location, status: c.status, snoozeUntil: c.snoozeUntil, warmthAt: c.warmthAt,
    priorReason: lastProcess?.reason,
  };
}

export interface PreparedScoreRequest {
  role: ScoreRoleInput;
  candidates: ScoreCandidateInput[];
  hash: string;
  /** true when the last stored matches for this role already carry this exact hash — skip the network call. */
  unchanged: boolean;
}

/**
 * Builds the /api/score request body for a role from the *active* candidates on the bench,
 * and tells the caller whether anything actually changed since the last score (BLUEPRINT-v2.md:
 * "client matches.hash ⇒ zero network on identical input; only changed candidates are sent").
 */
async function prepareScoreRequest(roleId: Id): Promise<PreparedScoreRequest> {
  const role = await get('roles', roleId);
  if (!role) throw new Error(`Role ${roleId} not found`);

  const allCandidates = await list('candidates');
  const active = allCandidates.filter(c => c.status === 'active');
  const roleInput = toScoreRoleInput(role);
  const candidateInputs = await Promise.all(active.map(toScoreCandidateInput));
  const hash = scoreFingerprint(roleInput, candidateInputs);

  const existing = await getMatchesForRole(roleId);
  const unchanged = candidateInputs.length > 0
    && existing.length >= candidateInputs.length
    && existing.every(m => m.hash === hash);

  return { role: roleInput, candidates: candidateInputs, hash, unchanged };
}

/** Upserts one Match row per scored candidate for a role, preserving stage + any human override. */
async function applyScoreResults(roleId: Id, hash: string, scored: ScoredRow[]): Promise<Match[]> {
  const existing = await getMatchesForRole(roleId);
  const byCandidateId = new Map(existing.map(m => [m.candidateId, m]));
  const now = nowISO();

  const rows: Match[] = scored.map(row => {
    const prior = byCandidateId.get(row.candidateId);
    const match: Match = {
      id: prior?.id ?? ulid(),
      roleId,
      candidateId: row.candidateId,
      score: row.score,
      sub: row.sub,
      why: row.why,
      flags: row.flags,
      override: prior?.override,
      hash,
      fallback: row.fallback,
      stage: prior?.stage ?? 'warm',
      stageUpdatedAt: prior?.stageUpdatedAt ?? now,
      updatedAt: now,
    };
    return match;
  });

  await table('matches').bulkPut(rows);
  scheduleDriveSnapshot();
  return rows;
}

/** A human override wins in the UI but the underlying AI score + why stay for audit. */
async function setOverride(matchId: Id, score: number, reason: string): Promise<Match> {
  const match = await get('matches', matchId);
  if (!match) throw new Error(`Match ${matchId} not found`);
  const override: MatchOverride = { score, reason, at: nowISO() };
  const updated: Match = { ...match, override, updatedAt: nowISO() };
  await put('matches', updated);
  await logActivity({
    candidateId: match.candidateId,
    roleId: match.roleId,
    type: 'note',
    body: `Score overridden to ${score}: ${reason}`,
    actor: 'owner',
  });
  return updated;
}

async function setStage(matchId: Id, stage: Match['stage'], note: string): Promise<Match> {
  const match = await get('matches', matchId);
  if (!match) throw new Error(`Match ${matchId} not found`);
  const now = nowISO();
  const updated: Match = { ...match, stage, stageUpdatedAt: now, updatedAt: now };
  await put('matches', updated);
  await logActivity({
    candidateId: match.candidateId,
    roleId: match.roleId,
    type: 'stage',
    body: `Moved to "${stage}"${note ? ` — ${note}` : ''}`,
    actor: 'owner',
  });
  return updated;
}

// ------------------------------------------------------------------------------------ import

export interface ImportPreviewItem {
  incoming: Candidate;
  existing?: Candidate;
  action: 'create' | 'merge';
}

function candidateDedupeKeys(c: Pick<Candidate, 'email' | 'name' | 'currentEmployer'>): string[] {
  const keys: string[] = [];
  if (c.email) keys.push(`email:${c.email.trim().toLowerCase()}`);
  keys.push(`name:${c.name.trim().toLowerCase()}|${(c.currentEmployer ?? '').trim().toLowerCase()}`);
  return keys;
}

/** Dedupes on email, or name+employer as a fallback — BLUEPRINT-v2.md's import contract. */
async function previewCandidateImport(incoming: Candidate[]): Promise<ImportPreviewItem[]> {
  const existingList = await list('candidates');
  const byKey = new Map<string, Candidate>();
  for (const e of existingList) for (const k of candidateDedupeKeys(e)) byKey.set(k, e);

  return incoming.map(cand => {
    const existing = candidateDedupeKeys(cand).map(k => byKey.get(k)).find((x): x is Candidate => !!x);
    return { incoming: cand, existing, action: existing ? 'merge' : 'create' };
  });
}

/** Writes a previewed import in one transaction: candidates + one activity row each. */
async function commitCandidateImport(items: ImportPreviewItem[]): Promise<{ created: number; merged: number }> {
  const now = nowISO();
  const candidateRows: Candidate[] = [];
  const activityRows: Activity[] = [];
  let created = 0;
  let merged = 0;

  for (const item of items) {
    let row: Candidate;
    if (item.action === 'merge' && item.existing) {
      row = {
        ...item.existing, ...item.incoming,
        id: item.existing.id, createdAt: item.existing.createdAt, updatedAt: now,
        notes: [...item.existing.notes, ...item.incoming.notes],
      };
      merged++;
    } else {
      row = { ...item.incoming, id: item.incoming.id || ulid(), createdAt: now, updatedAt: now };
      created++;
    }
    candidateRows.push(row);
    activityRows.push({
      id: ulid(), candidateId: row.id, type: 'import', at: now,
      body: item.action === 'merge' ? 'Merged from import (dedupe match on email or name+employer)' : 'Created from import',
      actor: 'owner',
    });
  }

  await db.transaction('rw', db.candidates, db.activities, async () => {
    await db.candidates.bulkPut(candidateRows);
    await db.activities.bulkPut(activityRows);
  });
  scheduleDriveSnapshot();
  return { created, merged };
}

// -------------------------------------------------------------------------------- bootstrap

/** Runs the one-time v1 migration, then seeds the sample bench if the DB is still empty. */
async function init(): Promise<{ migrated: boolean; loadedSample: boolean }> {
  const migration = await migrateLegacyLocalStorage(db);
  const candidateCount = await db.candidates.count();
  let loadedSample = false;
  if (candidateCount === 0) {
    await loadSampleBench();
    loadedSample = true;
  }
  return { migrated: migration.migrated, loadedSample };
}

async function loadSampleBench(): Promise<void> {
  const { roles, candidates, processes } = buildSampleBench();
  await db.transaction('rw', db.roles, db.candidates, db.processes, async () => {
    await db.roles.bulkPut(roles);
    await db.candidates.bulkPut(candidates);
    await db.processes.bulkPut(processes);
  });
  await setSetting(SETTINGS_KEYS.sampleFlag, true);
}

/** "Start my own bench" — wipes every data table (never settings like theme). */
async function wipe(): Promise<void> {
  await db.transaction('rw', [db.candidates, db.roles, db.processes, db.matches, db.activities, db.sequences], async () => {
    await Promise.all([
      db.candidates.clear(), db.roles.clear(), db.processes.clear(),
      db.matches.clear(), db.activities.clear(), db.sequences.clear(),
    ]);
  });
  await setSetting(SETTINGS_KEYS.sampleFlag, false);
  scheduleDriveSnapshot();
}

// -------------------------------------------------------------------------- export / import

async function exportAllJSON(): Promise<string> {
  const [candidates, roles, processes, matches, activities, sequences] = await Promise.all([
    list('candidates'), list('roles'), list('processes'), list('matches'), list('activities'), list('sequences'),
  ]);
  return JSON.stringify({ v: 2, exportedAt: nowISO(), candidates, roles, processes, matches, activities, sequences }, null, 2);
}

function toCSVValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

async function exportCSV<K extends TableName>(name: K): Promise<string> {
  const rows = await list(name);
  if (!rows.length) return '';
  const headers = Object.keys(rows[0] as object);
  const lines = [
    headers.join(','),
    ...rows.map(r => headers.map(h => toCSVValue((r as unknown as Record<string, unknown>)[h])).join(',')),
  ];
  return lines.join('\n');
}

// -------------------------------------------------------------------------------- drive sync

async function localLatestUpdatedAt(): Promise<ISODate> {
  const [candidates, roles, processes, matches, activities, sequences] = await Promise.all([
    list('candidates'), list('roles'), list('processes'), list('matches'), list('activities'), list('sequences'),
  ]);
  const stamps = [
    ...candidates.map(c => c.updatedAt), ...roles.map(r => r.updatedAt),
    ...processes.map(p => p.updatedAt), ...matches.map(m => m.updatedAt),
    ...activities.map(a => a.at), ...sequences.map(s => s.updatedAt),
  ].filter(Boolean);
  return stamps.length ? stamps.reduce((a, b) => (a > b ? a : b)) : new Date(0).toISOString();
}

async function buildSnapshot(): Promise<DriveSnapshot> {
  const [candidates, roles, processes, matches, activities, sequences] = await Promise.all([
    list('candidates'), list('roles'), list('processes'), list('matches'), list('activities'), list('sequences'),
  ]);
  return { v: 2, updatedAt: nowISO(), tables: { candidates, roles, processes, matches, activities, sequences } };
}

async function writeSnapshotFromTables(snapshot: DriveSnapshot): Promise<void> {
  await db.transaction('rw', [db.candidates, db.roles, db.processes, db.matches, db.activities, db.sequences], async () => {
    await Promise.all([
      db.candidates.bulkPut(snapshot.tables.candidates),
      db.roles.bulkPut(snapshot.tables.roles),
      db.processes.bulkPut(snapshot.tables.processes),
      db.matches.bulkPut(snapshot.tables.matches),
      db.activities.bulkPut(snapshot.tables.activities),
      db.sequences.bulkPut(snapshot.tables.sequences),
    ]);
  });
}

let driveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced 3s after any mutation — BLUEPRINT-v2.md's "snapshot.json debounced 3s". */
function scheduleDriveSnapshot(): void {
  if (!driveService.isConnected()) return;
  if (driveDebounceTimer) clearTimeout(driveDebounceTimer);
  driveDebounceTimer = setTimeout(() => {
    void (async () => {
      try {
        const snapshot = await buildSnapshot();
        await driveService.writeSnapshot(snapshot);
        await setSetting(SETTINGS_KEYS.driveSnapshotAt, snapshot.updatedAt);
      } catch (e) {
        console.warn('[dataService] Drive snapshot write failed:', e);
      }
    })();
  }, DRIVE_DEBOUNCE_MS);
}

export interface DriveConflict { localAt: ISODate; driveAt: ISODate }
export interface DriveSyncResult { loadedFromDrive: boolean; conflict: DriveConflict | null }

/**
 * Call once on sign-in. Loads Drive's snapshot if it's newer than everything local, pushes
 * local if local is newer, and — critically — never silently clobbers: if BOTH sides changed
 * since the last known-good sync point, it raises a conflict flag (settings.driveConflict)
 * for the UI to show a banner, instead of picking a winner.
 */
async function syncWithDrive(accessToken: string): Promise<DriveSyncResult> {
  driveService.setToken(accessToken);

  const [driveSnapshot, localLatest, lastSyncAt] = await Promise.all([
    driveService.readSnapshot(),
    localLatestUpdatedAt(),
    getSetting(SETTINGS_KEYS.driveSnapshotAt, ''),
  ]);

  if (!driveSnapshot) {
    scheduleDriveSnapshot();
    return { loadedFromDrive: false, conflict: null };
  }

  const driveIsNewer = driveSnapshot.updatedAt > localLatest;
  const localChangedSinceSync = localLatest > lastSyncAt;

  if (driveIsNewer && localChangedSinceSync) {
    const conflict: DriveConflict = { localAt: localLatest, driveAt: driveSnapshot.updatedAt };
    await setSetting(SETTINGS_KEYS.driveConflict, conflict);
    return { loadedFromDrive: false, conflict };
  }

  if (driveIsNewer) {
    await writeSnapshotFromTables(driveSnapshot);
    await setSetting(SETTINGS_KEYS.driveSnapshotAt, driveSnapshot.updatedAt);
    await setSetting(SETTINGS_KEYS.driveConflict, null);
    return { loadedFromDrive: true, conflict: null };
  }

  scheduleDriveSnapshot();
  await setSetting(SETTINGS_KEYS.driveConflict, null);
  return { loadedFromDrive: false, conflict: null };
}

/** UI calls this from the conflict banner: keep the local copy (and push it), or take Drive's. */
async function resolveDriveConflict(keep: 'local' | 'drive'): Promise<void> {
  if (keep === 'local') {
    await setSetting(SETTINGS_KEYS.driveConflict, null);
    scheduleDriveSnapshot();
    return;
  }
  const snapshot = await driveService.readSnapshot();
  if (!snapshot) return;
  await writeSnapshotFromTables(snapshot);
  await setSetting(SETTINGS_KEYS.driveSnapshotAt, snapshot.updatedAt);
  await setSetting(SETTINGS_KEYS.driveConflict, null);
}

// ------------------------------------------------------------------------- useLiveQuery hooks

function useTable<K extends TableName>(name: K): TableMap[K][] | undefined {
  return useLiveQuery(() => table(name).toArray(), [name]);
}

function useRecord<K extends TableName>(name: K, id: Id | undefined): TableMap[K] | undefined {
  return useLiveQuery(() => (id ? table(name).get(id) : undefined), [name, id]);
}

function useCandidates(): Candidate[] | undefined {
  const rows = useTable('candidates');
  return rows?.map(attachDrift);
}
function useCandidate(id: Id | undefined): Candidate | undefined {
  const row = useRecord('candidates', id);
  return row ? attachDrift(row) : undefined;
}
function useRoles(): Role[] | undefined {
  return useTable('roles');
}
function useRole(id: Id | undefined): Role | undefined {
  return useRecord('roles', id);
}
function useMatchesForRole(roleId: Id | undefined): Match[] | undefined {
  return useLiveQuery(() => (roleId ? db.matches.where('roleId').equals(roleId).toArray() : []), [roleId]);
}
function useProcessesForCandidate(candidateId: Id | undefined): Process[] | undefined {
  return useLiveQuery(() => (candidateId ? db.processes.where('candidateId').equals(candidateId).toArray() : []), [candidateId]);
}
function useActivitiesForCandidate(candidateId: Id | undefined): Activity[] | undefined {
  return useLiveQuery(() => (candidateId ? db.activities.where('candidateId').equals(candidateId).reverse().sortBy('at') : []), [candidateId]);
}
function useSequencesForCandidate(candidateId: Id | undefined): Sequence[] | undefined {
  return useLiveQuery(() => (candidateId ? db.sequences.where('candidateId').equals(candidateId).toArray() : []), [candidateId]);
}
function useTodayQueue(limit = 5): TodayQueueItem[] | undefined {
  return useLiveQuery(() => computeTodayQueue(limit), [limit]);
}
function useSetting<T>(key: string, fallback: T): T | undefined {
  return useLiveQuery(() => getSetting(key, fallback), [key]);
}

// ------------------------------------------------------------------------------------ facade

export const dataService = {
  // generic CRUD
  list, get, put, bulkPut, delete: del,

  // bootstrap / lifecycle
  init, loadSampleBench, wipe,

  // domain logic
  applyStatus, logActivity, computeWarmthDays, computeSeniorityDrift, computeTodayQueue,
  setOverride, setStage, getMatchesForRole, prepareScoreRequest, applyScoreResults,

  // import
  previewCandidateImport, commitCandidateImport,

  // settings
  getSetting, setSetting,

  // export
  exportAllJSON, exportCSV,

  // drive
  syncWithDrive, resolveDriveConflict,

  // React live-query hooks
  hooks: {
    useCandidates, useCandidate, useRoles, useRole, useMatchesForRole,
    useProcessesForCandidate, useActivitiesForCandidate, useSequencesForCandidate,
    useTodayQueue, useSetting,
  },
};

export type { TableMap, TableName };
