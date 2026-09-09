/**
 * Writing an import, and taking it back.
 *
 * The undo promise is the whole reason this file exists: before anything is written we keep a
 * verbatim copy of every record we are about to touch, and every row we create carries the
 * import's id in its own id, so undo can find its own work and nothing else.
 */
import {
  SETTINGS_KEYS,
  type Activity, type Candidate, type Id, type ImportBatch, type ImportPlan, type ISODate,
  type Process, type Role, type SourceKind, type StagedPerson,
} from '../../types';
import { db } from '../../db/schema';
import { dataService } from '../../services/dataService';
import { ulid } from '../../lib/ulid';
import { FINISHED_AS_WORDS, normText } from './normalize';
import { mergeCandidates } from './merge';
import { makeNote } from './extract';

const DEFAULT_ACTOR = 'owner';

function nowISO(): ISODate {
  return new Date().toISOString();
}

/** Deep enough for a Candidate — plain data, no Dates, no Maps. */
function copy<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Ids that say which import made them, so `undoImport` can find exactly its own rows. */
const activityId = (importId: Id, n: number) => `${importId}-a${n}`;
const processId = (importId: Id, n: number) => `${importId}-p${n}`;
const roleId = (importId: Id, n: number) => `${importId}-r${n}`;

/**
 * Applies a plan. Rows with `decision: 'skip'` are not written at all.
 *
 * Writes happen in this order on purpose: the undo record first (so a failure half way still
 * leaves something to undo), then roles, people, candidacies and finally the activity log.
 */
export async function commitPlan(plan: ImportPlan, opts?: { actor?: string }): Promise<ImportBatch> {
  const actor = opts?.actor ?? DEFAULT_ACTOR;
  const at = nowISO();
  const importId = ulid();

  const [existingCandidates, existingRoles, existingProcesses] = await Promise.all([
    dataService.list('candidates'),
    dataService.list('roles'),
    dataService.list('processes'),
  ]);

  const bench = new Map(existingCandidates.map(c => [c.id, c]));
  const before: Record<Id, Candidate> = {};
  const createdIds: Id[] = [];
  const mergedIds: Id[] = [];
  const processIds: Id[] = [];

  const candidateRows = new Map<Id, Candidate>();
  const roleRows = new Map<Id, Role>();
  const processRows: Process[] = [];
  const activityRows: Activity[] = [];

  const rolesByTitle = new Map<string, Role>();
  for (const r of existingRoles) {
    const key = normText(r.title);
    if (key && !rolesByTitle.has(key)) rolesByTitle.set(key, r);
  }
  const processByPair = new Set(existingProcesses.map(p => `${p.candidateId}|${p.roleId}`));

  let roleN = 0;
  let processN = 0;
  let activityN = 0;

  const resolveRole = (title: string): Role => {
    const key = normText(title);
    const found = rolesByTitle.get(key);
    if (found) return found;
    const created: Role = {
      id: roleId(importId, roleN++),
      title: title.trim(),
      level: 'unspecified',
      location: 'unspecified',
      compBand: { min: 0, max: 0, currency: 'USD' },
      mustHaves: [], niceToHaves: [], dealbreakers: [],
      urgency: { score: 3, reasons: [] },
      // A job named in an old export is not an open role — it is where somebody came second.
      status: 'paused',
      createdAt: at, updatedAt: at,
    };
    rolesByTitle.set(key, created);
    roleRows.set(created.id, created);
    return created;
  };

  for (const person of plan.people) {
    if (person.decision === 'skip') continue;

    const source = {
      kind: person.draft.source?.kind ?? plan.kind,
      label: person.draft.source?.label ?? plan.sourceLabel,
      ...(person.draft.source?.url ? { url: person.draft.source.url } : {}),
      importId,
      addedBy: actor,
      at,
    };

    let record: Candidate;
    let wasMerge = false;

    if (person.decision === 'merge' && person.existing) {
      // Re-read from the live bench, and chain onto anything an earlier row in this same plan
      // already merged into the same person.
      const current = candidateRows.get(person.existing.id) ?? bench.get(person.existing.id) ?? person.existing;
      if (!before[current.id]) before[current.id] = copy(current);
      const incoming: Candidate = { ...person.draft, source };
      record = mergeCandidates(current, incoming, { sourceLabel: plan.sourceLabel, at, actor }).merged;
      wasMerge = true;
      if (!mergedIds.includes(record.id)) mergedIds.push(record.id);
    } else {
      record = { ...person.draft, source, createdAt: at, updatedAt: at };
      if (!record.id) record.id = ulid();
      createdIds.push(record.id);
    }

    // The candidacy the row described.
    if (person.process?.roleTitle) {
      const role = resolveRole(person.process.roleTitle);
      const pairKey = `${record.id}|${role.id}`;
      const alreadyOnRecord = processByPair.has(pairKey) || processRows.some(p => `${p.candidateId}|${p.roleId}` === pairKey);
      if (alreadyOnRecord) {
        // One candidacy per person per job is the shape of this bench, so a second one is
        // written down as a note rather than overwriting what is already there.
        const line = `${role.title}: ${person.process.reason || `they ${FINISHED_AS_WORDS[person.process.finishedAs]}`} — from the ${plan.sourceLabel}.`;
        if (!record.notes.some(n => n.body === line)) {
          record = { ...record, notes: [...record.notes, makeNote(line, person.process.date, actor)] };
        }
      } else {
        const row: Process = {
          id: processId(importId, processN++),
          candidateId: record.id,
          roleId: role.id,
          date: person.process.date,
          finishedAs: person.process.finishedAs,
          reason: person.process.reason,
          ...(person.process.lostTo ? { lostTo: person.process.lostTo } : {}),
          ...(person.process.interviewers ? { interviewers: person.process.interviewers } : {}),
          ...(person.process.scorecard ? { scorecard: person.process.scorecard } : {}),
          createdAt: at, updatedAt: at,
        };
        processRows.push(row);
        processIds.push(row.id);
      }
    }

    candidateRows.set(record.id, record);

    activityRows.push({
      id: activityId(importId, activityN++),
      candidateId: record.id,
      type: 'import',
      at,
      body: wasMerge
        ? `Joined with the record already here, from the ${plan.sourceLabel}${person.matchOn ? ` (same ${matchWords(person.matchOn)})` : ''}.${person.changedFields?.length ? ` Changed: ${person.changedFields.join(', ')}.` : ' Nothing on their profile changed.'}`
        : `Added from the ${plan.sourceLabel}.`,
      actor,
    });
  }

  const batch: ImportBatch = {
    id: importId,
    at,
    kind: plan.kind,
    sourceLabel: plan.sourceLabel,
    ...(plan.filename ? { filename: plan.filename } : {}),
    rowCount: plan.rowCount,
    createdIds,
    mergedIds,
    before,
    processIds,
    actor,
  };

  // Undo record first — if anything below fails, the user can still take it back.
  await db.imports.put(batch);
  if (roleRows.size) await dataService.bulkPut('roles', [...roleRows.values()]);
  if (candidateRows.size) await dataService.bulkPut('candidates', [...candidateRows.values()]);
  if (processRows.length) await dataService.bulkPut('processes', processRows);
  if (activityRows.length) await dataService.bulkPut('activities', activityRows);

  return batch;
}

