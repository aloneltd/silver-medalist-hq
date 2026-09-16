/**
 * The pure readers: delimited text, dates, money, lists, stages, and the header rules for the
 * exports council/recruiter-v3.md §1 actually names.
 */
import { describe, it, expect } from 'vitest';
import { parseDelimited, detectDelimiter, looksTabular, toTable, columnSamples } from '../v3/import/csv';
import {
  normEmail, linkedinSlug, linkedinUrl, phoneKey, nameEmployerKey, parseDateLoose, parseMoney,
  formatMoney, parseList, seniorityFromTitle, parseSeniority, stageToFinishedAs, parseBenchStatus,
  nameFromSlug, splitHeadline,
} from '../v3/import/normalize';
import { ruleMapping } from '../v3/import/mapping';
import { detectSource, fuzzyFieldFor, ruleFor } from '../v3/import/headers';
import { flattenOneLevel, jsonToTable, shapeOf } from '../v3/import/readers';

// ------------------------------------------------------------------ delimited text

describe('parseDelimited', () => {
  it('keeps commas that live inside a quoted field', () => {
    const rows = parseDelimited('name,reason\nKofi,"Strong, but the team wanted Go"');
    expect(rows[1]).toEqual(['Kofi', 'Strong, but the team wanted Go']);
  });

  it('reads an escaped double quote inside a quoted field', () => {
    const rows = parseDelimited('name,reason\nElena,"HM said ""not now, but soon"""');
    expect(rows[1][1]).toBe('HM said "not now, but soon"');
  });

  it('keeps a newline inside a quoted field as part of that cell', () => {
    const rows = parseDelimited('name,notes\nChiara,"line one\nline two"\nKofi,short');
    expect(rows).toHaveLength(3);
    expect(rows[1][1]).toBe('line one\nline two');
    expect(rows[2][0]).toBe('Kofi');
  });

  it('handles CRLF line endings', () => {
    const rows = parseDelimited('a,b\r\n1,2\r\n3,4\r\n');
    expect(rows).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
  });

  it('strips the UTF-8 byte-order mark Excel writes', () => {
    const rows = parseDelimited('﻿Email,Name\nk@x.com,Kofi');
    expect(rows[0][0]).toBe('Email');
  });

  it('keeps ragged rows and pads them only at table level', () => {
    const cells = parseDelimited('a,b,c\n1,2\n4,5,6,7');
    expect(cells[1]).toHaveLength(2);
    const table = toTable(cells);
    expect(table.headers).toEqual(['a', 'b', 'c']);
    expect(table.rows[0]).toEqual(['1', '2', '']);
    expect(table.rows[1]).toEqual(['4', '5', '6']);
  });

  it('drops rows that are entirely empty', () => {
    expect(parseDelimited('a,b\n1,2\n\n,\n3,4')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
  });

  it('detects tabs and semicolons as the delimiter', () => {
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(parseDelimited('a\tb\n1\t2')[1]).toEqual(['1', '2']);
  });

  it('tells a table apart from prose', () => {
    expect(looksTabular('Name,Email\nKofi,k@x.com')).toBe(true);
    expect(looksTabular('Kofi was great, honestly, but the team wanted Go.')).toBe(false);
  });

  it('shows the first real value in each column as the sample', () => {
    const table = toTable(parseDelimited('Name,Email\n,\nKofi,k@x.com'));
    expect(columnSamples(table).Name).toEqual(['Kofi']);
  });
});

// ---------------------------------------------------------------------- identity keys

describe('identity keys', () => {
  it('normalises an email and strips a +tag from the local part', () => {
    expect(normEmail('  Kofi+Jobs@Example.COM ')).toBe('kofi@example.com');
    expect(normEmail('Kofi Mensah <kofi@example.com>')).toBe('kofi@example.com');
    expect(normEmail('not an email')).toBeUndefined();
  });

  it('pulls a LinkedIn slug out of any shape of profile URL', () => {
    expect(linkedinSlug('https://www.linkedin.com/in/kofi-mensah/')).toBe('kofi-mensah');
    expect(linkedinSlug('http://uk.LinkedIn.com/in/Kofi-Mensah?trk=abc')).toBe('kofi-mensah');
    expect(linkedinUrl('linkedin.com/in/kofi-mensah')).toBe('https://www.linkedin.com/in/kofi-mensah');
    expect(linkedinSlug('https://example.com/kofi')).toBeUndefined();
  });

  it('compares phone numbers on their last nine digits', () => {
    expect(phoneKey('+44 20 7123 4567')).toBe(phoneKey('020 7123 4567'));
    expect(phoneKey('1234')).toBeUndefined();
  });

  it('will not build a name+employer key from a placeholder employer', () => {
    expect(nameEmployerKey('Sarah Chen', 'Monzo')).toBe('sarah chen|monzo');
    expect(nameEmployerKey('Sarah Chen', 'Unknown')).toBeUndefined();
  });
});

// ----------------------------------------------------------------------------- dates

describe('parseDateLoose', () => {
  it('reads ISO dates', () => {
    expect(parseDateLoose('2025-09-04')?.slice(0, 10)).toBe('2025-09-04');
  });

  it('reads a day-first date when the first part cannot be a month', () => {
    expect(parseDateLoose('25/12/2024')?.slice(0, 10)).toBe('2024-12-25');
  });

  it('reads an ambiguous slash date month-first, the way US ATS exports write them', () => {
    expect(parseDateLoose('4/9/2025')?.slice(0, 10)).toBe('2025-04-09');
  });

  it('reads written months in both orders', () => {
    expect(parseDateLoose('Sep 4, 2025')?.slice(0, 10)).toBe('2025-09-04');
    expect(parseDateLoose('4 September 2025')?.slice(0, 10)).toBe('2025-09-04');
    expect(parseDateLoose('Mar 2024')?.slice(0, 10)).toBe('2024-03-01');
  });

  it('reads 2025/09/04 and two-digit years', () => {
    expect(parseDateLoose('2025/09/04')?.slice(0, 10)).toBe('2025-09-04');
    expect(parseDateLoose('25-12-24')?.slice(0, 10)).toBe('2024-12-25');
  });

  it('returns nothing rather than a wrong date', () => {
    expect(parseDateLoose('')).toBeUndefined();
    expect(parseDateLoose('soon')).toBeUndefined();
    expect(parseDateLoose(undefined)).toBeUndefined();
  });
});

// ----------------------------------------------------------------------------- money

describe('parseMoney', () => {
  const at = '2024-03-01T12:00:00.000Z';

  it('reads a currency symbol and thousands separators', () => {
    expect(parseMoney('£145,000', at)).toMatchObject({ amount: 145000, currency: 'GBP' });
  });

  it('reads a k suffix and an m suffix', () => {
    expect(parseMoney('145k', at)?.amount).toBe(145000);
    expect(parseMoney('1.2m', at)?.amount).toBe(1200000);
  });

  it('reads a three-letter currency code', () => {
    expect(parseMoney('USD 145000', at)).toMatchObject({ amount: 145000, currency: 'USD' });
  });

  it('takes the first figure out of a range', () => {
    expect(parseMoney('€120,000 - €140,000', at)).toMatchObject({ amount: 120000, currency: 'EUR' });
  });

  it('stamps the figure with the date the file describes', () => {
    expect(parseMoney('£145k', at)?.date).toBe(at);
  });

  it('gives nothing back rather than inventing a number', () => {
    expect(parseMoney('competitive', at)).toBeUndefined();
    expect(parseMoney('', at)).toBeUndefined();
  });

  it('writes money back in plain words for a note', () => {
    expect(formatMoney({ amount: 145000, currency: 'GBP', date: at })).toBe('£145k');
  });
});

// ------------------------------------------------------------------- lists and levels

describe('lists, levels and stages', () => {
  it('splits a skills list on commas, semicolons and pipes', () => {
    expect(parseList('Go; Kubernetes | Terraform, Go')).toEqual(['Go', 'Kubernetes', 'Terraform']);
  });

  it('reads seniority out of a job title when no column carries it', () => {
    expect(seniorityFromTitle('Staff Site Reliability Engineer')).toBe('staff');
    expect(seniorityFromTitle('Senior Backend Engineer')).toBe('senior');
    expect(seniorityFromTitle('VP of Engineering')).toBe('exec');
    expect(seniorityFromTitle('Graduate Developer')).toBe('junior');
    expect(seniorityFromTitle('Backend Engineer')).toBe('mid');
  });

  it('reads a seniority column when there is one', () => {
    expect(parseSeniority('Principal')).toBe('principal');
    expect(parseSeniority('')).toBeUndefined();
  });

  it('maps ATS stage words onto how far someone actually got', () => {
    expect(stageToFinishedAs('Offer')).toBe('offer_declined');
    expect(stageToFinishedAs('Final Interview')).toBe('final');
    expect(stageToFinishedAs('Onsite')).toBe('final');
    expect(stageToFinishedAs('Rejected after final')).toBe('second');
    expect(stageToFinishedAs('Final Interview', 'Rejected')).toBe('second');
    expect(stageToFinishedAs('Runner-up')).toBe('second');
    expect(stageToFinishedAs('Hired')).toBe('placed');
    expect(stageToFinishedAs('Phone Screen')).toBe('shortlist');
  });

  it('only ever reads a stricter bench status out of a column', () => {
    expect(parseBenchStatus('Do not contact')?.status).toBe('do_not_reapproach');
    expect(parseBenchStatus('Opted out')?.status).toBe('opted_out');
    // An ATS "Rejected" is why they are on this bench — it must not make them inactive.
    expect(parseBenchStatus('Rejected')).toBeUndefined();
  });

  it('reads a name out of a LinkedIn slug and a headline into title and employer', () => {
    expect(nameFromSlug('kofi-mensah-8a41b2')).toBe('Kofi Mensah');
    expect(splitHeadline('Staff SRE at Monzo')).toEqual({ title: 'Staff SRE', employer: 'Monzo' });
  });
});

// --------------------------------------------------------------------- header rules

const GREENHOUSE = [
  'Candidate ID', 'First Name', 'Last Name', 'Email', 'Phone', 'Job', 'Stage', 'Status',
  'Source', 'Recruiter', 'Coordinator', 'Created At', 'Last Activity', 'Rejection Reason',
];
const LEVER = [
  'Name', 'Emails', 'Phones', 'Posting', 'Stage', 'Owner', 'Origin', 'Sources', 'Tags',
  'Archive Reason', 'Created At', 'Opportunity ID',
];
const LINKEDIN_RECRUITER = [
  'First Name', 'Last Name', 'Title', 'Company', 'Location', 'Profile URL', 'Project', 'Stage',
];

describe('header rules', () => {
  it('maps a Greenhouse export with no AI at all', () => {
    const { columns, unknown } = ruleMapping(GREENHOUSE, {});
    expect(unknown).toEqual([]);
    expect(columns.every(c => c.confidence === 'exact')).toBe(true);
    const field = (name: string) => columns.find(c => c.column === name)?.field;
    expect(field('First Name')).toBe('firstName');
    expect(field('Last Name')).toBe('lastName');
    expect(field('Email')).toBe('email');
    expect(field('Job')).toBe('processRole');
    expect(field('Stage')).toBe('processStage');
    expect(field('Rejection Reason')).toBe('processReason');
    expect(field('Created At')).toBe('processDate');
    expect(field('Candidate ID')).toBe('skip');
    expect(field('Recruiter')).toBe('skip');
  });

  it('names the Greenhouse export from its header signature', () => {
    expect(detectSource(GREENHOUSE)).toEqual({ kind: 'ats', label: 'Greenhouse export' });
  });

  it('maps a Lever export with no AI at all', () => {
    const { columns, unknown } = ruleMapping(LEVER, {});
    expect(unknown).toEqual([]);
    expect(columns.every(c => c.confidence === 'exact')).toBe(true);
    const field = (name: string) => columns.find(c => c.column === name)?.field;
    expect(field('Emails')).toBe('email');
    expect(field('Phones')).toBe('phone');
    expect(field('Posting')).toBe('processRole');
    expect(field('Archive Reason')).toBe('processReason');
    expect(field('Origin')).toBe('tags');
    expect(field('Owner')).toBe('skip');
  });

  it('names the Lever export, and does not confuse it with Greenhouse', () => {
    expect(detectSource(LEVER)).toEqual({ kind: 'ats', label: 'Lever export' });
  });

  it('recognises a LinkedIn Recruiter export by its profile column and missing email', () => {
    const detected = detectSource(LINKEDIN_RECRUITER);
    expect(detected.kind).toBe('linkedin');
    expect(detected.label).toBe('LinkedIn Recruiter export');
  });

  it('falls back to a plain spreadsheet rather than guessing a vendor', () => {
    expect(detectSource(['Person', 'Where they work']).kind).toBe('csv');
  });

  it('matches headers whatever their case, spacing or punctuation', () => {
    expect(ruleFor('E-Mail Address')).toBe('email');
    expect(ruleFor('first_name')).toBe('firstName');
    expect(ruleFor('  CURRENT COMPANY  ')).toBe('currentEmployer');
  });

  it('says skip rather than guess wrong when a header means nothing to it', () => {
    expect(fuzzyFieldFor('Widget Sprocket Code')).toBe('skip');
    expect(fuzzyFieldFor('Email Addr')).toBe('email');
    expect(fuzzyFieldFor('Current Companies')).toBe('currentEmployer');
  });
});

// ------------------------------------------------------------------------------ JSON

describe('JSON exports', () => {
  it('flattens one level of nesting into dotted keys', () => {
    expect(flattenOneLevel({ person: { name: 'Kofi' }, id: 3 })).toEqual({ 'person.name': 'Kofi', id: '3' });
  });

  it('finds the people under candidates, data or results', () => {
    expect(jsonToTable({ candidates: [{ name: 'Kofi' }] }).rows[0]).toEqual(['Kofi']);
    expect(jsonToTable({ results: [{ name: 'Elena' }] }).rows[0]).toEqual(['Elena']);
    expect(jsonToTable([{ name: 'Chiara' }]).headers).toEqual(['name']);
  });

  it('gives every record the same columns even when they differ', () => {
    const table = jsonToTable([{ name: 'Kofi' }, { name: 'Elena', email: 'e@x.com' }]);
    expect(table.headers).toEqual(['name', 'email']);
    expect(table.rows[0]).toEqual(['Kofi', '']);
  });
});

describe('shapeOf', () => {
  it('knows a spreadsheet, a CV, a zip and a JSON export apart', () => {
    expect(shapeOf({ name: 'export.csv' })).toBe('table');
    expect(shapeOf({ name: 'bench.xlsx' })).toBe('table');
    expect(shapeOf({ name: 'kofi.pdf' })).toBe('document');
    expect(shapeOf({ name: 'slack.zip' })).toBe('zip');
    expect(shapeOf({ name: 'people.json' })).toBe('json');
    expect(shapeOf({ name: 'photo.heic' })).toBe('unknown');
  });
});
