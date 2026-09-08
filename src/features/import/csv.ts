/** Minimal RFC4180-ish CSV parser — handles quoted fields, embedded commas/newlines and "" escapes.
 * No dependency: import files are small enough (a recruiter's export, not a data warehouse dump). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

export interface CsvRow {
  [header: string]: string;
}

/** First row is headers (trimmed, lowercased for matching, original case kept as-is for display). */
export function csvToObjects(rows: string[][]): { headers: string[]; records: CsvRow[] } {
  if (rows.length === 0) return { headers: [], records: [] };
  const headers = rows[0].map(h => h.trim());
  const records = rows.slice(1).map(r => {
    const obj: CsvRow = {};
    headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim(); });
    return obj;
  });
  return { headers, records };
}

function pick(record: CsvRow, ...keys: string[]): string {
  const lowerMap = Object.fromEntries(Object.entries(record).map(([k, v]) => [k.toLowerCase(), v]));
  for (const k of keys) {
    const v = lowerMap[k.toLowerCase()];
    if (v) return v;
  }
  return '';
}

export interface ImportedCandidateDraft {
  name: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  location?: string;
  currentEmployer?: string;
  currentTitle?: string;
  skills: string[];
}

/** LinkedIn's "Connections.csv" export: First Name, Last Name, URL, Email Address, Company,
 * Position, Connected On. Detected by header shape, not filename (filenames get renamed). */
export function looksLikeLinkedInExport(headers: string[]): boolean {
  const set = new Set(headers.map(h => h.toLowerCase()));
  return set.has('first name') && set.has('last name') && (set.has('company') || set.has('position'));
}

import { ulid } from '../../lib/ulid';
import type { Candidate } from '../../types';

/** Fills in the required-but-unknowable fields with honest defaults ('unspecified' / 'mid' /
 * today) rather than guessing — dedupe + the dossier can fill these in properly afterwards. */
export function draftToCandidate(draft: ImportedCandidateDraft): Candidate {
  const now = new Date().toISOString();
  return {
    id: ulid(),
    name: draft.name,
    email: draft.email,
    phone: draft.phone,
    linkedin: draft.linkedin,
    location: draft.location || 'unspecified',
    currentEmployer: draft.currentEmployer || 'unspecified',
    currentTitle: draft.currentTitle || 'unspecified',
    tenureStart: now,
    seniority: 'mid',
    skills: draft.skills,
    tags: ['imported'],
    status: 'active',
    warmthAt: now,
    sourceDate: now,
    notes: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function rowToCandidateDraft(record: CsvRow, isLinkedIn: boolean): ImportedCandidateDraft | null {
  if (isLinkedIn) {
    const first = pick(record, 'First Name');
    const last = pick(record, 'Last Name');
    const name = `${first} ${last}`.trim();
    if (!name) return null;
    return {
      name,
      email: pick(record, 'Email Address') || undefined,
      linkedin: pick(record, 'URL') || undefined,
      currentEmployer: pick(record, 'Company') || undefined,
      currentTitle: pick(record, 'Position') || undefined,
      skills: [],
    };
  }
  const name = pick(record, 'name', 'full name', 'candidate name');
  if (!name) return null;
  const skillsRaw = pick(record, 'skills', 'skill');
  return {
    name,
    email: pick(record, 'email', 'email address') || undefined,
    phone: pick(record, 'phone', 'phone number') || undefined,
    linkedin: pick(record, 'linkedin', 'linkedin url', 'url') || undefined,
    location: pick(record, 'location', 'city') || undefined,
    currentEmployer: pick(record, 'employer', 'company', 'current employer') || undefined,
    currentTitle: pick(record, 'title', 'position', 'current title') || undefined,
    skills: skillsRaw ? skillsRaw.split(/[;,]/).map(s => s.trim()).filter(Boolean) : [],
  };
}
