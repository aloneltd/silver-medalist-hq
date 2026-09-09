/**
 * IMPORT ENGINE — public contract. Owned by builder B1 (this file and everything else under
 * src/v3/import/). Sources (B2), Team/Inbox (B5) and Capture code against these signatures
 * and nothing else, so the engine can be rewritten without touching a screen.
 *
 * Everything here is lazy on purpose: pdfjs, mammoth and the zip reader are large and must
 * never reach the initial chunk. Load them inside the functions that need them.
 *
 * The shape of the work:
 *   files / text / capture  ->  buildPlanFrom*  ->  ImportPlan (mapping + merge preview)
 *   user corrects a column  ->  remapPlan        ->  ImportPlan (instant, no network)
 *   user presses Import     ->  commitPlan       ->  ImportBatch
 *   user changes their mind ->  undoImport(id)   ->  the bench, exactly as it was
 */
import type {
  Candidate, CaptureDraft, ColumnMapping, ImportBatch, ImportPlan, PersonSource,
  SourceKind, StagedPerson,
} from '../../types';
import {
  buildPlanFromCapture as buildCapturePlan,
  buildPlanFromFiles as buildFilesPlan,
  buildPlanFromText as buildTextPlan,
  remapPlan as remapPlanImpl,
  stagePerson as stagePersonImpl,
  stagedToPlan,
} from './plan';
import { commitPlan as commitPlanImpl, listImports as listImportsImpl, sourceStats as sourceStatsImpl, undoImport as undoImportImpl } from './commit';

/**
 * Read dropped files into ONE reviewable plan — résumés (PDF/DOCX), spreadsheets (CSV/TSV/
 * XLSX), JSON exports, and Slack export zips, mixed together in a single drop.
 * `onProgress` drives the "reading 3 of 12…" line; it must fire per file.
 */
export async function buildPlanFromFiles(
  files: File[],
  opts?: { onProgress?: (done: number, total: number, label: string) => void; actor?: string },
): Promise<ImportPlan> {
  return buildFilesPlan(files, opts);
}

/** Pasted text: a CSV blob, a list of names and links, or a page someone copied. */
export async function buildPlanFromText(text: string, label?: string): Promise<ImportPlan> {
  return buildTextPlan(text, label);
}

/** A Capture bookmarklet payload — one person, structured from the visible page text. */
export async function buildPlanFromCapture(draft: CaptureDraft): Promise<ImportPlan> {
  return buildCapturePlan(draft);
}

/** Re-run field extraction and dedupe after the user corrected a column mapping. */
export async function remapPlan(plan: ImportPlan, columns: ColumnMapping[]): Promise<ImportPlan> {
  return remapPlanImpl(plan, columns);
}

/** Apply a plan's decisions. The returned batch is the handle `undoImport` takes. */
export async function commitPlan(plan: ImportPlan, opts?: { actor?: string }): Promise<ImportBatch> {
  return commitPlanImpl(plan, opts);
}

/** Created people are deleted; merged people are restored verbatim, including their notes. */
export async function undoImport(batchId: string): Promise<void> {
  return undoImportImpl(batchId);
}

/** Newest first. Drives the "what you imported" list and every undo button. */
export async function listImports(): Promise<ImportBatch[]> {
  return listImportsImpl();
}

/** Per-source people counts and last arrival — the numbers on the Sources cards. */
export async function sourceStats(): Promise<Partial<Record<SourceKind, { count: number; lastAt?: string }>>> {
  return sourceStatsImpl();
}

/** The same dedupe check an import runs, for a single person (the Inbox accept path). */
export async function stagePerson(
  draft: Partial<Candidate> & { name: string },
  source: PersonSource,
): Promise<StagedPerson> {
  return stagePersonImpl(draft, source);
}

/** Commit already-staged people (Inbox accept, capture approve) as one undoable batch. */
export async function commitStaged(
  staged: StagedPerson[],
  source: PersonSource,
  opts?: { actor?: string; label?: string; kind?: SourceKind },
): Promise<ImportBatch> {
  const plan = stagedToPlan(staged, source, opts);
  return commitPlanImpl(plan, { actor: opts?.actor ?? source.addedBy ?? 'owner' });
}

// ------------------------------------------------------------------- extras for the UI
//
// Not part of the contract above, but a screen that shows a mapping row or a merge preview
// needs the same words the engine uses. All of these are pure.

export { FIELD_LABELS, IMPORT_FIELD_KEYS, detectSource } from './headers';
export { mergeCandidates } from './merge';
export { findMatch, buildIndex } from './dedupe';
export { completeCandidate } from './plan';
export { formatMoney, formatMonth } from './normalize';
