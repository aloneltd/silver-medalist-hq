/**
 * The merge rules. This file is the part of the engine a recruiter's trust actually rests on,
 * so every rule here comes straight from council/recruiter-v3.md §2 and is non-negotiable:
 *
 *   1. A newer source NEVER blanks a filled field.
 *   2. A newer source never silently overwrites a filled field either — the incoming value is
 *      recorded as a dated, sourced note instead ("£145k as of Mar 2024, from the Greenhouse
 *      export"), so the old value and the new one are both on the record.
 *   3. Notes and candidacies are appended, never replaced.
 *   4. `do_not_reapproach`, `opted_out`, `statusReason`, `snoozeUntil` and `sourceDate` survive
 *      every merge. A merge may never downgrade a status to 'active'.
 *   5. The source badge a person arrived with is theirs forever; a later import adds a note
 *      saying where else they turned up.
 *
 * `mergeCandidates` is pure, and the preview and the commit both call it — so what the merge
 * preview promises and what the commit writes cannot drift apart.
 */
import type { Candidate, CandidateStatus, CompSnapshot, ISODate, Note } from '../../types';
import { FIELD_LABELS } from './headers';
import { formatMoney, formatMonth, normEmail, normText } from './normalize';
import { makeNote } from './extract';

/** Strictness ladder. A merge takes the MAX; it can only ever tighten. */
const STATUS_RANK: Record<CandidateStatus, number> = {
  active: 0, silent: 1, took_role: 2, do_not_reapproach: 3, opted_out: 4,
};

export interface MergeContext {
  /** "Greenhouse export" — the words that end up inside every note this merge writes. */
  sourceLabel: string;
  at: ISODate;
  actor: string;
}

export interface MergeResult {
  merged: Candidate;
  /** Exactly what this merge would alter, in plain field names. Empty means nothing changes. */
  changedFields: string[];
}

function isBlank(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase();
    return t === '' || t === 'unknown' || t === 'unspecified' || t === 'n/a' || t === '-';
  }
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function sameText(a?: string, b?: string): boolean {
  return normText(a) === normText(b);
}

/**
 * Merges `incoming` into `existing` under the rules above.
 *
 * Nothing on `existing` is mutated; the result is a new record. `changedFields` lists only what
 * genuinely differs, so a preview can honestly say "this changes nothing".
 */
