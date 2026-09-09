/**
 * Rows + a column mapping -> fully-formed people. Pure and synchronous, which is what makes
 * `remapPlan` instant: correcting a column re-runs this, never the network.
 */
import type {
  Candidate, ColumnMapping, ImportFieldKey, ISODate, Note, PersonSource, SourceKind, StagedPerson,
} from '../../types';
import { ulid } from '../../lib/ulid';
import { FIELD_LABELS } from './headers';
import {
  formatMonth, linkedinUrl, normEmail, parseBenchStatus, parseDateLoose, parseList, parseMoney,
  parseSeniority, seniorityFromTitle, stageToFinishedAs, trimTo,
} from './normalize';

export interface ExtractContext {
  kind: SourceKind;
  sourceLabel: string;
  /** The date this file describes — the snapshot date on every comp figure it carries. */
  fileDate: ISODate;
  now: ISODate;
  actor: string;
  filename?: string;
}

export interface DraftRow {
  draft: Candidate;
  process?: StagedPerson['process'];
  warnings: string[];
}

export interface ExtractResult {
  rows: DraftRow[];
  /** Rows with nothing usable in them — reported honestly rather than silently dropped. */
  skippedRows: number;
}

const ARRAY_FIELDS: ('skills' | 'tags')[] = ['skills', 'tags'];

/** column index lookup: field -> every column that maps to it, in file order. */
function indexColumns(headers: string[], columns: ColumnMapping[]): Map<ImportFieldKey, number[]> {
  const byHeader = new Map<string, ImportFieldKey>();
  for (const c of columns) if (!byHeader.has(c.column)) byHeader.set(c.column, c.field);
  const out = new Map<ImportFieldKey, number[]>();
  headers.forEach((h, i) => {
    const field = byHeader.get(h);
    if (!field || field === 'skip') return;
    const list = out.get(field) ?? [];
    list.push(i);
    out.set(field, list);
  });
  return out;
}

