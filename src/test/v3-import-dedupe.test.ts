/**
 * Dedupe and merge — council/recruiter-v3.md §2.
 *
 * These are the tests that stop the bench becoming a liability. If any of them start failing,
 * the fix is the code, not the test.
 */
import { describe, it, expect } from 'vitest';
import type { Candidate } from '../types';
import { ulid } from '../lib/ulid';
import { buildIndex, findMatch, stageAll } from '../v3/import/dedupe';
import { mergeCandidates } from '../v3/import/merge';
import type { DraftRow } from '../v3/import/extract';

const NOW = '2026-09-09T10:00:00.000Z';

function person(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: ulid(),
    name: 'Kofi Mensah',
    location: 'London, UK',
    currentEmployer: 'Monzo',
    currentTitle: 'Staff SRE',
    tenureStart: '2022-01-01T12:00:00.000Z',
    seniority: 'staff',
    skills: ['Go'],
    tags: [],
    status: 'active',
    warmthAt: '2025-01-01T12:00:00.000Z',
    sourceDate: '2024-03-01T12:00:00.000Z',
    notes: [],
    createdAt: '2024-03-01T12:00:00.000Z',
    updatedAt: '2024-03-01T12:00:00.000Z',
    ...overrides,
  };
}

const ctx = { sourceLabel: 'Greenhouse export', at: NOW, actor: 'owner' };
const row = (draft: Candidate): DraftRow => ({ draft, warnings: [] });

// -------------------------------------------------------------------- the trust ladder

describe('dedupe — the keys a recruiter trusts', () => {
  it('matches on email even when one side carries a +tag', () => {
    const bench = person({ email: 'kofi@example.com' });
    const hit = findMatch(person({ email: 'Kofi+Referrals@Example.com' }), buildIndex([bench]));
    expect(hit?.matchOn).toBe('email');
    expect(hit?.confidence).toBe('exact');
    expect(hit?.existing.id).toBe(bench.id);
  });

  it('matches on the LinkedIn slug whatever the URL around it looks like', () => {
    const bench = person({ linkedin: 'https://www.linkedin.com/in/kofi-mensah' });
    const hit = findMatch(
      person({ name: 'K. Mensah', currentEmployer: 'Starling', linkedin: 'http://uk.linkedin.com/in/Kofi-Mensah/?trk=x' }),
      buildIndex([bench]),
    );
    expect(hit?.matchOn).toBe('linkedin');
    expect(hit?.confidence).toBe('exact');
  });

  it('matches on the last nine digits of a phone number', () => {
    const bench = person({ phone: '+44 20 7123 4567' });
    const hit = findMatch(person({ name: 'Kofi M', currentEmployer: 'Starling', phone: '020 7123 4567' }), buildIndex([bench]));
    expect(hit?.matchOn).toBe('phone');
    expect(hit?.confidence).toBe('exact');
  });

  it('prefers email over every weaker key', () => {
    const byEmail = person({ name: 'Different Name', currentEmployer: 'Elsewhere', email: 'kofi@example.com' });
    const byName = person({ name: 'Kofi Mensah', currentEmployer: 'Monzo' });
    const hit = findMatch(person({ email: 'kofi@example.com' }), buildIndex([byEmail, byName]));
    expect(hit?.existing.id).toBe(byEmail.id);
  });

  it('finds nobody when there is nothing to match on', () => {
    expect(findMatch(person({ name: 'Nobody Here', currentEmployer: 'Nowhere' }), buildIndex([person()]))).toBeUndefined();
  });
});

describe('dedupe — name and employer is a suggestion, never a merge', () => {
  it('NEVER auto-merges on name + employer', () => {
    const bench = person({ name: 'Sarah Chen', currentEmployer: 'Stripe', email: 'sarah.chen@stripe.com' });
    const incoming = person({ name: 'Sarah Chen', currentEmployer: 'Stripe', email: 'sarah@gmail.com' });
    const { people } = stageAll([row(incoming)], buildIndex([bench]), ctx);

    expect(people[0].matchOn).toBe('name+employer');
    expect(people[0].confidence).toBe('probable');
    expect(people[0].decision).toBe('create');
    expect(people[0].explain).toMatch(/probably the same person, your call/);
    expect(people[0].warnings?.join(' ')).toMatch(/never join two records on a name alone/);
  });

  it('there are three Sarah Chens, and all three stay separate', () => {
    const bench = [
      person({ name: 'Sarah Chen', currentEmployer: 'Stripe', email: 'sarah@stripe.com' }),
      person({ name: 'Sarah Chen', currentEmployer: 'Monzo', email: 'sarah@monzo.com' }),
    ];
    const incoming = person({ name: 'Sarah Chen', currentEmployer: 'Stripe', email: 'schen@personal.com' });
    const { people } = stageAll([row(incoming)], buildIndex(bench), ctx);
    expect(people[0].decision).toBe('create');
  });

  it('merges by default on an exact key, and only on an exact key', () => {
    const bench = person({ email: 'kofi@example.com' });
    const { people } = stageAll([row(person({ email: 'kofi@example.com' }))], buildIndex([bench]), ctx);
    expect(people[0].decision).toBe('merge');
  });
});