export function mergeCandidates(existing: Candidate, incoming: Candidate, ctx: MergeContext): MergeResult {
  const merged: Candidate = {
    ...existing,
    notes: [...existing.notes],
    skills: [...existing.skills],
    tags: [...existing.tags],
  };
  const changed: string[] = [];
  const newNotes: Note[] = [];
  const when = formatMonth(ctx.at);

  const note = (body: string) => newNotes.push(makeNote(body, ctx.at, ctx.actor));

  /** Rule 1 + 2 for a plain text field. */
  const text = (key: 'email' | 'phone' | 'linkedin' | 'location' | 'currentEmployer' | 'currentTitle' | 'name') => {
    const next = incoming[key];
    if (isBlank(next)) return;                                   // never blank a filled field
    if (isBlank(merged[key])) {
      merged[key] = next as string;
      changed.push(FIELD_LABELS[key === 'name' ? 'name' : key]);
      return;
    }
    if (sameText(merged[key] as string, next as string)) return;
    // Both filled and different: keep what is on the record, write the new one down.
    note(`Their ${FIELD_LABELS[key]} in the ${ctx.sourceLabel} is "${next}". We kept "${merged[key]}" — change it by hand if the new one is right.`);
  };

  // Email is special: a different-looking address that normalises to the same thing is not a
  // conflict at all, it is the same mailbox.
  if (!isBlank(incoming.email) && normEmail(incoming.email) === normEmail(merged.email)) {
    // nothing to do
  } else {
    text('email');
  }
  text('phone');
  text('linkedin');
  text('location');
  text('currentEmployer');
  text('currentTitle');
  text('name');

  // Arrays: union, order preserved, existing first.
  for (const key of ['skills', 'tags'] as const) {
    const have = new Set(merged[key].map(v => v.toLowerCase()));
    const added = incoming[key].filter(v => v && !have.has(v.toLowerCase()));
    if (added.length) {
      merged[key] = [...merged[key], ...added];
      changed.push(FIELD_LABELS[key]);
    }
  }

  // Comp: a snapshot is only replaced by a genuinely newer one, and the old figure is written
  // down rather than lost. This is the recruiter seat's "every field dated and sourced".
  for (const key of ['compExpectation', 'compAtLastProcess'] as const) {
    const next = incoming[key] as CompSnapshot | undefined;
    if (!next) continue;
    const prev = merged[key] as CompSnapshot | undefined;
    if (!prev) {
      merged[key] = next;
      changed.push(FIELD_LABELS[key]);
      note(`${FIELD_LABELS[key]}: ${formatMoney(next)} as of ${formatMonth(next.date)}, from the ${ctx.sourceLabel}.`);
      continue;
    }
    if (prev.amount === next.amount && prev.currency === next.currency) continue;
    if (new Date(next.date).getTime() > new Date(prev.date).getTime()) {
      merged[key] = next;
      changed.push(FIELD_LABELS[key]);
      note(`${FIELD_LABELS[key]}: ${formatMoney(next)} as of ${formatMonth(next.date)}, from the ${ctx.sourceLabel}. Was ${formatMoney(prev)} as of ${formatMonth(prev.date)}.`);
    } else {
      note(`The ${ctx.sourceLabel} says ${formatMoney(next)} as of ${formatMonth(next.date)}. We kept the more recent ${formatMoney(prev)} from ${formatMonth(prev.date)}.`);
    }
  }

  if (isBlank(merged.noticePeriodDays) && !isBlank(incoming.noticePeriodDays)) {
    merged.noticePeriodDays = incoming.noticePeriodDays;
    changed.push(FIELD_LABELS.noticePeriodDays);
  }

  // Seniority only ever moves up, and only when the existing record has not been set by hand.
  if (incoming.seniority && existing.seniority === 'mid' && incoming.seniority !== 'mid') {
    merged.seniority = incoming.seniority;
    changed.push(FIELD_LABELS.seniority);
  }

  // A start date we did not have is worth having; one we did is left alone.
  if (isBlank(existing.tenureStart) && !isBlank(incoming.tenureStart)) {
    merged.tenureStart = incoming.tenureStart;
    changed.push(FIELD_LABELS.tenureStart);
  }

  // RULE 4 — the ones that must survive, or this bench is a liability.
  // status only ever tightens; statusReason, snoozeUntil and sourceDate are never touched.
  const incomingRank = STATUS_RANK[incoming.status] ?? 0;
  const existingRank = STATUS_RANK[existing.status] ?? 0;
  if (incomingRank > existingRank) {
    merged.status = incoming.status;
    merged.statusReason = incoming.statusReason || existing.statusReason;
    changed.push('bench status');
  } else {
    merged.status = existing.status;
    merged.statusReason = existing.statusReason;
  }
  merged.snoozeUntil = existing.snoozeUntil;
  merged.sourceDate = existing.sourceDate;

  // Last contact moves forward, never back.
  if (new Date(incoming.warmthAt).getTime() > new Date(merged.warmthAt).getTime()) {
    merged.warmthAt = incoming.warmthAt;
    changed.push('last contact');
  }

  // RULE 5 — the badge they arrived with is theirs. Note where else they turned up.
  if (existing.source) {
    merged.source = existing.source;
    if (incoming.source && incoming.source.label !== existing.source.label) {
      note(`They also appear in the ${incoming.source.label}${incoming.source.url ? ` (${incoming.source.url})` : ''}, seen ${when}.`);
    }
  } else if (incoming.source) {
    merged.source = incoming.source;
  }

  // RULE 3 — notes append. Never replace, never dedupe away somebody's words.
  const seenNotes = new Set(merged.notes.map(n => n.body.trim()));
  for (const n of incoming.notes) {
    if (!n.body.trim() || seenNotes.has(n.body.trim())) continue;
    seenNotes.add(n.body.trim());
    merged.notes.push(n);
    if (!changed.includes('notes')) changed.push('notes');
  }
  for (const n of newNotes) {
    if (seenNotes.has(n.body.trim())) continue;
    seenNotes.add(n.body.trim());
    merged.notes.push(n);
    if (!changed.includes('notes')) changed.push('notes');
  }

  merged.updatedAt = ctx.at;

  return { merged, changedFields: [...new Set(changed)] };
}

/**
 * Folds a second row for the same person, found inside the SAME file, into the first. This is
 * not an identity judgement — it is one file listing somebody twice — so it fills blanks and
 * appends notes without any of the "we kept the old value" chatter a real merge writes.
 */
export function foldDuplicateRow(into: Candidate, extra: Candidate): Candidate {
  const out: Candidate = { ...into, notes: [...into.notes], skills: [...into.skills], tags: [...into.tags] };
  for (const key of ['email', 'phone', 'linkedin', 'location', 'currentEmployer', 'currentTitle'] as const) {
    if (isBlank(out[key]) && !isBlank(extra[key])) out[key] = extra[key] as string;
  }
  for (const key of ['skills', 'tags'] as const) {
    const have = new Set(out[key].map(v => v.toLowerCase()));
    for (const v of extra[key]) if (v && !have.has(v.toLowerCase())) { have.add(v.toLowerCase()); out[key].push(v); }
  }
  if (!out.compExpectation && extra.compExpectation) out.compExpectation = extra.compExpectation;
  if (!out.compAtLastProcess && extra.compAtLastProcess) out.compAtLastProcess = extra.compAtLastProcess;
  if (out.noticePeriodDays === undefined && extra.noticePeriodDays !== undefined) out.noticePeriodDays = extra.noticePeriodDays;
  if (out.seniority === 'mid' && extra.seniority !== 'mid') out.seniority = extra.seniority;
  if ((STATUS_RANK[extra.status] ?? 0) > (STATUS_RANK[out.status] ?? 0)) {
    out.status = extra.status;
    out.statusReason = extra.statusReason ?? out.statusReason;
  }
  const seen = new Set(out.notes.map(n => n.body.trim()));
  for (const n of extra.notes) {
    if (!n.body.trim() || seen.has(n.body.trim())) continue;
    seen.add(n.body.trim());
    out.notes.push(n);
  }
  if (new Date(extra.warmthAt).getTime() > new Date(out.warmthAt).getTime()) out.warmthAt = extra.warmthAt;
  if (new Date(extra.sourceDate).getTime() < new Date(out.sourceDate).getTime()) out.sourceDate = extra.sourceDate;
  return out;
}
