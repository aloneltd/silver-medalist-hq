/**
 * Plan building — everything that turns a drop, a paste or a capture into ONE reviewable
 * ImportPlan, with the mapping and the merge preview already worked out.
 *
 * A plan holds people, not bytes, so the raw table behind it is kept here in a small cache.
 * That is what lets `remapPlan` re-run the whole extraction from a corrected column mapping
 * without re-reading the file and without a single network call.
 */
import type {
  Candidate, CaptureDraft, ColumnMapping, ImportPlan, ISODate, PersonSource, SourceKind,
  StagedPerson,
} from '../../types';
import { dataService } from '../../services/dataService';
import { ulid } from '../../lib/ulid';
import { looksTabular, parseDelimited, toTable, columnSamples, type Table } from './csv';
import { detectSource, sourceCaveats } from './headers';
import { applyCorrections, buildMapping, ruleMapping } from './mapping';
import { blankCandidate, extractRows, makeNote, type DraftRow, type ExtractContext } from './extract';
import { buildIndex, stageAll } from './dedupe';
import {
  linkedinUrl, nameFromSlug, normEmail, parseList, seniorityFromTitle, splitHeadline, trimTo,
} from './normalize';
import {
  decodeText, extensionOf, jsonToTable, readDocxText, readPdfText, readSpreadsheet, readZip,
  shapeOf, toBase64, type FoundPerson,
} from './readers';
import { fileDateOf, resumesToDrafts, type ResumeInput } from './resume';
import { askCaptureStructure } from './ai';

const DEFAULT_ACTOR = 'owner';

// -------------------------------------------------------------- the raw-table cache

interface CachedTable {
  headers: string[];
  rows: string[][];
  ctx: ExtractContext;
}

interface CachedPlan {
  tables: CachedTable[];
  /** People that did not come from a table — CVs, Slack messages, a capture. Untouched by a remap. */
  fixedDrafts: DraftRow[];
  actor: string;
}

const RAW_CACHE = new Map<string, CachedPlan>();
const RAW_CACHE_MAX = 8;

function remember(planId: string, data: CachedPlan): void {
  RAW_CACHE.set(planId, data);
  while (RAW_CACHE.size > RAW_CACHE_MAX) {
    const oldest = RAW_CACHE.keys().next().value;
    if (oldest === undefined) break;
    RAW_CACHE.delete(oldest);
  }
}

/** Test seam. */
export function forgetPlans(): void {
  RAW_CACHE.clear();
}

// -------------------------------------------------------------------- plan assembly

interface Part {
  kind: SourceKind;
  label: string;
  filename?: string;
  rowCount: number;
  drafts: DraftRow[];
  notes: string[];
  table?: CachedTable;
  columns?: ColumnMapping[];
  mappedByAI?: boolean;
}

async function assemble(parts: Part[], meta: { actor: string; fallbackLabel: string }): Promise<ImportPlan> {
  const id = ulid();
  const drafts = parts.flatMap(p => p.drafts);
  const notes = parts.flatMap(p => p.notes);

  // One mapping across the whole drop, keyed by header name. Two files that both have an
  // "Email" column share the row, which is exactly what `remapPlan` then applies to both.
  const tabular = parts.filter(p => p.table);
  const columns = tabular.length
    ? tabular.reduce<ColumnMapping[]>((acc, part) => {
      for (const col of part.columns ?? []) if (!acc.some(c => c.column === col.column)) acc.push(col);
      return acc;
    }, [])
    : undefined;
  if (tabular.length > 1) {
    notes.push(`This drop held ${tabular.length} spreadsheets. Their columns are listed together below; correcting one changes every file that has that column.`);
  }

  // The plan's own identity: whichever part brought the most people.
  const lead = [...parts].sort((a, b) => b.drafts.length - a.drafts.length)[0];
  const kind: SourceKind = lead?.kind ?? 'csv';
  const sourceLabel = parts.length === 1 ? (lead?.label ?? meta.fallbackLabel) : meta.fallbackLabel;
  const filename = parts.length === 1 ? parts[0].filename : undefined;

  const existing = await dataService.list('candidates');
  const index = buildIndex(existing);
  const at = new Date().toISOString();
  const { people, foldedNames } = stageAll(drafts, index, { sourceLabel, at, actor: meta.actor, keyPrefix: 'p' });

  if (foldedNames.length) {
    const names = [...new Set(foldedNames)].slice(0, 5).join(', ');
    notes.push(`${foldedNames.length} row${foldedNames.length === 1 ? ' was' : 's were'} the same person listed more than once (${names}${foldedNames.length > 5 ? ' and others' : ''}). We kept one of each.`);
  }
  const probable = people.filter(p => p.confidence === 'probable').length;
  if (probable) {
    notes.push(`${probable} ${probable === 1 ? 'person looks' : 'people look'} like someone already on your bench by name and employer, but with a different email. We will add them as new unless you say otherwise — we never join two records on a name alone.`);
  }

  remember(id, {
    tables: parts.filter(p => p.table).map(p => p.table as CachedTable),
    fixedDrafts: parts.filter(p => !p.table).flatMap(p => p.drafts),
    actor: meta.actor,
  });

  return {
    id,
    kind,
    sourceLabel,
    ...(filename ? { filename } : {}),
    rowCount: parts.reduce((n, p) => n + p.rowCount, 0),
    ...(columns ? { columns } : {}),
    people,
    notes,
    ...(parts.some(p => p.mappedByAI) ? { mappedByAI: true } : {}),
  };
}

