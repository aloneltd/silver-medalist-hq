/**
 * A delimited-text reader, written here rather than added as a dependency.
 *
 * Real ATS exports break naive splitters: a rejection reason contains commas, a note contains
 * a newline inside quotes, Excel writes a UTF-8 BOM and CRLF line endings, and the last row is
 * often short. All of that is handled below (RFC 4180 plus the tab/semicolon dialects).
 */

const DELIMITERS = [',', '\t', ';', '|'] as const;
export type Delimiter = typeof DELIMITERS[number];

/** Counts a candidate delimiter in the first line only, ignoring anything inside quotes. */
function countOutsideQuotes(text: string, delimiter: string): number {
  let n = 0;
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { i++; continue; }
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (ch === '\n') break;
    if (ch === delimiter) n++;
  }
  return n;
}

/** Picks whichever of , TAB ; | appears most often on the header line. Comma wins ties. */
export function detectDelimiter(text: string): Delimiter {
  let best: Delimiter = ',';
  let bestCount = countOutsideQuotes(text, ',');
  for (const d of DELIMITERS) {
    if (d === ',') continue;
    const n = countOutsideQuotes(text, d);
    if (n > bestCount) { best = d; bestCount = n; }
  }
  return best;
}

/** Strips a UTF-8 byte-order mark, which Excel puts at the front of every CSV it writes. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Parses delimited text into rows of raw cell strings. Rows keep their own length — ragged
 * rows are NOT padded here, so a caller can tell a short row from a row of empty cells.
 * Fully-empty rows are dropped (trailing newlines, blank separator lines).
 */
export function parseDelimited(input: string, delimiter?: Delimiter): string[][] {
  const text = stripBom(input ?? '');
  if (!text.trim()) return [];
  const sep = delimiter ?? detectDelimiter(text);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const endField = () => { row.push(field); field = ''; };
  const endRow = () => {
    endField();
    if (row.length > 1 || row[0].trim() !== '') rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; continue; }
        inQuotes = false;
        continue;
      }
      field += ch;
      continue;
    }

    if (ch === '"' && field === '') { inQuotes = true; continue; }
    if (ch === '"') { field += '"'; continue; }          // a stray quote mid-field is literal
    if (ch === sep) { endField(); continue; }
    if (ch === '\r') { if (text[i + 1] === '\n') i++; endRow(); continue; }
    if (ch === '\n') { endRow(); continue; }
    field += ch;
  }

  if (field !== '' || row.length) endRow();

  // Drop rows that are entirely empty cells — Excel loves to write one at the end.
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

/**
 * True when a blob of pasted text is plausibly a table rather than prose: at least two lines,
 * a repeated delimiter, and a consistent-ish column count.
 */
export function looksTabular(text: string): boolean {
  const trimmed = stripBom(text ?? '').trim();
  if (!trimmed) return false;
  const sep = detectDelimiter(trimmed);
  const lines = trimmed.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return false;
  const headerCells = countOutsideQuotes(lines[0], sep) + 1;
  if (headerCells < 2) return false;
  const sample = lines.slice(1, 6);
  const matching = sample.filter(l => Math.abs(countOutsideQuotes(l, sep) + 1 - headerCells) <= 1).length;
  return matching >= Math.ceil(sample.length / 2);
}

/** Header row + body, with every body row padded to the header's width. */
export interface Table {
  headers: string[];
  rows: string[][];
}

/** Splits parsed cells into a header row and body rows padded to the header width. */
export function toTable(cells: string[][]): Table {
  if (!cells.length) return { headers: [], rows: [] };
  const headers = cells[0].map((h, i) => (h ?? '').trim() || `Column ${i + 1}`);
  const rows = cells.slice(1).map(r => {
    const out = r.slice(0, headers.length).map(c => (c ?? '').trim());
    while (out.length < headers.length) out.push('');
    return out;
  });
  return { headers, rows };
}

/** The first non-empty value in each column — what the mapping preview shows next to a header. */
export function columnSamples(table: Table, perColumn = 2): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  table.headers.forEach((h, i) => {
    const vals: string[] = [];
    for (const row of table.rows) {
      const v = (row[i] ?? '').trim();
      if (v && !vals.includes(v)) vals.push(v);
      if (vals.length >= perColumn) break;
    }
    out[h] = vals;
  });
  return out;
}
