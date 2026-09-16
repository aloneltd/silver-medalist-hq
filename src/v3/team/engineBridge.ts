/**
 * The Inbox's only door into the import engine (`src/v3/import/index.ts`, now wired). Every
 * call here stays wrapped so a thrown engine error — a corrupt draft, a DB write that loses a
 * race with a sync — becomes one honest sentence in the UI, never a blank screen or an
 * unhandled rejection, and never a half-accepted submission.
 */
import { stagePerson, commitStaged } from '../import';
import { db } from '../../db/schema';
import type { PersonSource, Submission, SourceKind } from '../../types';

export const ENGINE_FAILED_MESSAGE =
  "Something went wrong running the duplicate check, so nothing was added to the bench. " +
  "This person is still waiting in the Inbox — try Accept again.";

const VIA_LABEL: Record<Submission['via'], string> = {
  link: 'the add-to-bench link',
  capture: 'the Capture bookmarklet',
  outlook: 'an Outlook scan',
  drive: 'a watched Drive folder',
  teammate: 'a teammate',
  resume: 'a résumé drop',
};

/** The badge a person carries once accepted: kind mirrors how the submission arrived. */
export function sourceForSubmission(sub: Submission): PersonSource {
  return {
    kind: sub.via as SourceKind,
    label: VIA_LABEL[sub.via] ?? 'the Inbox',
    addedBy: sub.addedBy || undefined,
    at: new Date().toISOString(),
  };
}

export interface AcceptOutcome {
  ok: boolean;
  message: string;
}

/**
 * Runs the same duplicate check any import runs (`stagePerson`), then commits it as one
 * undoable batch (`commitStaged`) with the sender as the source badge, then moves the
 * submission to `accepted`. Never touches the bench on failure.
 */
export async function acceptSubmission(sub: Submission, actor: string): Promise<AcceptOutcome> {
  const source = sourceForSubmission(sub);
  let staged;
  try {
    staged = await stagePerson(sub.draft, source);
  } catch {
    return { ok: false, message: ENGINE_FAILED_MESSAGE };
  }
  try {
    await commitStaged([staged], source, { actor, label: 'Inbox accept', kind: source.kind });
  } catch {
    return { ok: false, message: ENGINE_FAILED_MESSAGE };
  }
  await db.submissions.update(sub.id, { state: 'accepted' });
  return { ok: true, message: `${sub.draft.name} is on the bench, added by ${sub.addedBy || 'the Inbox'}.` };
}

/** Keeps the record (so the same person is not proposed again) — never touches the bench. */
export async function rejectSubmission(sub: Submission): Promise<void> {
  await db.submissions.update(sub.id, { state: 'rejected' });
}

/**
 * Best-effort duplicate preview for an Inbox row, using the same check Accept will run. Fails
 * silently (returns null) while the engine isn't implemented — the row simply shows no
 * duplicate warning rather than a broken one.
 */
export async function previewDuplicate(sub: Submission) {
  try {
    return await stagePerson(sub.draft, sourceForSubmission(sub));
  } catch {
    return null;
  }
}