// ------------------------------------------------------------------- tabular parts

async function tablePart(
  table: Table,
  meta: { filename?: string; now: ISODate; fileDate: ISODate; actor: string; kindHint?: SourceKind; labelHint?: string },
  useAi: boolean,
): Promise<Part> {
  const samples = columnSamples(table);
  const detected = detectSource(table.headers, meta.filename);
  const kind = meta.kindHint ?? detected.kind;
  const label = meta.labelHint ?? detected.label;

  const mapping = await buildMapping(table.headers, samples, useAi);
  const ctx: ExtractContext = {
    kind, sourceLabel: label, fileDate: meta.fileDate, now: meta.now, actor: meta.actor,
    ...(meta.filename ? { filename: meta.filename } : {}),
  };
  const { rows, skippedRows } = extractRows(table.headers, table.rows, mapping.columns, ctx);

  const notes = sourceCaveats(label, mapping.columns);
  if (mapping.aiFailed) {
    notes.push('The AI could not help name the unknown columns this time, so we matched them by hand. Check the mapping below before you import.');
  }
  if (mapping.mappedByAI) {
    notes.push('Some columns were matched by AI rather than by a rule — they are marked as a guess below. Change any of them before you import.');
  }
  if (skippedRows) {
    notes.push(`${skippedRows} row${skippedRows === 1 ? '' : 's'} had no name and no email, so there was nobody to add. They were left out.`);
  }
  if (rows.some(r => r.process)) {
    notes.push('Jobs named in this file are added as past jobs, not open roles, so they will not show up in your open list.');
  }

  return {
    kind, label,
    ...(meta.filename ? { filename: meta.filename } : {}),
    rowCount: table.rows.length,
    drafts: rows,
    notes,
    table: { headers: table.headers, rows: table.rows, ctx },
    columns: mapping.columns,
    mappedByAI: mapping.mappedByAI,
  };
}

/** People found in free text (Slack messages) rather than in columns. */
function foundPeoplePart(
  found: FoundPerson[],
  meta: { kind: SourceKind; label: string; now: ISODate; fileDate: ISODate; actor: string; filename?: string; notes: string[] },
): Part {
  const drafts: DraftRow[] = found.map(person => {
    const at = person.at ?? meta.fileDate;
    const draft = blankCandidate(person.name, { now: meta.now, fileDate: at });
    if (person.email) draft.email = person.email;
    if (person.linkedin) draft.linkedin = person.linkedin;
    const source: PersonSource = {
      kind: meta.kind, label: meta.label, at: meta.now,
      ...(person.linkedin ? { url: person.linkedin } : {}),
    };
    draft.source = source;
    for (const body of person.noteBodies) draft.notes.push(makeNote(body, at, meta.actor));
    if (person.channel) draft.tags = [`from #${person.channel}`];
    return {
      draft,
      warnings: person.email ? [] : ['No email address — a Slack export does not carry them. Add a way to contact them before you reach out.'],
    };
  });

  return {
    kind: meta.kind, label: meta.label,
    ...(meta.filename ? { filename: meta.filename } : {}),
    rowCount: found.length,
    drafts,
    notes: meta.notes,
  };
}

// ---------------------------------------------------------------------- files entry

type DroppedFile = File | (Blob & { name: string; lastModified?: number; type?: string });

