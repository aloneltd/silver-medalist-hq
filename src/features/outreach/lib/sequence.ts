import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db';
import { dataService } from '../../../services/dataService';
import { ulid } from '../../../lib/ulid';
import type { Sequence, SequenceStep, Channel, Id } from '../../../types';

const STEP_DAYS = [0, 3, 7] as const;
const STEP_CHANNEL: Record<(typeof STEP_DAYS)[number], Channel> = { 0: 'email', 3: 'email', 7: 'linkedin' };

function blankSteps(): SequenceStep[] {
  return STEP_DAYS.map(day => ({ day, channel: STEP_CHANNEL[day], body: '' }));
}

/** Reads (and lazily shapes, without writing) the Day 0/3/7 sequence for a candidate+role. */
export function useSequence(candidateId: Id, roleId: Id | undefined): Sequence | undefined {
  return useLiveQuery(
    async () => {
      if (!roleId) return undefined;
      const existing = await db.sequences.where({ candidateId, roleId }).first();
      if (existing) return existing;
      const now = new Date().toISOString();
      return { id: '', candidateId, roleId, steps: blankSteps(), createdAt: now, updatedAt: now } as Sequence;
    },
    [candidateId, roleId],
  );
}

async function loadOrCreateSequence(candidateId: Id, roleId: Id): Promise<Sequence> {
  const existing = await db.sequences.where({ candidateId, roleId }).first();
  if (existing) return existing;
  const now = new Date().toISOString();
  const seq: Sequence = { id: ulid(), candidateId, roleId, steps: blankSteps(), createdAt: now, updatedAt: now };
  await dataService.put('sequences', seq);
  return seq;
}

/** Persists the draft for one step (so edits survive a reload even before it's sent). */
export async function saveStepDraft(candidateId: Id, roleId: Id, day: 0 | 3 | 7, body: string): Promise<void> {
  const seq = await loadOrCreateSequence(candidateId, roleId);
  const steps = seq.steps.map(s => (s.day === day ? { ...s, body } : s));
  await dataService.put('sequences', { ...seq, steps, updatedAt: new Date().toISOString() });
}

/**
 * "Mark sent" — marks this step done, and schedules the next undone step as `nextDueAt`
 * (BLUEPRINT-v2.md: "follow-ups become reminders on the bench"). Returns the updated sequence
 * so the caller can show the new due date.
 */
export async function markStepSent(candidateId: Id, roleId: Id, day: 0 | 3 | 7, body: string): Promise<Sequence> {
  const seq = await loadOrCreateSequence(candidateId, roleId);
  const now = new Date().toISOString();
  const steps = seq.steps.map(s => (s.day === day ? { ...s, body, doneAt: now } : s));
  const next = steps.filter(s => !s.doneAt).sort((a, b) => a.day - b.day)[0];
  const nextDueAt = next ? new Date(Date.now() + (next.day - day) * 86_400_000).toISOString() : undefined;
  const updated: Sequence = { ...seq, steps, nextDueAt, updatedAt: now };
  await dataService.put('sequences', updated);

  await dataService.logActivity({
    candidateId, roleId, type: 'reminder', actor: 'owner',
    body: next
      ? `Day ${day} outreach sent — Day ${next.day} follow-up due ${new Date(nextDueAt!).toLocaleDateString()}`
      : `Day ${day} outreach sent — sequence complete`,
  });

  return updated;
}
