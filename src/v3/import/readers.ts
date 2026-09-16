/**
 * File readers. EVERY heavy parser in here is loaded with `await import(...)` inside the
 * function that needs it: pdfjs, mammoth, SheetJS and JSZip together are far larger than the
 * whole app, and none of them may ever reach the first-paint bundle.
 *
 * Nothing here knows about candidates or dedupe — a reader's whole job is to turn bytes into
 * text, into a table, or into a list of people found on a page.
 */
import { linkedinSlug, linkedinUrlFromSlug, nameFromSlug, normEmail, trimTo } from './normalize';
import { parseDelimited, toTable, type Table } from './csv';

/** Some of these packages are CommonJS; Vite hands them back under `.default`. */
function interop<T>(mod: T): T {
  const maybe = mod as unknown as { default?: T };
  return maybe && maybe.default ? maybe.default : mod;
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

export type FileShape = 'table' | 'json' | 'zip' | 'document' | 'unknown';

export function shapeOf(file: { name: string; type?: string }): FileShape {
  const ext = extensionOf(file.name);
  if (['csv', 'tsv', 'tab'].includes(ext)) return 'table';
  if (['xlsx', 'xls', 'xlsm', 'ods'].includes(ext)) return 'table';
  if (ext === 'json') return 'json';
  if (ext === 'zip') return 'zip';
  if (['pdf', 'docx', 'doc', 'rtf', 'txt', 'md'].includes(ext)) return 'document';
  const mime = (file.type ?? '').toLowerCase();
  if (mime.includes('csv') || mime.includes('spreadsheet') || mime.includes('excel')) return 'table';
  if (mime.includes('json')) return 'json';
  if (mime.includes('zip')) return 'zip';
  if (mime.includes('pdf') || mime.includes('word') || mime.startsWith('text/')) return 'document';
  return 'unknown';
}

// ------------------------------------------------------------------------------ PDF

export interface PdfRead {
  text: string;
  /** False when the file has no text layer at all — a scan. The vision path takes over. */
  hasTextLayer: boolean;
}

/** Under this many characters, a "text layer" is really just page furniture. */
export const MIN_TEXT_LAYER_CHARS = 120;

export async function readPdfText(data: ArrayBuffer, maxPages = 12): Promise<PdfRead> {
  // The LEGACY build on purpose: the modern one reaches for DOMMatrix the moment it is
  // evaluated, which is fine in a browser and fatal anywhere else. Legacy works in both.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  try {
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  } catch {
    // No worker asset (a test runner, or a host that blocks it) — pdf.js falls back to the
    // in-thread fake worker below, which is slower but works.
  }

  const doc = await pdfjs.getDocument({
    // pdf.js takes ownership of the bytes it is handed and DETACHES the underlying buffer, so
    // it gets its own copy: the caller still needs these bytes for the vision fallback when it
    // turns out there was no text layer.
    data: new Uint8Array(data.slice(0)),
    // We only ever want the text layer, so nothing here needs to fetch, render or load a font.
    useWorkerFetch: false,
    disableFontFace: true,
    useSystemFonts: false,
  }).promise;

  // Line structure matters: a CV read as one long line loses the name on its own line at the
  // top, which is exactly what the no-AI fallback reader keys off. pdf.js marks a line end on
  // some items; where it does not, a jump in the vertical position is one.
  const lines: string[] = [];
  const pages = Math.min(doc.numPages, maxPages);
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let current: string[] = [];
    let lastY: number | undefined;
    const flush = () => {
      const line = current.join(' ').replace(/\s{2,}/g, ' ').trim();
      if (line) lines.push(line);
      current = [];
    };
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = Array.isArray(item.transform) ? Number(item.transform[5]) : undefined;
      if (lastY !== undefined && y !== undefined && Math.abs(y - lastY) > 2) flush();
      current.push(item.str);
      if (item.hasEOL) { flush(); lastY = undefined; } else if (y !== undefined) lastY = y;
    }
    flush();
  }
  await doc.destroy().catch(() => undefined);

  const text = lines.join('\n').trim();
  return { text, hasTextLayer: text.length >= MIN_TEXT_LAYER_CHARS };
}

// ----------------------------------------------------------------------------- DOCX

export async function readDocxText(data: ArrayBuffer): Promise<string> {
  const mammoth = interop(await import('mammoth'));
  const result = await mammoth.extractRawText({ arrayBuffer: data });
  return (result?.value ?? '').trim();
}

// ------------------------------------------------------------------------ spreadsheet

/** First sheet only, as raw cell strings. Formatted values, so dates read as dates. */
export async function readSpreadsheet(data: ArrayBuffer): Promise<string[][]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(new Uint8Array(data), { type: 'array' });
  const first = wb.SheetNames[0];
  if (!first) return [];
  const sheet = wb.Sheets[first];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '', blankrows: false });
  return raw
    .map(row => (Array.isArray(row) ? row.map(cell => (cell === null || cell === undefined ? '' : String(cell).trim())) : []))
    .filter(row => row.some(c => c !== ''));
}