/**
 * Reads a whole drop — CVs, spreadsheets, JSON exports and Slack zips, mixed together — into
 * one plan. `onProgress` fires per file so "reading 3 of 12…" keeps moving.
 */
export async function buildPlanFromFiles(
  files: DroppedFile[],
  opts?: { onProgress?: (done: number, total: number, label: string) => void; actor?: string },
): Promise<ImportPlan> {
  const actor = opts?.actor ?? DEFAULT_ACTOR;
  const now = new Date().toISOString();
  const total = files.length;
  let done = 0;
  const tick = (label: string) => opts?.onProgress?.(done, total, label);

  const parts: Part[] = [];
  const resumes: ResumeInput[] = [];
  const resumeNotes: string[] = [];
  let resumeVision = 0;

  for (const file of files) {
    const name = file.name || 'file';
    const fileDate = fileDateOf(file, now);
    const shape = shapeOf({ name, type: file.type });

    try {
      if (shape === 'table') {
        const ext = extensionOf(name);
        const cells = ['csv', 'tsv', 'tab'].includes(ext)
          ? parseDelimited(decodeText(await file.arrayBuffer()))
          : await readSpreadsheet(await file.arrayBuffer());
        const table = toTable(cells);
        if (table.headers.length) {
          parts.push(await tablePart(table, { filename: name, now, fileDate, actor }, true));
        } else {
          parts.push(emptyPart(name, `We opened ${name} but there were no columns in it.`));
        }
      } else if (shape === 'json') {
        const table = jsonToTable(JSON.parse(decodeText(await file.arrayBuffer())));
        if (table.headers.length) {
          parts.push(await tablePart(table, { filename: name, now, fileDate, actor }, true));
        } else {
          parts.push(emptyPart(name, `${name} did not hold a list of people we could read. We look for an array of records, or one under "candidates", "data" or "results".`));
        }
      } else if (shape === 'zip') {
        const zip = await readZip(await file.arrayBuffer(), name);
        if (zip.shape === 'slack') {
          parts.push(foundPeoplePart(zip.people, {
            kind: 'slack', label: zip.label, now, fileDate, actor, filename: name, notes: zip.notes,
          }));
        } else if (zip.shape === 'table') {
          for (const t of zip.tables) {
            const table = toTable(t.cells);
            if (!table.headers.length) continue;
            parts.push(await tablePart(table, { filename: t.filename, now, fileDate, actor }, true));
          }
          if (zip.notes.length) parts.push(emptyPart(name, ...zip.notes));
        } else {
          parts.push(emptyPart(name, ...zip.notes));
        }
      } else if (shape === 'document') {
        const ext = extensionOf(name);
        const bytes = await file.arrayBuffer();
        if (ext === 'pdf') {
          // Text layer first. Vision is the fallback, not the default: it costs a model call
          // with a picture attached, and a PDF that has real text in it never needs one.
          let text = '';
          try {
            const pdf = await readPdfText(bytes);
            if (pdf.hasTextLayer) text = pdf.text;
          } catch {
            // pdf.js could not open it at all — a scan, an odd producer, or a damaged file.
            // Falling through to vision is a better answer than giving up on the person.
          }
          if (text) {
            resumes.push({ filename: name, text });
          } else {
            resumeVision++;
            resumes.push({ filename: name, base64: toBase64(bytes), mimeType: 'application/pdf' });
          }
        } else if (ext === 'docx' || ext === 'doc') {
          resumes.push({ filename: name, text: await readDocxText(bytes) });
        } else {
          const text = decodeText(bytes);
          if (looksTabular(text)) {
            const table = toTable(parseDelimited(text));
            parts.push(await tablePart(table, { filename: name, now, fileDate, actor }, true));
          } else {
            resumes.push({ filename: name, text });
          }
        }
      } else {
        parts.push(emptyPart(name, `We do not know how to read ${name}. Drop a CV (PDF or Word), a spreadsheet (CSV or Excel), a JSON export, or a Slack export zip.`));
      }
    } catch (err) {
      parts.push(emptyPart(name, `We could not open ${name}: ${readErrorMessage(err)}. Nothing from it was imported.`));
    }

    done++;
    tick(name);
  }

  if (resumes.length) {
    const label = resumes.length === 1 ? resumes[0].filename : `${resumes.length} résumés`;
    const ctx: ExtractContext = { kind: 'resume', sourceLabel: label, fileDate: now, now, actor };
    const batch = await resumesToDrafts(resumes, ctx, filename => tick(filename));
    if (resumeVision) {
      resumeNotes.push(`${resumeVision} of these PDFs had no text in them — only a picture of the page — so we read them with the AI's vision instead. Check those people over.`);
    }
    if (batch.anyFallback) {
      resumeNotes.push('At least one CV could not be read by the AI. Those people came through with their contact details only.');
    }
    if (batch.rows.length < resumes.length) {
      resumeNotes.push(`${resumes.length - batch.rows.length} CV${resumes.length - batch.rows.length === 1 ? '' : 's'} had nothing in them we could turn into a person.`);
    }
    parts.push({
      kind: 'resume', label,
      ...(resumes.length === 1 ? { filename: resumes[0].filename } : {}),
      rowCount: resumes.length,
      drafts: batch.rows,
      notes: resumeNotes,
    });
  }

  if (!parts.length) {
    parts.push(emptyPart(undefined, 'There were no files to read.'));
  }

  return assemble(parts, {
    actor,
    fallbackLabel: total === 1 ? (files[0]?.name ?? 'One file') : `${total} files`,
  });
}

