/**
 * Dedupe — council/recruiter-v3.md §2, implemented exactly as written.
 *
 * TRUSTED, in order: normalised email · LinkedIn slug · E.164-ish phone. A hit on any of these
 * is `confidence: 'exact'` and `decision: 'merge'`.
 *
 * NOT TRUSTED: name + employer. It is a suggestion, `confidence: 'probable'`, and always
 * `decision: 'create'`. "I have three Sarah Chens." Nothing in this file may ever auto-merge
 * on it, and there is a test that fails if that changes.
 *
 * Dedupe runs against the existing bench AND within the same file — two identical rows in one
 * CSV resolve to one person.
 */
import type { Candidate, DedupeKey, StagedPerson } from '../../types';
import { linkedinSlug, nameEmployerKey, normEmail, phoneKey } from './normalize';
import { foldDuplicateRow, mergeCandidates, type MergeContext } from './merge';
import type { DraftRow } from './extract';

export interface DedupeIndex {
  email: Map<string, Candidate>;
  linkedin: Map<string, Candidate>;
  phone: Map<string, Candidate>;
  nameEmployer: Map<string, Candidate>;
}

export function emptyIndex(): DedupeIndex {
  return { email: new Map(), linkedin: new Map(), phone: new Map(), nameEmployer: new Map() };
}

/** Adds one person to every key they can be found by. First writer wins on collisions. */
export function indexPerson(index: DedupeIndex, c: Candidate): void {
  const e = normEmail(c.email);
  if (e && !index.email.has(e)) index.email.set(e, c);
  const l = linkedinSlug(c.linkedin);
  if (l && !index.linkedin.has(l)) index.linkedin.set(l, c);
  const p = phoneKey(c.phone);
  if (p && !index.phone.has(p)) index.phone.set(p, c);
  const ne = nameEmployerKey(c.name, c.currentEmployer);
  if (ne && !index.nameEmployer.has(ne)) index.nameEmployer.set(ne, c);
}

export function buildIndex(existing: Candidate[]): DedupeIndex {
  const index = emptyIndex();
  for (const c of existing) indexPerson(index, c);
  return index;
}

export interface DedupeHit {
  existing: Candidate;
  matchOn: DedupeKey;
  confidence: 'exact' | 'probable';
  explain: string;
}

/** The trust ladder, walked in order. Returns undefined when nobody looks like this person. */
export function findMatch(draft: Candidate, index: DedupeIndex): DedupeHit | undefined {
  const e = normEmail(draft.email);
  if (e) {
    const hit = index.email.get(e);
    if (hit) {
      return {
        existing: hit, matchOn: 'email', confidence: 'exact',
        explain: `Same email address (${e}) as ${hit.name}, already on your bench.`,
      };
    }
  }

  const l = linkedinSlug(draft.linkedin);
  if (l) {
    const hit = index.linkedin.get(l);
    if (hit) {
      return {
        existing: hit, matchOn: 'linkedin', confidence: 'exact',
        explain: `Same LinkedIn profile (/in/${l}) as ${hit.name}, already on your bench.`,
      };
    }
  }

  const p = phoneKey(draft.phone);
  if (p) {
    const hit = index.phone.get(p);
    if (hit) {
      return {
        existing: hit, matchOn: 'phone', confidence: 'exact',
        explain: `Same phone number as ${hit.name}, already on your bench.`,
      };
    }
  }

  const ne = nameEmployerKey(draft.name, draft.currentEmployer);
  if (ne) {
    const hit = index.nameEmployer.get(ne);
    if (hit) {
      return {
        existing: hit, matchOn: 'name+employer', confidence: 'probable',
        explain: `Same name and employer as ${hit.name} at ${hit.currentEmployer}, but a different email — probably the same person, your call.`,
      };
    }
  }

  return undefined;
}

/** True when two drafts are, cell for cell, the same row written twice. */
function sameRow(a: Candidate, b: Candidate): boolean {
  const key = (c: Candidate) => [
    c.name.trim().toLowerCase(), (c.email ?? '').toLowerCase(), (c.phone ?? '').replace(/\D/g, ''),
    (c.linkedin ?? '').toLowerCase(), c.currentEmployer.trim().toLowerCase(),
    c.currentTitle.trim().toLowerCase(), c.location.trim().toLowerCase(),
  ].join('|');
  return key(a) === key(b);
}