describe('dedupe — inside one file', () => {
  it('resolves two identical rows in one file to one person', () => {
    const a = person({ email: 'kofi@example.com' });
    const b = person({ email: 'kofi@example.com' });
    const { people, foldedNames } = stageAll([row(a), row(b)], buildIndex([]), ctx);
    expect(people).toHaveLength(1);
    expect(foldedNames).toEqual(['Kofi Mensah']);
  });

  it('folds a second row into the first rather than losing what it carried', () => {
    const a = person({ email: 'kofi@example.com', phone: undefined, skills: ['Go'] });
    const b = person({ email: 'kofi@example.com', phone: '+44 20 7123 4567', skills: ['Kubernetes'] });
    const { people } = stageAll([row(a), row(b)], buildIndex([]), ctx);
    expect(people).toHaveLength(1);
    expect(people[0].draft.phone).toBe('+44 20 7123 4567');
    expect(people[0].draft.skills).toEqual(['Go', 'Kubernetes']);
  });

  it('collapses a byte-identical row with no email or phone at all', () => {
    const a = person({ email: undefined, phone: undefined });
    const b = person({ email: undefined, phone: undefined });
    const { people } = stageAll([row(a), row(b)], buildIndex([]), ctx);
    expect(people).toHaveLength(1);
  });

  it('keeps two different people who share nothing but a first name', () => {
    const a = person({ name: 'Sarah Chen', currentEmployer: 'Stripe', email: 'a@x.com' });
    const b = person({ name: 'Sarah Chen', currentEmployer: 'Monzo', email: 'b@x.com' });
    const { people } = stageAll([row(a), row(b)], buildIndex([]), ctx);
    expect(people).toHaveLength(2);
  });
});

// ----------------------------------------------------------------------- merge rules