// ----------------------------------------------------------------------------- JSON

/** Flattens one level of nesting into dotted keys, so `{person:{name}}` becomes `person.name`. */
export function flattenOneLevel(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v === null || v === undefined) { out[key] = ''; continue; }
    if (Array.isArray(v)) {
      out[key] = v.map(x => (x && typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ');
      continue;
    }
    if (typeof v === 'object') {
      if (prefix) { out[key] = JSON.stringify(v); continue; }   // only ONE level, as promised
      Object.assign(out, flattenOneLevel(v as Record<string, unknown>, key));
      continue;
    }
    out[key] = String(v);
  }
  return out;
}

const JSON_ARRAY_KEYS = ['candidates', 'data', 'results', 'people', 'records', 'items', 'rows', 'profiles'];

/** Pulls the array of person objects out of whatever wrapper the export used. */
export function jsonToTable(parsed: unknown): Table {
  let list: unknown[] | undefined;
  if (Array.isArray(parsed)) list = parsed;
  else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    for (const key of JSON_ARRAY_KEYS) {
      if (Array.isArray(obj[key])) { list = obj[key] as unknown[]; break; }
    }
    if (!list) {
      const firstArray = Object.values(obj).find(v => Array.isArray(v) && v.length && typeof v[0] === 'object');
      if (Array.isArray(firstArray)) list = firstArray;
      else list = [obj];                                        // a single person, on its own
    }
  }
  if (!list?.length) return { headers: [], rows: [] };

  const flat = list
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x))
    .map(x => flattenOneLevel(x));
  const headers: string[] = [];
  for (const row of flat) for (const k of Object.keys(row)) if (!headers.includes(k)) headers.push(k);
  return { headers, rows: flat.map(row => headers.map(h => row[h] ?? '')) };
}

// ------------------------------------------------------------------------------ ZIP

/** A person found in free text rather than in a column. */
export interface FoundPerson {
  name: string;
  linkedin?: string;
  email?: string;
  /** Their note, in the words of whoever wrote it. Never rewritten. */
  noteBodies: string[];
  /** ISO date the message was posted, when we know it. */
  at?: string;
  channel?: string;
}

export interface ZipRead {
  /** 'slack' for a Slack export, 'table' when the zip just held spreadsheets. */
  shape: 'slack' | 'table' | 'empty';
  label: string;
  people: FoundPerson[];
  tables: { filename: string; cells: string[][] }[];
  notes: string[];
}

const REFERRAL_WORDS = /\b(referr?(?:ing|al|ed|s)?|recommend(?:ing|ed|s|ation)?|worked with|vouch|introduc(?:e|ing|tion)|great candidate|would hire|know someone|shout ?out for)\b/i;
const NAME_IN_TEXT = /\b([A-Z][a-z'’À-ſ]{1,20})\s+([A-Z][a-zA-Z'’À-ſ-]{1,24})\b/;

/**
 * Reads a zip: a Slack export (users.json + channels.json + per-channel/per-day message files),
 * a LinkedIn data export, or plain spreadsheets somebody zipped up.
 */
export async function readZip(data: ArrayBuffer, filename: string): Promise<ZipRead> {
  const JSZipCtor = interop(await import('jszip'));
  const zip = await JSZipCtor.loadAsync(data);

  const paths = Object.keys(zip.files).filter(p => !zip.files[p].dir && !p.startsWith('__MACOSX'));
  const readText = async (path: string): Promise<string> => {
    const entry = zip.file(path);
    return entry ? entry.async('string') : '';
  };
  const readJson = async (path: string): Promise<unknown> => {
    try { return JSON.parse(await readText(path)); } catch { return undefined; }
  };

  const usersPath = paths.find(p => /(^|\/)users\.json$/i.test(p));
  const messagePaths = paths.filter(p => /\/\d{4}-\d{2}-\d{2}\.json$/.test(p));

  if (usersPath && messagePaths.length) {
    return readSlackExport({ filename, usersPath, messagePaths, readJson });
  }

  // Not Slack — pull out any spreadsheets it contains (a LinkedIn data export is CSVs in a zip).
  const tables: { filename: string; cells: string[][] }[] = [];
  const notes: string[] = [];
  for (const path of paths) {
    const ext = extensionOf(path);
    if (ext !== 'csv' && ext !== 'tsv') continue;
    const cells = parseDelimited(await readText(path));
    if (cells.length > 1) tables.push({ filename: path.split('/').pop() ?? path, cells });
  }
  if (!tables.length) {
    return {
      shape: 'empty', label: filename, people: [], tables: [],
      notes: [`We opened ${filename} but found nothing we could read — we look for a Slack export (users.json plus the channel folders) or spreadsheets inside the zip.`],
    };
  }
  if (tables.length > 1) {
    notes.push(`${filename} held ${tables.length} spreadsheets; we read all of them: ${tables.map(t => t.filename).join(', ')}.`);
  }
  return { shape: 'table', label: `Zip: ${filename}`, people: [], tables, notes };
}