/**
 * `instanceof Error` is not safe here: a parser loaded from its own chunk can throw an Error
 * built in a different realm, which fails the check and would leave the user with a blank
 * reason. Read the message off whatever came back instead.
 */
function readErrorMessage(err: unknown): string {
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message.trim() ? message : 'the file could not be read';
}

function emptyPart(filename: string | undefined, ...notes: string[]): Part {
  return {
    kind: 'csv',
    label: filename ?? 'Nothing to import',
    ...(filename ? { filename } : {}),
    rowCount: 0,
    drafts: [],
    notes,
  };
}

// ----------------------------------------------------------------------- text entry

const URL_IN_LINE = /https?:\/\/[^\s,;|]+/i;

/** One line of a pasted list: "Jane Doe — Staff SRE at Monzo — linkedin.com/in/janedoe". */
function personFromLine(line: string, ctx: ExtractContext): DraftRow | null {
  const raw = line.trim();
  if (!raw || raw.length > 400) return null;

  const email = normEmail(raw);
  const url = URL_IN_LINE.exec(raw)?.[0];
  const linkedin = linkedinUrl(raw);

  // Strip the machine-readable bits out, and whatever is left is the human part.
  let rest = raw;
  if (url) rest = rest.replace(url, ' ');
  rest = rest.replace(/<?[^\s<>]+@[^\s<>]+>?/g, ' ');
  const bits = rest.split(/\s*[—–\-|,;\t]\s*|\s{2,}/).map(b => b.trim()).filter(Boolean);

  let name = bits[0] ?? '';
  if (name && (name.length > 60 || /^\d/.test(name))) name = '';
  if (!name) name = nameFromSlug(linkedin?.split('/in/')[1]) ?? '';
  if (!name && email) name = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  if (!name) return null;

  const draft = blankCandidate(name, { now: ctx.now, fileDate: ctx.fileDate });
  if (email) draft.email = email;
  if (linkedin) draft.linkedin = linkedin;
  const headline = splitHeadline(bits.slice(1).join(' · '));
  if (headline.title) draft.currentTitle = headline.title;
  if (headline.employer) draft.currentEmployer = headline.employer;
  draft.seniority = seniorityFromTitle(draft.currentTitle);
  draft.source = {
    kind: ctx.kind, label: ctx.sourceLabel, at: ctx.now,
    ...(linkedin ?? url ? { url: (linkedin ?? url) as string } : {}),
  };
  draft.notes.push(makeNote(`Pasted in: “${trimTo(raw, 500)}”`, ctx.now, ctx.actor));
  return { draft, warnings: [] };
}