/** Builds a blank, valid Candidate. Every required field has an honest placeholder. */
export function blankCandidate(name: string, ctx: { now: ISODate; fileDate: ISODate }): Candidate {
  return {
    id: ulid(),
    name,
    location: 'unspecified',
    currentEmployer: 'Unknown',
    currentTitle: 'Unknown',
    tenureStart: ctx.fileDate,
    seniority: 'mid',
    skills: [],
    tags: [],
    status: 'active',
    warmthAt: ctx.fileDate,
    sourceDate: ctx.fileDate,
    notes: [],
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
}

export function makeNote(body: string, at: ISODate, actor: string): Note {
  return { id: ulid(), body, at, actor };
}

/**
 * Turns one table into people. A row with no readable name is counted and skipped — we never
 * invent a name to keep a row alive.
 */
export function extractRows(
  headers: string[],
  rows: string[][],
  columns: ColumnMapping[],
  ctx: ExtractContext,
): ExtractResult {
  const index = indexColumns(headers, columns);
  const first = (field: ImportFieldKey): ((row: string[]) => string) => {
    const cols = index.get(field) ?? [];
    return (row: string[]) => {
      for (const i of cols) {
        const v = (row[i] ?? '').trim();
        if (v) return v;
      }
      return '';
    };
  };
  const joined = (field: ImportFieldKey, sep = ' · '): ((row: string[]) => string) => {
    const cols = index.get(field) ?? [];
    return (row: string[]) => cols.map(i => (row[i] ?? '').trim()).filter(Boolean).join(sep);
  };
  const all = (field: ImportFieldKey): ((row: string[]) => string[]) => {
    const cols = index.get(field) ?? [];
    return (row: string[]) => cols.map(i => (row[i] ?? '').trim()).filter(Boolean);
  };

  const get = {
    name: first('name'), firstName: first('firstName'), lastName: first('lastName'),
    email: first('email'), phone: first('phone'), linkedin: first('linkedin'),
    location: first('location'), employer: first('currentEmployer'), title: first('currentTitle'),
    seniority: first('seniority'), tenureStart: first('tenureStart'),
    compExpectation: first('compExpectation'), compAtLastProcess: first('compAtLastProcess'),
    notice: first('noticePeriodDays'), sourceUrl: first('sourceUrl'),
    status: first('status'), statusReason: first('statusReason'),
    processRole: first('processRole'), processStage: joined('processStage'),
    processReason: first('processReason'), processDate: first('processDate'),
    processLostTo: first('processLostTo'),
    skills: all('skills'), tags: all('tags'), notes: all('notes'),
  };

  const out: DraftRow[] = [];
  let skippedRows = 0;

  for (const row of rows) {
    const warnings: string[] = [];
    let name = get.name(row);
    if (!name) {
      const fn = get.firstName(row);
      const ln = get.lastName(row);
      name = [fn, ln].filter(Boolean).join(' ').trim();
    }
    const email = normEmail(get.email(row));
    const linkedin = linkedinUrl(get.linkedin(row)) ?? (/^https?:\/\//i.test(get.linkedin(row)) ? get.linkedin(row) : undefined);
    if (!name) {
      // A row with no name but a real identity key still describes a person we can find later.
      if (email) name = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      else { skippedRows++; continue; }
      warnings.push('This row had no name column — we used the email address instead.');
    }

    const processDate = parseDateLoose(get.processDate(row));
    const fileDate = processDate ?? ctx.fileDate;
    const draft = blankCandidate(name.trim(), { now: ctx.now, fileDate });

    if (email) draft.email = email;
    const phone = get.phone(row);
    if (phone) draft.phone = phone.trim();
    if (linkedin) draft.linkedin = linkedin;

    const location = get.location(row);
    if (location) draft.location = location;
    const employer = get.employer(row);
    if (employer) draft.currentEmployer = employer;
    const title = get.title(row);
    if (title) draft.currentTitle = title;

    draft.seniority = parseSeniority(get.seniority(row)) ?? seniorityFromTitle(title);

    const tenure = parseDateLoose(get.tenureStart(row));
    if (tenure) draft.tenureStart = tenure;

    for (const field of ARRAY_FIELDS) {
      const values = field === 'skills' ? get.skills(row) : get.tags(row);
      const parsed = values.flatMap(v => parseList(v));
      if (parsed.length) draft[field] = parsed;
    }

    const wants = parseMoney(get.compExpectation(row), fileDate);
    if (wants) draft.compExpectation = wants;
    const had = parseMoney(get.compAtLastProcess(row), fileDate);
    if (had) draft.compAtLastProcess = had;

    const notice = get.notice(row);
    if (notice) {
      const days = /(\d+)\s*(week|wk|month|mo|day)?/i.exec(notice);
      if (days) {
        const n = Number(days[1]);
        const unit = (days[2] ?? 'day').toLowerCase();
        draft.noticePeriodDays = unit.startsWith('w') ? n * 7 : unit.startsWith('m') ? n * 30 : n;
      }
    }

    // A bench status column only ever tightens what we are allowed to do with this person.
    const strict = parseBenchStatus(`${get.status(row)} ${get.statusReason(row)}`);
    if (strict) {
      draft.status = strict.status;
      draft.statusReason = get.statusReason(row) || strict.reason;
    }

    for (const body of get.notes(row)) {
      draft.notes.push(makeNote(trimTo(body, 4000), fileDate, ctx.actor));
    }

    const url = get.sourceUrl(row) || draft.linkedin;
    const source: PersonSource = {
      kind: ctx.kind,
      label: ctx.sourceLabel,
      at: ctx.now,
      ...(url && /^https?:\/\//i.test(url) ? { url } : {}),
    };
    draft.source = source;
    draft.warmthAt = fileDate;
    draft.sourceDate = fileDate;

    // The candidacy this row describes. A job title is what makes it a candidacy at all.
    const roleTitle = get.processRole(row);
    const stage = get.processStage(row);
    const reason = get.processReason(row);
    const lostTo = get.processLostTo(row);
    let process: StagedPerson['process'];
    if (roleTitle) {
      process = {
        date: fileDate,
        finishedAs: stageToFinishedAs(stage, reason) ?? 'shortlist',
        // Verbatim. This sentence is the product; it is never rewritten or summarised.
        reason: reason.trim(),
        ...(lostTo ? { lostTo: lostTo.trim() } : {}),
        roleTitle: roleTitle.trim(),
      };
    } else if (stage || reason) {
      const bits = [
        stage ? `${FIELD_LABELS.processStage}: ${stage}` : '',
        reason ? `${FIELD_LABELS.processReason}: ${reason}` : '',
      ].filter(Boolean).join('. ');
      draft.notes.push(makeNote(`${bits}. From the ${ctx.sourceLabel}, ${formatMonth(fileDate)}.`, fileDate, ctx.actor));
    }

    out.push({ draft, process, warnings });
  }

  return { rows: out, skippedRows };
}
