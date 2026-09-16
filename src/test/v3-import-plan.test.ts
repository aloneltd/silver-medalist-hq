/**
 * Building a plan out of a real drop: CSV, XLSX, JSON, a Slack export zip, pasted text and a
 * Capture payload. Every one of these runs with the network refused, so what is tested here is
 * what a user gets when the AI is unavailable — which must still be a working import.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db/schema';
import type { Candidate } from '../types';
import { ulid } from '../lib/ulid';
import {
  buildPlanFromCapture, buildPlanFromFiles, buildPlanFromText, remapPlan,
} from '../v3/import';
import { forgetPlans } from '../v3/import/plan';
import { clearAiCache } from '../v3/import/ai';

const GREENHOUSE_CSV = [
  'Candidate ID,First Name,Last Name,Email,Phone,Job,Stage,Status,Source,Recruiter,Created At,Rejection Reason',
  '1001,Kofi,Mensah,kofi@example.com,+44 20 7123 4567,Staff SRE,Final Interview,Rejected,Referral,Dana,2025-05-12,"Strong, but the team wanted deeper Go"',
  '1002,Elena,Rossi,elena@example.com,,Staff SRE,Offer,Rejected,LinkedIn,Dana,2025-05-14,Took a counter-offer',
  '1001,Kofi,Mensah,kofi@example.com,+44 20 7123 4567,Staff SRE,Final Interview,Rejected,Referral,Dana,2025-05-12,"Strong, but the team wanted deeper Go"',
].join('\n');

function file(body: BlobPart, name: string, type = 'text/csv'): File {
  return new File([body], name, { type });
}

function benchPerson(overrides: Partial<Candidate> = {}): Candidate {
  const now = '2024-01-01T12:00:00.000Z';
  return {
    id: ulid(), name: 'Kofi Mensah', location: 'London, UK', currentEmployer: 'Monzo',
    currentTitle: 'Staff SRE', tenureStart: now, seniority: 'staff', skills: ['Go'], tags: [],
    status: 'active', warmthAt: now, sourceDate: now, notes: [], createdAt: now, updatedAt: now,
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  await Promise.all([
    db.candidates.clear(), db.roles.clear(), db.processes.clear(), db.matches.clear(),
    db.activities.clear(), db.sequences.clear(), db.settings.clear(), db.imports.clear(),
  ]);
  forgetPlans();
  clearAiCache();
  // The network is refused on purpose: an import must never depend on the AI being up.
  fetchMock = vi.fn().mockRejectedValue(new Error('no network in tests'));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// -------------------------------------------------------------------------- from files

describe('buildPlanFromFiles — a Greenhouse export', () => {
  it('reads it without asking the AI anything', async () => {
    const plan = await buildPlanFromFiles([file(GREENHOUSE_CSV, 'candidates.csv')]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(plan.kind).toBe('ats');
    expect(plan.sourceLabel).toBe('Greenhouse export');
    expect(plan.mappedByAI).toBeUndefined();
    expect(plan.columns?.every(c => c.confidence === 'exact')).toBe(true);
  });

  it('resolves the duplicated row so the same person appears once', async () => {
    const plan = await buildPlanFromFiles([file(GREENHOUSE_CSV, 'candidates.csv')]);
    expect(plan.rowCount).toBe(3);
    expect(plan.people).toHaveLength(2);
    expect(plan.notes.join(' ')).toMatch(/the same person listed more than once/);
  });

  it('joins first and last name, and keeps the rejection reason word for word', async () => {
    const plan = await buildPlanFromFiles([file(GREENHOUSE_CSV, 'candidates.csv')]);
    const kofi = plan.people.find(p => p.draft.name === 'Kofi Mensah');
    expect(kofi?.draft.email).toBe('kofi@example.com');
    expect(kofi?.process?.roleTitle).toBe('Staff SRE');
    expect(kofi?.process?.reason).toBe('Strong, but the team wanted deeper Go');
    // "Final Interview" + "Rejected" means they came second, not that they reached the final.
    expect(kofi?.process?.finishedAs).toBe('second');
  });

  it('reads an offer that did not close as an offer, not a rejection', async () => {
    const plan = await buildPlanFromFiles([file(GREENHOUSE_CSV, 'candidates.csv')]);
    const elena = plan.people.find(p => p.draft.name === 'Elena Rossi');
    expect(elena?.process?.finishedAs).toBe('offer_declined');
    expect(elena?.process?.reason).toBe('Took a counter-offer');
  });

  it('offers to merge somebody already on the bench, and says why', async () => {
    await db.candidates.put(benchPerson({ email: 'kofi+recruiting@example.com' }));
    const plan = await buildPlanFromFiles([file(GREENHOUSE_CSV, 'candidates.csv')]);
    const kofi = plan.people.find(p => p.draft.name === 'Kofi Mensah');
    expect(kofi?.decision).toBe('merge');
    expect(kofi?.matchOn).toBe('email');
    expect(kofi?.explain).toMatch(/Same email address/);
  });

  it('says out loud what an ATS export cannot carry', async () => {
    const plan = await buildPlanFromFiles([file(GREENHOUSE_CSV, 'candidates.csv')]);
    expect(plan.notes.join(' ')).toMatch(/no CVs, no scorecards/);
  });

  it('fires onProgress once per file', async () => {
    const seen: string[] = [];
    await buildPlanFromFiles(
      [file(GREENHOUSE_CSV, 'a.csv'), file('Name,Email\nElena,e@x.com', 'b.csv')],
      { onProgress: (_done, _total, label) => seen.push(label) },
    );
    expect(seen).toEqual(['a.csv', 'b.csv']);
  });
});

describe('buildPlanFromFiles — other shapes', () => {
  it('reads a LinkedIn Recruiter export and warns that it has no email addresses', async () => {
    const csv = [
      'First Name,Last Name,Title,Company,Location,Profile URL,Project,Stage',
      'Chiara,Bianchi,Principal Engineer,Revolut,"Milan, Italy",https://www.linkedin.com/in/chiara-bianchi,Staff SRE Q2,Contacted',
    ].join('\n');
    const plan = await buildPlanFromFiles([file(csv, 'recruiter.csv')]);
    expect(plan.kind).toBe('linkedin');
    expect(plan.notes.join(' ')).toMatch(/do not include email addresses/);
    expect(plan.people[0].draft.linkedin).toBe('https://www.linkedin.com/in/chiara-bianchi');
    expect(plan.people[0].draft.seniority).toBe('principal');
  });

  it('reads a JSON export, including one level of nesting', async () => {
    const json = JSON.stringify({
      candidates: [
        { person: { name: 'Elena Rossi' }, email: 'elena@example.com', company: 'Stripe' },
      ],
    });
    const plan = await buildPlanFromFiles([file(json, 'export.json', 'application/json')]);
    expect(plan.people).toHaveLength(1);
    expect(plan.people[0].draft.name).toBe('Elena Rossi');
    expect(plan.people[0].draft.currentEmployer).toBe('Stripe');
  });

  it('reads an Excel file', async () => {
    const XLSX = await import('xlsx');
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Name', 'Email', 'Current Company'],
      ['Chiara Bianchi', 'chiara@example.com', 'Revolut'],
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Sheet1');
    const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const plan = await buildPlanFromFiles([file(new Uint8Array(bytes), 'bench.xlsx', '')]);
    expect(plan.people).toHaveLength(1);
    expect(plan.people[0].draft.email).toBe('chiara@example.com');
    expect(plan.people[0].draft.currentEmployer).toBe('Revolut');
  });

  it('reads a Slack export zip, joins user ids to names, and keeps the message verbatim', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('users.json', JSON.stringify([
      { id: 'U01', real_name: 'Dana Okafor', profile: {} },
    ]));
    zip.file('channels.json', JSON.stringify([{ name: 'referrals' }]));
    zip.file('referrals/2025-05-12.json', JSON.stringify([
      { user: 'U01', ts: '1747051200.000100', text: 'Referring Priya Nair — worked with her at Deliveroo, https://www.linkedin.com/in/priya-nair' },
      { user: 'U01', ts: '1747051300.000100', text: 'lunch?' },
    ]));
    const bytes = await zip.generateAsync({ type: 'arraybuffer' });

    const plan = await buildPlanFromFiles([file(bytes, 'slack-export.zip', 'application/zip')]);
    expect(plan.kind).toBe('slack');
    expect(plan.sourceLabel).toBe('#referrals Slack export');
    expect(plan.people).toHaveLength(1);
    expect(plan.people[0].draft.name).toBe('Priya Nair');
    expect(plan.people[0].draft.linkedin).toBe('https://www.linkedin.com/in/priya-nair');
    expect(plan.people[0].draft.notes[0].body).toContain('Dana Okafor in #referrals');
    expect(plan.people[0].draft.notes[0].body).toContain('worked with her at Deliveroo');
    expect(plan.notes.join(' ')).toMatch(/no email addresses in it/);
  });

  it('says honestly when it cannot read a file, and imports nothing from it', async () => {
    const plan = await buildPlanFromFiles([file('nope', 'holiday.heic', 'image/heic')]);
    expect(plan.people).toHaveLength(0);
    expect(plan.notes.join(' ')).toMatch(/We do not know how to read holiday.heic/);
  });

  it('lists the columns of every spreadsheet in the drop as one mapping', async () => {
    const plan = await buildPlanFromFiles([
      file('Name,Email\nKofi Mensah,kofi@example.com', 'a.csv'),
      file('Name,Current Company\nElena Rossi,Stripe', 'b.csv'),
    ]);
    const named = plan.columns?.map(c => c.column) ?? [];
    expect(named).toContain('Email');
    expect(named).toContain('Current Company');
    expect(named.filter(c => c === 'Name')).toHaveLength(1);   // shared header, listed once
    expect(plan.notes.join(' ')).toMatch(/held 2 spreadsheets/);
  });

  it('applies one column correction to every file that has that column', async () => {
    const plan = await buildPlanFromFiles([
      file('Name,Widget Sprocket Code\nKofi Mensah,Monzo', 'a.csv'),
      file('Name,Widget Sprocket Code\nElena Rossi,Stripe', 'b.csv'),
    ]);
    const fixed = await remapPlan(plan, [
      { column: 'Widget Sprocket Code', field: 'currentEmployer', confidence: 'exact' },
    ]);
    expect(fixed.people.map(p => p.draft.currentEmployer).sort()).toEqual(['Monzo', 'Stripe']);
  });

  it('merges a mixed drop into one plan, deduping across the files', async () => {
    const other = 'Name,Email,Current Company\nKofi Mensah,kofi@example.com,Starling';
    const plan = await buildPlanFromFiles([
      file(GREENHOUSE_CSV, 'candidates.csv'),
      file(other, 'extra.csv'),
    ]);
    expect(plan.sourceLabel).toBe('2 files');
    expect(plan.people).toHaveLength(2);   // Kofi twice across two files is still one Kofi
  });
});

// --------------------------------------------------------------------------- from text

describe('buildPlanFromText', () => {
  it('reads a pasted spreadsheet', async () => {
    const plan = await buildPlanFromText('Name,Email\nElena Rossi,elena@example.com', 'Pasted from Sheets');
    expect(plan.people).toHaveLength(1);
    expect(plan.people[0].draft.email).toBe('elena@example.com');
  });

  it('reads a pasted list of names and links, one per line', async () => {
    const plan = await buildPlanFromText([
      'Kofi Mensah — Staff SRE at Monzo — https://www.linkedin.com/in/kofi-mensah',
      'Elena Rossi <elena@example.com>',
    ].join('\n'));
    expect(plan.people).toHaveLength(2);
    expect(plan.people[0].draft.currentTitle).toBe('Staff SRE');
    expect(plan.people[0].draft.currentEmployer).toBe('Monzo');
    expect(plan.people[1].draft.email).toBe('elena@example.com');
  });

  it('says so plainly when there is nobody in the text', async () => {
    const plan = await buildPlanFromText('   ');
    expect(plan.people).toHaveLength(0);
    expect(plan.notes.join(' ')).toMatch(/nothing in that paste/);
  });
});

// ----------------------------------------------------------------------------- remap

describe('remapPlan', () => {
  const CSV = 'Name,Widget Sprocket Code\nKofi Mensah,Monzo';

  it('leaves a column it cannot place unmapped, and marks it a guess', async () => {
    const plan = await buildPlanFromText(CSV);
    const col = plan.columns?.find(c => c.column === 'Widget Sprocket Code');
    expect(col?.field).toBe('skip');
    expect(col?.confidence).toBe('guess');
    expect(plan.people[0].draft.currentEmployer).toBe('Unknown');
  });

  it('re-reads the file when the user corrects that column', async () => {
    const plan = await buildPlanFromText(CSV);
    const fixed = await remapPlan(plan, [
      { column: 'Widget Sprocket Code', field: 'currentEmployer', confidence: 'exact' },
    ]);
    expect(fixed.people[0].draft.currentEmployer).toBe('Monzo');
    expect(fixed.columns?.find(c => c.column === 'Widget Sprocket Code')?.field).toBe('currentEmployer');
    expect(fixed.id).toBe(plan.id);
  });

  it('never touches the network', async () => {
    const plan = await buildPlanFromText(CSV);
    fetchMock.mockClear();
    await remapPlan(plan, [{ column: 'Widget Sprocket Code', field: 'currentEmployer', confidence: 'exact' }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('re-runs dedupe with the corrected mapping', async () => {
    await db.candidates.put(benchPerson({ email: undefined, name: 'Kofi Mensah', currentEmployer: 'Monzo' }));
    const plan = await buildPlanFromText(CSV);
    expect(plan.people[0].matchOn).toBeUndefined();
    const fixed = await remapPlan(plan, [
      { column: 'Widget Sprocket Code', field: 'currentEmployer', confidence: 'exact' },
    ]);
    expect(fixed.people[0].matchOn).toBe('name+employer');
    expect(fixed.people[0].decision).toBe('create');
  });

  it('says plainly when there are no columns to change', async () => {
    const plan = await buildPlanFromCapture({ name: 'Kofi Mensah', url: 'https://www.linkedin.com/in/kofi-mensah' });
    const same = await remapPlan(plan, []);
    expect(same.notes.join(' ')).toMatch(/no columns to change/);
  });
});

// --------------------------------------------------------------------------- capture

describe('buildPlanFromCapture', () => {
  it('still produces a person when the AI is unavailable', async () => {
    const plan = await buildPlanFromCapture({
      name: 'Kofi Mensah',
      headline: 'Staff SRE at Monzo',
      location: 'London, UK',
      url: 'https://www.linkedin.com/in/kofi-mensah',
      text: 'Kofi Mensah\nStaff SRE at Monzo\nLondon, UK',
      site: 'LinkedIn',
    });
    expect(plan.people).toHaveLength(1);
    const person = plan.people[0].draft;
    expect(person.name).toBe('Kofi Mensah');
    expect(person.currentTitle).toBe('Staff SRE');
    expect(person.currentEmployer).toBe('Monzo');
    expect(person.location).toBe('London, UK');
    expect(person.linkedin).toBe('https://www.linkedin.com/in/kofi-mensah');
    expect(person.source).toMatchObject({ kind: 'capture', label: 'LinkedIn capture' });
    expect(person.source?.url).toBe('https://www.linkedin.com/in/kofi-mensah');
    expect(plan.notes.join(' ')).toMatch(/could not read that page/);
  });

  it('falls back to the profile link when the page gave no name', async () => {
    const plan = await buildPlanFromCapture({ url: 'https://www.linkedin.com/in/elena-rossi-4b21' });
    expect(plan.people[0].draft.name).toBe('Elena Rossi');
  });

  it('names the site when it is not LinkedIn', async () => {
    const plan = await buildPlanFromCapture({ name: 'Priya Nair', url: 'https://otta.com/p/priya', site: 'Otta' });
    expect(plan.people[0].draft.source?.label).toBe('Otta capture');
  });

  it('does not fail outright when there is nobody on the page', async () => {
    const plan = await buildPlanFromCapture({ url: 'https://example.com/jobs' });
    expect(plan.people).toHaveLength(0);
    expect(plan.notes.join(' ')).toMatch(/no name on that page/);
  });
});