function matchWords(key: NonNullable<StagedPerson['matchOn']>): string {
  switch (key) {
    case 'email': return 'email address';
    case 'linkedin': return 'LinkedIn profile';
    case 'phone': return 'phone number';
    default: return 'name and employer';
  }
}

/**
 * Puts the bench back exactly as it was. Created people and everything hanging off them are
 * deleted; touched people are restored from the verbatim copies taken before the write.
 *
 * Safe to call twice: an already-undone batch returns immediately, and every delete tolerates
 * a row that is no longer there.
 */
export async function undoImport(batchId: Id): Promise<void> {
  const batch = await db.imports.get(batchId);
  if (!batch || batch.undone) return;

  const created = batch.createdIds ?? [];
  if (created.length) {
    await db.matches.where('candidateId').anyOf(created).delete();
    await db.sequences.where('candidateId').anyOf(created).delete();
    await db.processes.where('candidateId').anyOf(created).delete();
    await db.activities.where('candidateId').anyOf(created).delete();
    await db.candidates.bulkDelete(created);
  }

  // Candidacies this import added to people who were already here.
  if (batch.processIds?.length) await db.processes.bulkDelete(batch.processIds);

  // This import's own activity rows, and nobody else's.
  await db.activities.where('id').startsWith(`${batch.id}-a`).delete();

  // Jobs this import invented, but only while nothing else points at them.
  const ownRoles = await db.roles.where('id').startsWith(`${batch.id}-r`).toArray();
  for (const role of ownRoles) {
    const [usedByProcess, usedByMatch] = await Promise.all([
      db.processes.where('roleId').equals(role.id).count(),
      db.matches.where('roleId').equals(role.id).count(),
    ]);
    if (!usedByProcess && !usedByMatch) await db.roles.delete(role.id);
  }

  const restore = Object.values(batch.before ?? {});
  if (restore.length) await db.candidates.bulkPut(restore);

  await db.imports.put({ ...batch, undone: true });
}

/** Newest first — the "what you imported" list, and every undo button on it. */
export async function listImports(): Promise<ImportBatch[]> {
  const rows = await db.imports.orderBy('at').reverse().toArray();
  return rows;
}

/** People per source, and when the most recent one arrived. Drives the Sources cards. */
export async function sourceStats(): Promise<Partial<Record<SourceKind, { count: number; lastAt?: string }>>> {
  const [people, isSampleBench] = await Promise.all([
    dataService.list('candidates'),
    dataService.getSetting<boolean>(SETTINGS_KEYS.sampleFlag, false),
  ]);
  // People from a v2 bench carry no badge. On the seeded demo bench they are the sample people;
  // anywhere else the honest answer is that somebody typed them in.
  const noBadge: SourceKind = isSampleBench ? 'sample' : 'manual';
  const out: Partial<Record<SourceKind, { count: number; lastAt?: string }>> = {};
  for (const person of people) {
    const kind = person.source?.kind ?? noBadge;
    const cell = out[kind] ?? { count: 0 };
    cell.count++;
    const at = person.source?.at ?? person.sourceDate;
    if (at && (!cell.lastAt || at > cell.lastAt)) cell.lastAt = at;
    out[kind] = cell;
  }
  return out;
}
