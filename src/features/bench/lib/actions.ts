/**
 * Shared action helpers for bench/map/dossier/outreach, built entirely on dataService's public
 * generic CRUD (`get`/`put`) + `logActivity`. Not a data-layer stub — these are one-line
 * compound actions the same way `applyStatus`/`setStage`/`setOverride` are, just specific to
 * B2's screens (touch warmth, notes, bulk tag/snooze). Every mutation logs to Activity per
 * BLUEPRINT-v2.md ("Everything logs to activities").
 */
import { dataService } from '../../../services/dataService';
import { ulid } from '../../../lib/ulid';
import type { Id, ISODate } from '../../../types';

const nowISO = (): ISODate => new Date().toISOString();

/** Resets the warmth clock — used by "Reach out" quick actions and Outreach's "Mark sent". */
export async function touchWarmth(candidateId: Id, actor = 'owner'): Promise<void> {
  const c = await dataService.get('candidates', candidateId);
  if (!c) return;
  await dataService.put('candidates', { ...c, warmthAt: nowISO(), updatedAt: nowISO() });
  await dataService.logActivity({ candidateId, type: 'touch', body: 'Marked as touched', actor });
}

export async function addNote(candidateId: Id, body: string, actor = 'owner'): Promise<void> {
  const c = await dataService.get('candidates', candidateId);
  if (!c) return;
  const note = { id: ulid(), body, at: nowISO(), actor };
  await dataService.put('candidates', { ...c, notes: [...c.notes, note], updatedAt: nowISO() });
  await dataService.logActivity({ candidateId, type: 'note', body, actor });
}

export async function snoozeCandidate(candidateId: Id, untilISO: ISODate, actor = 'owner'): Promise<void> {
  const c = await dataService.get('candidates', candidateId);
  if (!c) return;
  await dataService.put('candidates', { ...c, snoozeUntil: untilISO, updatedAt: nowISO() });
  await dataService.logActivity({
    candidateId, type: 'reminder', actor,
    body: `Snoozed until ${new Date(untilISO).toLocaleDateString()}`,
  });
}

export async function bulkTag(candidateIds: Id[], tag: string): Promise<void> {
  for (const id of candidateIds) {
    const c = await dataService.get('candidates', id);
    if (!c || c.tags.includes(tag)) continue;
    await dataService.put('candidates', { ...c, tags: [...c.tags, tag], updatedAt: nowISO() });
  }
}

export async function bulkSnooze(candidateIds: Id[], untilISO: ISODate): Promise<void> {
  for (const id of candidateIds) await snoozeCandidate(id, untilISO);
}

export async function bulkStatus(candidateIds: Id[], status: Parameters<typeof dataService.applyStatus>[1], reason: string): Promise<void> {
  for (const id of candidateIds) await dataService.applyStatus(id, status, reason);
}

/** "Mark placed" — per BLUEPRINT-v2.md: candidate status → took_role, and (if this role has a
 *  match) its board stage → placed. Both log to Activity via the underlying dataService calls. */
export async function markPlaced(candidateId: Id, matchId: Id | undefined): Promise<void> {
  await dataService.applyStatus(candidateId, 'took_role', 'Placed via the bench');
  if (matchId) await dataService.setStage(matchId, 'placed', 'Placed via the bench');
}
