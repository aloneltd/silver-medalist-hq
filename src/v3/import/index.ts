/**
 * IMPORT ENGINE — public contract. Owned by builder B1 (this file and everything else under
 * src/v3/import/). Sources (B2), Team/Inbox (B5) and Capture code against these signatures
 * and nothing else, so the engine can be rewritten without touching a screen.
 *
 * Everything here is lazy on purpose: pdfjs, mammoth and the zip reader are large and must
 * never reach the initial chunk. Load them inside the functions that need them.
 */
import type {
  Candidate, CaptureDraft, ColumnMapping, ImportBatch, ImportPlan, PersonSource,
  SourceKind, StagedPerson,
} from '../../types';

const NOT_IMPLEMENTED = 'The import engine is still being built (src/v3/import).';

/**
 * Read dropped files into ONE reviewable plan — résumés (PDF/DOCX), spreadsheets (CSV/TSV/
 * XLSX), JSON exports, and Slack export zips, mixed together in a single drop.
 * `onProgress` drives the "reading 3 of 12…" line; it must fire per file.
 */
export async function buildPlanFromFiles(
  _files: File[],
  _opts?: { onProgress?: (done: number, total: number, label: string) => void },
): Promise<ImportPlan> {
  throw new Error(NOT_IMPLEMENTED);
}

/** Pasted text: a CSV blob, a list of names and links, or a page someone copied. */
export async function buildPlanFromText(_text: string, _label?: string): Promise<ImportPlan> {
  throw new Error(NOT_IMPLEMENTED);
}

/** A Capture bookmarklet payload — one person, structured from the visible page text. */
export async function buildPlanFromCapture(_draft: CaptureDraft): Promise<ImportPlan> {
  throw new Error(NOT_IMPLEMENTED);
}

/** Re-run field extraction and dedupe after the user corrected a column mapping. */
export async function remapPlan(_plan: ImportPlan, _columns: ColumnMapping[]): Promise<ImportPlan> {
  throw new Error(NOT_IMPLEMENTED);
}

/** Apply a plan's decisions. The returned batch is the handle `undoImport` takes. */
export async function commitPlan(_plan: ImportPlan, _opts?: { actor?: string }): Promise<ImportBatch> {
  throw new Error(NOT_IMPLEMENTED);
}

/** Created people are deleted; merged people are restored verbatim, including their notes. */
export async function undoImport(_batchId: string): Promise<void> {
  throw new Error(NOT_IMPLEMENTED);
}

/** Newest first. Drives the "what you imported" list and every undo button. */
export async function listImports(): Promise<ImportBatch[]> {
  throw new Error(NOT_IMPLEMENTED);
}

/** Per-source people counts and last arrival — the numbers on the Sources cards. */
export async function sourceStats(): Promise<Partial<Record<SourceKind, { count: number; lastAt?: string }>>> {
  throw new Error(NOT_IMPLEMENTED);
}

/** The same dedupe check an import runs, for a single person (the Inbox accept path). */
export async function stagePerson(
  _draft: Partial<Candidate> & { name: string },
  _source: PersonSource,
): Promise<StagedPerson> {
  throw new Error(NOT_IMPLEMENTED);
}

/** Commit already-staged people (Inbox accept, capture approve) as one undoable batch. */
export async function commitStaged(
  _staged: StagedPerson[],
  _source: PersonSource,
  _opts?: { actor?: string; label?: string; kind?: SourceKind },
): Promise<ImportBatch> {
  throw new Error(NOT_IMPLEMENTED);
}