/** Pasted text: a spreadsheet somebody copied, or a list of names and links. */
export async function buildPlanFromText(text: string, label?: string, opts?: { actor?: string }): Promise<ImportPlan> {
  const actor = opts?.actor ?? DEFAULT_ACTOR;
  const now = new Date().toISOString();
  const body = (text ?? '').trim();

  if (!body) {
    return assemble([emptyPart(undefined, 'There was nothing in that paste to read.')], { actor, fallbackLabel: label ?? 'Pasted text' });
  }

  if (looksTabular(body)) {
    const table = toTable(parseDelimited(body));
    if (table.headers.length) {
      const part = await tablePart(table, { now, fileDate: now, actor, labelHint: label }, true);
      return assemble([part], { actor, fallbackLabel: part.label });
    }
  }

  const sourceLabel = label ?? 'Pasted text';
  const ctx: ExtractContext = { kind: 'manual', sourceLabel, fileDate: now, now, actor };
  const drafts = body
    .split(/\r?\n/)
    .map(line => personFromLine(line, ctx))
    .filter((d): d is DraftRow => !!d);

  const notes = drafts.length
    ? ['We read this as a list of people, one per line. Check the names and job titles before you import — a paste carries a lot less than a proper export.']
    : ['We could not find anybody in that text. Paste one person per line, with a name and ideally an email address or a LinkedIn link.'];

  return assemble([{
    kind: 'manual', label: sourceLabel, rowCount: drafts.length, drafts, notes,
  }], { actor, fallbackLabel: sourceLabel });
}

// -------------------------------------------------------------------------- remap

/**
 * Re-runs extraction and dedupe against a corrected mapping. Pure and fast: the table is
 * already in memory and nothing here touches the network.
 */
export async function remapPlan(plan: ImportPlan, columns: ColumnMapping[]): Promise<ImportPlan> {
  const cached = RAW_CACHE.get(plan.id);
  const actor = cached?.actor ?? DEFAULT_ACTOR;
  const at = new Date().toISOString();

  if (!cached || !cached.tables.length) {
    return {
      ...plan,
      columns: applyCorrections(plan.columns ?? [], columns),
      notes: [...plan.notes, 'This import is not from a spreadsheet, so there are no columns to change.'],
    };
  }

  const drafts: DraftRow[] = [...cached.fixedDrafts];
  let mergedColumns: ColumnMapping[] = [];
  const notes: string[] = [];

  for (const table of cached.tables) {
    const base = plan.columns?.length
      ? plan.columns
      : ruleMapping(table.headers, {}).columns;
    const corrected = applyCorrections(base, columns)
      .filter(c => table.headers.includes(c.column));
    const { rows, skippedRows } = extractRows(table.headers, table.rows, corrected, table.ctx);
    drafts.push(...rows);
    for (const c of corrected) if (!mergedColumns.some(m => m.column === c.column)) mergedColumns.push(c);
    if (skippedRows) {
      notes.push(`${skippedRows} row${skippedRows === 1 ? '' : 's'} had no name and no email with this mapping, so there was nobody to add.`);
    }
    notes.push(...sourceCaveats(table.ctx.sourceLabel, corrected));
  }
  mergedColumns = applyCorrections(mergedColumns, columns);

  const existing = await dataService.list('candidates');
  const { people, foldedNames } = stageAll(drafts, buildIndex(existing), {
    sourceLabel: plan.sourceLabel, at, actor, keyPrefix: 'p',
  });
  if (foldedNames.length) {
    notes.push(`${foldedNames.length} row${foldedNames.length === 1 ? ' was' : 's were'} the same person listed more than once. We kept one of each.`);
  }

  return { ...plan, columns: mergedColumns, people, notes: [...new Set(notes)] };
}

// ------------------------------------------------------------------------ capture

/**
 * The Capture bookmarklet's payload -> one person. The AI structures the visible page text, but
 * a capture must never fail outright: if the model is unavailable we still build the person out
 * of the name, headline, location and URL the bookmarklet sent.
 */
