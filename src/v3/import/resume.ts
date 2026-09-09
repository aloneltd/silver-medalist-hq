/**
 * Résumés -> people.
 *
 * The ladder the brief requires: text layer first, vision only when a PDF has no text layer at
 * all. Model calls are batched three at a time and memoised by content, so a folder of twelve
 * CVs is three rounds of work, not twelve simultaneous requests into a free tier.
 */
import type { Candidate, ISODate, Seniority } from '../../types';
import { askResumeFromImage, askResumeFromText, mapWithLimit, type ResumeFields } from './ai';
import { blankCandidate, makeNote, type DraftRow, type ExtractContext } from './extract';
import {
  linkedinUrl, normEmail, parseList, seniorityFromTitle, splitHeadline, trimTo,
} from './normalize';

/** At most this many model calls in flight at once. */
export const RESUME_CONCURRENCY = 3;

export interface ResumeInput {
  filename: string;
  /** Extracted text, when the file had a text layer. */
  text?: string;
  /** Base64 bytes, for the vision path when it did not. */
  base64?: string;
  mimeType?: string;
}

const SENIORITIES = new Set<string>(['junior', 'mid', 'senior', 'staff', 'principal', 'exec']);

/**
 * What we can read out of a CV with no model at all: the contact details, and a first line that
 * looks like a name. Deliberately shy — a wrong employer is worse than a blank one.
 */
export function fallbackResumeFields(text: string): ResumeFields | null {
  const clean = (text ?? '').replace(/\r/g, '');
  if (!clean.trim()) return null;
  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);

  let name = '';
  for (const line of lines.slice(0, 12)) {
    if (line.length > 60 || /[@|]|https?:|\d{4}/.test(line)) continue;
    const words = line.split(/\s+/);
    if (words.length < 2 || words.length > 4) continue;
    if (!words.every(w => /^[A-ZÀ-Þ][\p{L}'’.-]*$/u.test(w))) continue;
    name = line;
    break;
  }
  if (!name) {
    const email = normEmail(clean);
    if (!email) return null;
    name = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  // The line under the name is usually "Staff SRE at Monzo". Skip anything holding an
  // email address, which also contains an "@".
  const headlineLine = lines.slice(1, 15).find(
    l => l.length < 90 && /\sat\s/i.test(l) && !/[\w.-]+@[\w.-]+\.\w{2,}/.test(l),
  );
  const headline = splitHeadline(headlineLine);

  const fields: ResumeFields = { name };
  const email = normEmail(clean);
  if (email) fields.email = email;
  const phone = /(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?){2,4}\d{2,4}/.exec(clean.replace(/[\u00a0\u202f]/g, ' '));
  if (phone && phone[0].replace(/\D/g, '').length >= 9) fields.phone = phone[0].trim();
  const li = linkedinUrl(clean);
  if (li) fields.linkedin = li;
  if (headline.title) fields.currentTitle = headline.title;
  if (headline.employer) fields.currentEmployer = headline.employer;
  return fields;
}

function seniorityOf(value: unknown, title?: string): Seniority {
  if (typeof value === 'string' && SENIORITIES.has(value)) return value as Seniority;
  return seniorityFromTitle(title);
}

/** Turns whatever we managed to read into a full Candidate. */
export function fieldsToDraft(
  fields: ResumeFields,
  ctx: ExtractContext,
  opts: { filename: string; usedAi: boolean; text?: string },
): DraftRow {
  const warnings: string[] = [];
  const draft: Candidate = blankCandidate(fields.name.trim(), { now: ctx.now, fileDate: ctx.fileDate });

  const email = normEmail(fields.email);
  if (email) draft.email = email;
  if (fields.phone) draft.phone = String(fields.phone).trim();
  const li = linkedinUrl(fields.linkedin);
  if (li) draft.linkedin = li;
  if (fields.location) draft.location = String(fields.location);
  if (fields.currentEmployer) draft.currentEmployer = String(fields.currentEmployer);
  if (fields.currentTitle) draft.currentTitle = String(fields.currentTitle);
  draft.seniority = seniorityOf(fields.seniority, draft.currentTitle);
  if (Array.isArray(fields.skills)) draft.skills = fields.skills.flatMap(s => parseList(s));
  if (fields.tenureStart) draft.tenureStart = String(fields.tenureStart);
  if (fields.compExpectation && typeof fields.compExpectation.amount === 'number') {
    draft.compExpectation = { ...fields.compExpectation, date: fields.compExpectation.date || ctx.fileDate };
  }
  if (Array.isArray(fields.tags)) draft.tags = fields.tags.filter(t => typeof t === 'string');

  draft.source = { kind: ctx.kind, label: ctx.sourceLabel, url: opts.filename, at: ctx.now };
  draft.notes.push(makeNote(`Added from ${opts.filename}.`, ctx.now, ctx.actor));

  if (!opts.usedAi) {
    warnings.push('We could not read this CV with the AI, so only the contact details were picked up. Check their job title and employer before you use them.');
  }
  if (!draft.email && !draft.linkedin) {
    warnings.push('No email address or LinkedIn link in this CV — you will need a way to contact them.');
  }

  return { draft, warnings };
}

export interface ResumeBatchResult {
  rows: DraftRow[];
  /** True when at least one CV had to fall back to the no-AI reader. */
  anyFallback: boolean;
  /** True when at least one PDF had no text layer and went through the vision reader. */
  anyVision: boolean;
}

/**
 * The batched path. `onOne` fires per CV so the "reading 3 of 12…" line keeps moving even
 * while three calls are in flight.
 */
export async function resumesToDrafts(
  inputs: ResumeInput[],
  ctx: ExtractContext,
  onOne?: (filename: string) => void,
): Promise<ResumeBatchResult> {
  let anyFallback = false;
  let anyVision = false;

  const rows = await mapWithLimit(inputs, RESUME_CONCURRENCY, async input => {
    let fields: ResumeFields | null = null;
    let usedAi = false;

    if (input.text && input.text.trim()) {
      fields = await askResumeFromText(input.text, input.filename);
      usedAi = !!fields;
      if (!fields) fields = fallbackResumeFields(input.text);
    } else if (input.base64) {
      anyVision = true;
      fields = await askResumeFromImage(input.base64, input.mimeType ?? 'application/pdf', input.filename);
      usedAi = !!fields;
    }

    onOne?.(input.filename);
    if (!fields) {
      anyFallback = true;
      return null;
    }
    if (!usedAi) anyFallback = true;

    const row = fieldsToDraft(fields, ctx, { filename: input.filename, usedAi, text: input.text });
    if (input.text) {
      // The CV's own words, kept on the record so nothing about them is only in our summary.
      row.draft.notes.push(makeNote(`From ${input.filename}: ${trimTo(input.text.replace(/\s+/g, ' ').trim(), 1500)}`, ctx.now, ctx.actor));
    }
    return row;
  });

  return { rows: rows.filter((r): r is DraftRow => !!r), anyFallback, anyVision };
}

/** The date a dropped file describes: its own last-modified stamp, else today. */
export function fileDateOf(file: { lastModified?: number }, fallback: ISODate): ISODate {
  const ms = file.lastModified;
  if (!ms || !Number.isFinite(ms)) return fallback;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 86_400_000) return fallback;
  return d.toISOString();
}