export interface StageOptions extends MergeContext {
  /** How many rows the same file already contributed — used only for the stable React key. */
  keyPrefix?: string;
}

export interface StageResult {
  people: StagedPerson[];
  /** Names of rows folded into an earlier row of the same file. */
  foldedNames: string[];
}

/**
 * Resolves a whole file's worth of drafts against the bench and against each other.
 *
 * Within-file duplicates are folded into the first occurrence and dropped from the list, so the
 * preview shows one card per person and the commit writes one record. v2 shipped the bug where
 * both rows were created; the fold below, plus `foldedNames`, is what stops it coming back.
 */
export function stageAll(drafts: DraftRow[], index: DedupeIndex, opts: StageOptions): StageResult {
  const people: StagedPerson[] = [];
  const foldedNames: string[] = [];
  const prefix = opts.keyPrefix ?? 'row';

  // Rows resolved so far in THIS file, so row 7 can find row 2.
  const inFile = new Map<string, StagedPerson>();
  const localKeys = (c: Candidate): string[] => {
    const keys: string[] = [];
    const e = normEmail(c.email);
    if (e) keys.push(`e:${e}`);
    const l = linkedinSlug(c.linkedin);
    if (l) keys.push(`l:${l}`);
    const p = phoneKey(c.phone);
    if (p) keys.push(`p:${p}`);
    return keys;
  };

  drafts.forEach((row, i) => {
    const keys = localKeys(row.draft);
    const ne = nameEmployerKey(row.draft.name, row.draft.currentEmployer);

    // Same person, twice, in one file — trusted keys, or a byte-identical row.
    let twin = keys.map(k => inFile.get(k)).find(Boolean);
    if (!twin && ne) {
      const candidate = inFile.get(`n:${ne}`);
      if (candidate && sameRow(candidate.draft, row.draft)) twin = candidate;
    }
    if (twin) {
      twin.draft = foldDuplicateRow(twin.draft, row.draft);
      if (row.process) {
        // Two candidacies for the same person are both real — keep the further-along one on the
        // staged row and write the other down so nothing is lost.
        if (!twin.process) twin.process = row.process;
        else if (row.process.reason && row.process.reason !== twin.process.reason) {
          twin.draft.notes.push({
            id: `${twin.draft.id}-dup${i}`,
            body: `Also in this file: ${row.process.roleTitle ?? 'another job'} — ${row.process.reason}`,
            at: row.process.date, actor: opts.actor,
          });
        }
      }
      foldedNames.push(row.draft.name);
      for (const k of localKeys(twin.draft)) inFile.set(k, twin);
      const twinNe = nameEmployerKey(twin.draft.name, twin.draft.currentEmployer);
      if (twinNe) inFile.set(`n:${twinNe}`, twin);
      return;
    }

    const hit = findMatch(row.draft, index);
    const staged: StagedPerson = {
      key: `${prefix}-${i}`,
      draft: row.draft,
      ...(row.process ? { process: row.process } : {}),
      decision: 'create',
      ...(row.warnings.length ? { warnings: [...row.warnings] } : {}),
    };

    if (hit) {
      staged.existing = hit.existing;
      staged.matchOn = hit.matchOn;
      staged.confidence = hit.confidence;
      staged.explain = hit.explain;
      staged.changedFields = mergeCandidates(hit.existing, row.draft, opts).changedFields;
      // Exact keys merge by default. name+employer NEVER does.
      staged.decision = hit.confidence === 'exact' ? 'merge' : 'create';
      if (hit.confidence === 'probable') {
        staged.warnings = [
          ...(staged.warnings ?? []),
          'We will add this person as new unless you say they are the same one. We never join two records on a name alone.',
        ];
      }
    }

    people.push(staged);
    for (const k of localKeys(row.draft)) inFile.set(k, staged);
    if (ne) inFile.set(`n:${ne}`, staged);
  });

  return { people, foldedNames };
}

/** Re-runs `changedFields` after a user changed a decision or a mapping. */
export function refreshChangedFields(person: StagedPerson, ctx: MergeContext): StagedPerson {
  if (!person.existing) return person;
  return { ...person, changedFields: mergeCandidates(person.existing, person.draft, ctx).changedFields };
}