export async function buildPlanFromCapture(draft: CaptureDraft, opts?: { actor?: string }): Promise<ImportPlan> {
  const actor = opts?.actor ?? DEFAULT_ACTOR;
  const now = new Date().toISOString();
  const url = (draft.url ?? '').trim();
  const isLinkedIn = /linkedin\.com/i.test(url) || /linkedin/i.test(draft.site ?? '');
  const site = (draft.site ?? '').trim();
  const label = isLinkedIn ? 'LinkedIn capture' : site ? `${site} capture` : 'Web capture';

  const structured = await askCaptureStructure({
    ...(draft.name ? { name: draft.name } : {}),
    ...(draft.headline ? { headline: draft.headline } : {}),
    ...(draft.location ? { location: draft.location } : {}),
    ...(url ? { url } : {}),
    ...(draft.text ? { text: draft.text } : {}),
    ...(site ? { site } : {}),
  });

  const headline = splitHeadline(draft.headline);
  const name = (structured?.name || draft.name || nameFromSlug(linkedinUrl(url)?.split('/in/')[1]) || '').trim();
  const notes: string[] = [];

  if (!name) {
    return assemble([emptyPart(undefined,
      'There was no name on that page, so there is nobody to add. Open the person\'s own profile page and press the button again.',
    )], { actor, fallbackLabel: label });
  }

  if (!structured) {
    notes.push('The AI could not read that page just now, so we used only the name, headline and link the page gave us. Fill in the rest by hand.');
  }

  const person: Candidate = blankCandidate(name, { now, fileDate: now });
  const title = structured?.currentTitle || headline.title;
  const employer = structured?.currentEmployer || headline.employer;
  if (title) person.currentTitle = title;
  if (employer) person.currentEmployer = employer;
  const location = structured?.location || draft.location;
  if (location) person.location = location.trim();
  if (structured?.skills?.length) person.skills = structured.skills.flatMap(s => parseList(s));
  const li = linkedinUrl(url) ?? linkedinUrl(draft.text);
  if (li) person.linkedin = li;
  const email = normEmail(draft.text);
  if (email) person.email = email;

  const source: PersonSource = {
    kind: 'capture', label, at: now,
    ...(url ? { url } : li ? { url: li } : {}),
  };
  person.source = source;

  if (draft.headline?.trim()) person.notes.push(makeNote(draft.headline.trim(), now, actor));
  if (structured?.summary) person.notes.push(makeNote(structured.summary, now, actor));
  if (draft.text?.trim()) {
    person.notes.push(makeNote(`Captured from ${site || url || 'the page'}: ${trimTo(draft.text.replace(/\s+/g, ' ').trim(), 1200)}`, now, actor));
  }

  notes.push('Captured from a page, so everything here is what was visible on it. There is no email address on a LinkedIn profile — add one before you reach out.');

  return assemble([{
    kind: 'capture', label, rowCount: 1,
    drafts: [{ draft: person, warnings: person.email ? [] : ['No email address on that page.'] }],
    notes,
  }], { actor, fallbackLabel: label });
}

// ------------------------------------------------------- single-person staging path

/** Fills in everything a Candidate needs, from a partial draft the Inbox or Capture has. */
export function completeCandidate(
  partial: Partial<Candidate> & { name: string },
  source: PersonSource,
  now = new Date().toISOString(),
): Candidate {
  const base = blankCandidate(partial.name.trim(), { now, fileDate: source.at || now });
  const merged: Candidate = { ...base, ...partial, name: partial.name.trim() };
  merged.id = partial.id || base.id;
  merged.notes = partial.notes ? [...partial.notes] : [];
  merged.skills = partial.skills ? [...partial.skills] : [];
  merged.tags = partial.tags ? [...partial.tags] : [];
  merged.status = partial.status ?? 'active';
  merged.location = partial.location || base.location;
  merged.currentEmployer = partial.currentEmployer || base.currentEmployer;
  merged.currentTitle = partial.currentTitle || base.currentTitle;
  merged.tenureStart = partial.tenureStart || base.tenureStart;
  merged.seniority = partial.seniority ?? base.seniority;
  merged.warmthAt = partial.warmthAt || base.warmthAt;
  merged.sourceDate = partial.sourceDate || base.sourceDate;
  merged.source = partial.source ?? source;
  merged.createdAt = partial.createdAt || now;
  merged.updatedAt = now;
  const email = normEmail(merged.email);
  if (email) merged.email = email;
  const li = linkedinUrl(merged.linkedin);
  if (li) merged.linkedin = li;
  return merged;
}

/** The same dedupe check an import runs, for one person. */
export async function stagePerson(
  draft: Partial<Candidate> & { name: string },
  source: PersonSource,
): Promise<StagedPerson> {
  const now = new Date().toISOString();
  const person = completeCandidate(draft, source, now);
  const existing = await dataService.list('candidates');
  const { people } = stageAll(
    [{ draft: person, warnings: [] }],
    buildIndex(existing),
    { sourceLabel: source.label, at: now, actor: source.addedBy ?? DEFAULT_ACTOR, keyPrefix: 'one' },
  );
  return people[0];
}

/** Turns already-staged people into a plan and commits it, so the Inbox gets undo for free. */
export function stagedToPlan(
  staged: StagedPerson[],
  source: PersonSource,
  opts?: { label?: string; kind?: SourceKind },
): ImportPlan {
  return {
    id: ulid(),
    kind: opts?.kind ?? source.kind,
    sourceLabel: opts?.label ?? source.label,
    rowCount: staged.length,
    people: staged,
    notes: [],
  };
}