describe('merge rules', () => {
  it('never blanks a filled field', () => {
    const existing = person({ email: 'kofi@example.com', phone: '+44 20 7123 4567', location: 'London, UK' });
    const incoming = person({ email: 'kofi@example.com', phone: undefined, location: 'unspecified', currentEmployer: 'Unknown' });
    const { merged } = mergeCandidates(existing, incoming, ctx);
    expect(merged.phone).toBe('+44 20 7123 4567');
    expect(merged.location).toBe('London, UK');
    expect(merged.currentEmployer).toBe('Monzo');
  });

  it('fills a blank field and says so in changedFields', () => {
    const existing = person({ email: undefined, phone: undefined });
    const incoming = person({ email: 'kofi@example.com', phone: '+44 20 7123 4567' });
    const { merged, changedFields } = mergeCandidates(existing, incoming, ctx);
    expect(merged.email).toBe('kofi@example.com');
    expect(changedFields).toContain('email');
    expect(changedFields).toContain('phone');
  });

  it('writes a conflicting value down as a note instead of overwriting it', () => {
    const existing = person({ currentEmployer: 'Monzo' });
    const incoming = person({ currentEmployer: 'Starling' });
    const { merged, changedFields } = mergeCandidates(existing, incoming, ctx);
    expect(merged.currentEmployer).toBe('Monzo');
    expect(merged.notes.some(n => n.body.includes('Starling') && n.body.includes('Greenhouse export'))).toBe(true);
    expect(changedFields).toContain('notes');
  });

  it('records a salary as a dated, sourced note', () => {
    const existing = person();
    const incoming = person({ compAtLastProcess: { amount: 145000, currency: 'GBP', date: '2024-03-01T12:00:00.000Z' } });
    const { merged } = mergeCandidates(existing, incoming, ctx);
    expect(merged.notes.some(n => /£145k as of Mar 2024, from the Greenhouse export/.test(n.body))).toBe(true);
  });

  it('keeps the more recent salary figure when an older one turns up', () => {
    const existing = person({ compAtLastProcess: { amount: 160000, currency: 'GBP', date: '2025-06-01T12:00:00.000Z' } });
    const incoming = person({ compAtLastProcess: { amount: 145000, currency: 'GBP', date: '2024-03-01T12:00:00.000Z' } });
    const { merged } = mergeCandidates(existing, incoming, ctx);
    expect(merged.compAtLastProcess?.amount).toBe(160000);
    expect(merged.notes.some(n => n.body.includes('We kept the more recent'))).toBe(true);
  });

  it('unions skills and tags without duplicating them', () => {
    const existing = person({ skills: ['Go', 'Kubernetes'], tags: ['referral'] });
    const incoming = person({ skills: ['go', 'Terraform'], tags: ['referral', 'silver'] });
    const { merged, changedFields } = mergeCandidates(existing, incoming, ctx);
    expect(merged.skills).toEqual(['Go', 'Kubernetes', 'Terraform']);
    expect(merged.tags).toEqual(['referral', 'silver']);
    expect(changedFields).toContain('skills');
  });

  it('appends notes and never replaces them', () => {
    const existing = person({ notes: [{ id: 'n1', body: 'Said no to relocation', at: NOW, actor: 'owner' }] });
    const incoming = person({ notes: [{ id: 'n2', body: 'Available from March', at: NOW, actor: 'owner' }] });
    const { merged } = mergeCandidates(existing, incoming, ctx);
    expect(merged.notes.map(n => n.body)).toContain('Said no to relocation');
    expect(merged.notes.map(n => n.body)).toContain('Available from March');
  });

  it('do_not_reapproach survives a merge', () => {
    const existing = person({
      status: 'do_not_reapproach',
      statusReason: 'Asked us never to contact her again',
      snoozeUntil: '2027-01-01T12:00:00.000Z',
    });
    const incoming = person({ status: 'active', statusReason: undefined });
    const { merged, changedFields } = mergeCandidates(existing, incoming, ctx);
    expect(merged.status).toBe('do_not_reapproach');
    expect(merged.statusReason).toBe('Asked us never to contact her again');
    expect(merged.snoozeUntil).toBe('2027-01-01T12:00:00.000Z');
    expect(changedFields).not.toContain('bench status');
  });

  it('opted_out survives a merge, and a merge never downgrades a status to active', () => {
    for (const status of ['opted_out', 'took_role', 'silent'] as const) {
      const { merged } = mergeCandidates(person({ status, statusReason: 'on the record' }), person({ status: 'active' }), ctx);
      expect(merged.status).toBe(status);
      expect(merged.statusReason).toBe('on the record');
    }
  });

  it('lets a merge tighten a status but never loosen it', () => {
    const { merged } = mergeCandidates(
      person({ status: 'active' }),
      person({ status: 'opted_out', statusReason: 'Asked to be removed' }),
      ctx,
    );
    expect(merged.status).toBe('opted_out');
    expect(merged.statusReason).toBe('Asked to be removed');
  });

  it('keeps the original consent date through a merge', () => {
    const existing = person({ sourceDate: '2023-01-01T12:00:00.000Z' });
    const incoming = person({ sourceDate: '2026-09-09T12:00:00.000Z' });
    expect(mergeCandidates(existing, incoming, ctx).merged.sourceDate).toBe('2023-01-01T12:00:00.000Z');
  });

  it('keeps the badge they arrived with and notes where else they turned up', () => {
    const existing = person({ source: { kind: 'resume', label: 'kofi.pdf', at: NOW } });
    const incoming = person({ source: { kind: 'ats', label: 'Greenhouse export', at: NOW } });
    const { merged } = mergeCandidates(existing, incoming, ctx);
    expect(merged.source?.label).toBe('kofi.pdf');
    expect(merged.notes.some(n => n.body.includes('They also appear in the Greenhouse export'))).toBe(true);
  });

  it('moves last contact forward but never back', () => {
    const older = person({ warmthAt: '2024-01-01T12:00:00.000Z' });
    const newer = person({ warmthAt: '2026-01-01T12:00:00.000Z' });
    expect(mergeCandidates(older, newer, ctx).merged.warmthAt).toBe('2026-01-01T12:00:00.000Z');
    expect(mergeCandidates(newer, older, ctx).merged.warmthAt).toBe('2026-01-01T12:00:00.000Z');
  });

  it('changes nothing, and says so, when the two records agree', () => {
    const existing = person({ email: 'kofi@example.com' });
    const incoming = { ...existing, id: ulid(), notes: [], source: existing.source };
    expect(mergeCandidates(existing, incoming, ctx).changedFields).toEqual([]);
  });

  it('lists exactly what a merge would change, in plain field names', () => {
    const existing = person({ email: undefined, skills: [] });
    const incoming = person({ email: 'kofi@example.com', skills: ['Go'] });
    const { people } = stageAll([row(incoming)], buildIndex([{ ...existing, phone: '+44 20 7123 4567' }]), ctx);
    // matched on phone, so the preview must say what a merge would do
    expect(people[0].changedFields).toBeDefined();
    expect(people[0].changedFields).toContain('email');
  });

  it('does not treat two spellings of the same email as a conflict', () => {
    const existing = person({ email: 'kofi@example.com' });
    const incoming = person({ email: 'Kofi+Jobs@Example.com' });
    const { merged, changedFields } = mergeCandidates(existing, incoming, ctx);
    expect(merged.email).toBe('kofi@example.com');
    expect(changedFields).toEqual([]);
  });
});