async function readSlackExport(args: {
  filename: string;
  usersPath: string;
  messagePaths: string[];
  readJson: (path: string) => Promise<unknown>;
}): Promise<ZipRead> {
  const { filename, usersPath, messagePaths, readJson } = args;

  const usersRaw = await readJson(usersPath);
  const nameById = new Map<string, string>();
  if (Array.isArray(usersRaw)) {
    for (const u of usersRaw as Record<string, unknown>[]) {
      const id = typeof u.id === 'string' ? u.id : undefined;
      if (!id) continue;
      const profile = (u.profile ?? {}) as Record<string, unknown>;
      const label = [u.real_name, profile.real_name, profile.display_name, u.name]
        .find(v => typeof v === 'string' && v.trim()) as string | undefined;
      if (label) nameById.set(id, label.trim());
    }
  }

  const channels = new Set<string>();
  const byKey = new Map<string, FoundPerson>();
  let messagesRead = 0;

  for (const path of messagePaths.slice(0, 400)) {
    const channel = path.split('/').slice(-2)[0] ?? 'channel';
    const messages = await readJson(path);
    if (!Array.isArray(messages)) continue;
    channels.add(channel);

    for (const raw of messages as Record<string, unknown>[]) {
      const text = typeof raw.text === 'string' ? raw.text : '';
      if (!text.trim()) continue;
      messagesRead++;

      const slug = linkedinSlug(text);
      const looksLikeReferral = !!slug || REFERRAL_WORDS.test(text);
      if (!looksLikeReferral) continue;

      // Whose name is this message about? The profile link first; a capitalised name second.
      let name = nameFromSlug(slug);
      if (!name) {
        const m = NAME_IN_TEXT.exec(text.replace(/<[^>]*>/g, ' '));
        if (m) name = `${m[1]} ${m[2]}`;
      }
      if (!name) continue;

      const authorId = typeof raw.user === 'string' ? raw.user : '';
      const author = nameById.get(authorId) ?? (typeof raw.user_profile === 'object' && raw.user_profile
        ? String((raw.user_profile as Record<string, unknown>).real_name ?? 'someone')
        : 'someone');
      const ts = typeof raw.ts === 'string' ? Number(raw.ts) : typeof raw.ts === 'number' ? raw.ts : NaN;
      const at = Number.isFinite(ts) ? new Date(ts * 1000).toISOString() : undefined;

      // Slack encodes mentions and links as <@U123> and <http://x|x>. Make it readable, but
      // never change the words themselves — this sentence is why they were strong.
      const clean = text
        .replace(/<@([A-Z0-9]+)(\|[^>]*)?>/g, (_all, id: string) => `@${nameById.get(id) ?? 'someone'}`)
        .replace(/<(https?:\/\/[^|>]+)(\|[^>]*)?>/g, '$1')
        .replace(/<#[A-Z0-9]+\|([^>]*)>/g, '#$1')
        .trim();

      const key = (slug ? `l:${slug}` : `n:${name.toLowerCase()}`);
      const existing = byKey.get(key);
      const body = `${author} in #${channel}: “${trimTo(clean, 1200)}”`;
      if (existing) {
        if (!existing.noteBodies.includes(body)) existing.noteBodies.push(body);
        if (!existing.linkedin && slug) existing.linkedin = linkedinUrlFromSlug(slug);
        continue;
      }
      byKey.set(key, {
        name,
        ...(slug ? { linkedin: linkedinUrlFromSlug(slug) } : {}),
        ...(normEmail(text) ? { email: normEmail(text) } : {}),
        noteBodies: [body],
        ...(at ? { at } : {}),
        channel,
      });
    }
  }

  const channelList = [...channels];
  const label = channelList.length === 1 ? `#${channelList[0]} Slack export` : 'Slack export';
  const notes = [
    'A Slack export has no email addresses in it (only an admin export does), so these people arrive with a name, a profile link when one was posted, and the message itself. You will need to add a way to contact them.',
    `We read ${messagesRead} messages across ${channelList.length} channel${channelList.length === 1 ? '' : 's'} and kept the ones that look like somebody recommending a person.`,
  ];
  if (!byKey.size) {
    notes.push(`Nothing in ${filename} looked like a referral, so there is nobody to add. We look for a LinkedIn profile link, or words like "referring", "recommend" or "worked with" next to a name.`);
  }

  return { shape: 'slack', label, people: [...byKey.values()], tables: [], notes };
}

// ---------------------------------------------------------------------------- bytes

/** Base64 for the vision path, without Buffer — this runs in the browser. */
export function toBase64(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Decodes a text file, tolerating the BOM and Windows line endings. */
export function decodeText(data: ArrayBuffer): string {
  return new TextDecoder('utf-8').decode(data);
}

export { toTable, parseDelimited };
export type { Table };
