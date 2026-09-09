/**
 * Pure text/value normalisers for the import engine.
 *
 * Everything here is deterministic and network-free: `remapPlan` re-runs the whole extraction
 * through these functions, so a user correcting a column must never wait on anything.
 */
import type { CompSnapshot, FinishedAs, ISODate, Seniority } from '../../types';

// ------------------------------------------------------------------ identity keys

/**
 * Lowercased, trimmed, `+tag` stripped from the local part. This is the key the recruiter
 * seat trusts most — a hit here is an exact match and merges by default.
 */
export function normEmail(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const found = /[^\s<>,;"']+@[^\s<>,;"']+/.exec(String(raw));
  if (!found) return undefined;
  const addr = found[0].trim().toLowerCase().replace(/[.,;]+$/, '');
  const at = addr.lastIndexOf('@');
  if (at < 1) return undefined;
  const local = addr.slice(0, at).split('+')[0];
  const domain = addr.slice(at + 1);
  if (!local || !domain.includes('.')) return undefined;
  return `${local}@${domain}`;
}

/** The `<slug>` out of any linkedin.com/in/<slug> URL — case, trailing slash and query stripped. */
export function linkedinSlug(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const m = /linkedin\.com\/in\/([^/?#\s"'<>]+)/i.exec(String(raw));
  if (!m) return undefined;
  let slug = m[1];
  try { slug = decodeURIComponent(slug); } catch { /* keep the raw slug */ }
  slug = slug.replace(/\/+$/, '').trim().toLowerCase();
  return slug || undefined;
}

/** The canonical profile URL for a slug we already extracted. */
export function linkedinUrlFromSlug(slug?: string | null): string | undefined {
  const s = (slug ?? '').trim();
  return s ? `https://www.linkedin.com/in/${s}` : undefined;
}

/** A LinkedIn URL, normalised for storage, from anything that contains one. */
export function linkedinUrl(raw?: string | null): string | undefined {
  return linkedinUrlFromSlug(linkedinSlug(raw));
}

/**
 * Digits only, last 9 compared. Country codes and formatting differ between an ATS export and
 * a LinkedIn export for the same human; the tail does not.
 */
export function phoneKey(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const digits = String(raw).replace(/\D+/g, '');
  if (digits.length < 9) return undefined;
  return digits.slice(-9);
}

/** Lowercase, accents folded, punctuation dropped, whitespace collapsed. */
export function normText(raw?: string | null): string {
  if (!raw) return '';
  return String(raw)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The suggestion-only key. Never auto-merges — there are three Sarah Chens. */
export function nameEmployerKey(name?: string | null, employer?: string | null): string | undefined {
  const n = normText(name);
  const e = normText(employer);
  if (!n || !e || e === 'unknown' || e === 'unspecified') return undefined;
  return `${n}|${e}`;
}

// ------------------------------------------------------------------------- dates

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

function iso(y: number, m: number, d: number): ISODate | undefined {
  if (y < 1900 || y > 2200 || m < 0 || m > 11 || d < 1 || d > 31) return undefined;
  const dt = new Date(Date.UTC(y, m, d, 12, 0, 0));
  if (Number.isNaN(dt.getTime())) return undefined;
  return dt.toISOString();
}

/**
 * Lenient date reader for spreadsheet cells: ISO, D/M/Y, M/D/Y, "Sep 4, 2025", "4 September
 * 2025", "2025/09/04", and Excel day serials.
 *
 * Ambiguous slash dates (both parts <= 12) are read MONTH FIRST: Greenhouse, Lever, Ashby and
 * Workable are US products and their exports are M/D/Y. When the first part is > 12 it can only
 * be a day, so D/M/Y wins; likewise the reverse.
 */
export function parseDateLoose(raw?: string | null): ISODate | undefined {
  if (raw === null || raw === undefined) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;

  // Full ISO / anything Date can read unambiguously with a 4-digit leading year.
  const isoish = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]|$)/.exec(s);
  if (isoish) {
    const d = new Date(s.length > 10 ? s : `${s}T12:00:00Z`);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    return iso(+isoish[1], +isoish[2] - 1, +isoish[3]);
  }

  // 2025/09/04
  const ymd = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(s);
  if (ymd) return iso(+ymd[1], +ymd[2] - 1, +ymd[3]);

  // 4/9/2025 · 04-09-25 · 9.4.2025
  const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(s);
  if (dmy) {
    const a = +dmy[1];
    const b = +dmy[2];
    let y = +dmy[3];
    if (y < 100) y += y < 70 ? 2000 : 1900;
    if (a > 12 && b <= 12) return iso(y, b - 1, a);        // day first, unambiguous
    if (b > 12 && a <= 12) return iso(y, a - 1, b);        // month first, unambiguous
    return iso(y, a - 1, b);                               // ambiguous — month first
  }

  // Sep 4, 2025 · September 4 2025 · Sept 2025
  const mdy = /^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?$/i.exec(s);
  if (mdy && MONTHS[mdy[1].toLowerCase()] !== undefined) {
    return iso(mdy[3] ? +mdy[3] : new Date().getUTCFullYear(), MONTHS[mdy[1].toLowerCase()], +mdy[2]);
  }

  // 4 Sep 2025 · 4th September 2025
  const dm = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?,?\s*(\d{4})?$/i.exec(s);
  if (dm && MONTHS[dm[2].toLowerCase()] !== undefined) {
    return iso(dm[3] ? +dm[3] : new Date().getUTCFullYear(), MONTHS[dm[2].toLowerCase()], +dm[1]);
  }

  // Mar 2024 · March 2024 — a month with no day means the 1st.
  const my = /^([a-z]{3,9})\.?\s+(\d{4})$/i.exec(s);
  if (my && MONTHS[my[1].toLowerCase()] !== undefined) return iso(+my[2], MONTHS[my[1].toLowerCase()], 1);

  // Excel day serial (1900 system). Only a bare 5-digit number in a date column gets here.
  if (/^\d{5}$/.test(s)) {
    const serial = +s;
    if (serial > 20000 && serial < 60000) {
      return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString();
    }
  }

  // Epoch milliseconds / seconds.
  if (/^\d{10}$/.test(s)) return new Date(+s * 1000).toISOString();
  if (/^\d{13}$/.test(s)) return new Date(+s).toISOString();

  const loose = new Date(s);
  if (!Number.isNaN(loose.getTime()) && /\d{4}/.test(s)) return loose.toISOString();
  return undefined;
}

// ------------------------------------------------------------------------ money

const SYMBOLS: Record<string, string> = {
  '£': 'GBP', '$': 'USD', '€': 'EUR', '₹': 'INR', '¥': 'JPY', '₪': 'ILS', '₩': 'KRW', 'CHF': 'CHF',
};
const CODES = new Set([
  'USD', 'GBP', 'EUR', 'CHF', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK',
  'INR', 'JPY', 'CNY', 'HKD', 'SGD', 'AED', 'SAR', 'ILS', 'ZAR', 'BRL', 'MXN', 'KRW',
]);

/**
 * "£145,000" · "145k" · "USD 145000" · "120k-140k" (takes the first figure) · "1.2m".
 * Returns undefined rather than guessing when there is no number at all — a comp figure we
 * invented is worse than a blank one.
 */
export function parseMoney(raw?: string | null, at?: ISODate): CompSnapshot | undefined {
  if (raw === null || raw === undefined) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;

  let currency = '';
  for (const [sym, code] of Object.entries(SYMBOLS)) {
    if (s.includes(sym)) { currency = code; break; }
  }
  if (!currency) {
    const code = /\b([A-Z]{3})\b/.exec(s.toUpperCase());
    if (code && CODES.has(code[1])) currency = code[1];
  }

  const num = /(\d[\d,\s.']*)\s*([kKmM])?/.exec(s.replace(/[\u00a0\u202f]/g, ' '));
  if (!num) return undefined;

  // 145,000 and 145.000 both mean the same thing; 1.2m does not. Only treat a dot as a decimal
  // point when it is followed by 1-2 digits at the very end.
  let digits = num[1].replace(/[\s,']/g, '');
  const decimal = /\.(\d{1,2})$/.exec(digits);
  if (decimal) digits = digits.slice(0, -decimal[0].length) + '.' + decimal[1];
  else digits = digits.replace(/\./g, '');

  let amount = Number(digits);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const suffix = (num[2] ?? '').toLowerCase();
  if (suffix === 'k') amount *= 1000;
  if (suffix === 'm') amount *= 1_000_000;
  // A bare "145" in a salary column means 145k, not £145.
  if (!suffix && amount < 1000 && amount >= 10) amount *= 1000;

  return { amount: Math.round(amount), currency: currency || 'USD', date: at ?? new Date().toISOString() };
}

/** Plain-English money, for the note a merge leaves behind. */
export function formatMoney(c: CompSnapshot): string {
  const sym = Object.entries(SYMBOLS).find(([, code]) => code === c.currency)?.[0];
  const n = c.amount >= 1000 && c.amount % 1000 === 0 ? `${c.amount / 1000}k` : String(c.amount);
  return sym && sym.length === 1 ? `${sym}${n}` : `${n} ${c.currency}`;
}

/** "Mar 2024" — how a dated field reads in a note. */
export function formatMonth(at: ISODate): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return 'an unknown date';
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// ------------------------------------------------------------------------- lists

/** Splits a comma / semicolon / pipe / newline list into clean members, order preserved. */
export function parseList(raw?: string | null, max = 60): string[] {
  if (!raw) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of String(raw).split(/[,;|\n\r\t]+/)) {
    const v = part.trim().replace(/^["']|["']$/g, '');
    if (!v || v.length > 80) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

// --------------------------------------------------------------------- seniority

const SENIORITIES: Seniority[] = ['junior', 'mid', 'senior', 'staff', 'principal', 'exec'];

export function parseSeniority(raw?: string | null): Seniority | undefined {
  const s = normText(raw);
  if (!s) return undefined;
  for (const level of SENIORITIES) if (s.includes(level)) return level;
  if (/\b(sr|snr)\b/.test(s)) return 'senior';
  if (/\b(jr|junior|grad|graduate|intern|entry|trainee)\b/.test(s)) return 'junior';
  if (/\b(vp|svp|evp|cto|ceo|cfo|coo|cpo|ciso|chief|director|head)\b/.test(s)) return 'exec';
  if (/\b(l[1-9]|ic[1-9]|e[1-9]|p[1-9]|grade [1-9])\b/.test(s)) {
    const n = Number(/\d/.exec(s)?.[0] ?? 0);
    return n <= 2 ? 'junior' : n <= 4 ? 'mid' : n <= 5 ? 'senior' : n <= 6 ? 'staff' : 'principal';
  }
  return undefined;
}

/** Last resort when no seniority column was mapped: read it out of the job title. */
export function seniorityFromTitle(title?: string | null): Seniority {
  const s = normText(title);
  if (!s) return 'mid';
  if (/\b(chief|cto|ceo|cfo|coo|cpo|cmo|ciso|vp|svp|evp|vice president|head of|director|partner)\b/.test(s)) return 'exec';
  if (/\b(principal|distinguished|fellow)\b/.test(s)) return 'principal';
  if (/\bstaff\b/.test(s)) return 'staff';
  if (/\b(senior|sr|snr|lead|manager|tech lead)\b/.test(s)) return 'senior';
  if (/\b(junior|jr|graduate|grad|intern|trainee|apprentice|entry level|associate)\b/.test(s)) return 'junior';
  return 'mid';
}

// ------------------------------------------------------------------------ stages

/**
 * ATS stage words -> the one thing we care about: how far they actually got.
 *
 * Order matters. "Rejected after final" must land on `second` before the bare `final` rule
 * sees it, and an accepted offer must beat the generic "offer" rule.
 */
export function stageToFinishedAs(...parts: (string | undefined | null)[]): FinishedAs | undefined {
  const s = normText(parts.filter(Boolean).join(' '));
  if (!s) return undefined;

  if (/\b(runner up|runners up|second place|second choice|silver medal|close second)\b/.test(s)) return 'second';
  if (/\brejected after final\b|\bfinal round rejection\b/.test(s)) return 'second';
  if (/\b(reject|rejected|archived|not selected|unsuccessful|passed on|declined by us)\b/.test(s)
    && /\b(final|finals|onsite|on site|last round|debrief|panel)\b/.test(s)) return 'second';

  if (/\b(hired|placed|started|offer accepted|accepted offer|won)\b/.test(s)) return 'placed';
  if (/\b(offer declined|declined offer|turned down|candidate withdrew|withdrew|rejected offer)\b/.test(s)) return 'offer_declined';
  if (/\boffer\b/.test(s)) return 'offer_declined';

  if (/\b(final|finals|onsite|on site|last round|debrief|panel|loop)\b/.test(s)) return 'final';
  return 'shortlist';
}

/** Plain words for what a stage means, used in the note a merge leaves behind. */
export const FINISHED_AS_WORDS: Record<FinishedAs, string> = {
  second: 'came second',
  final: 'reached the final round',
  shortlist: 'was shortlisted',
  offer_declined: 'had an offer that did not close',
  placed: 'was placed',
};

// ---------------------------------------------------------------------- statuses

/**
 * Only ever reads a *stricter* bench status out of a column. An ATS "Rejected" does NOT make
 * somebody inactive here — being rejected is precisely why they are on this bench.
 */
export function parseBenchStatus(raw?: string | null): { status: 'do_not_reapproach' | 'opted_out' | 'took_role' | 'silent'; reason: string } | undefined {
  const s = normText(raw);
  if (!s) return undefined;
  if (/\b(opted out|opt out|erasure|gdpr|deleted|withdrawn consent|unsubscribed|do not email)\b/.test(s)) {
    return { status: 'opted_out', reason: String(raw).trim() };
  }
  if (/\b(do not contact|do not approach|do not reapproach|dnc|blacklist|never contact|no contact)\b/.test(s)) {
    return { status: 'do_not_reapproach', reason: String(raw).trim() };
  }
  if (/\b(hired elsewhere|took a role|took role|placed elsewhere|not looking|off market)\b/.test(s)) {
    return { status: 'took_role', reason: String(raw).trim() };
  }
  if (/\b(went quiet|no response|unresponsive|silent|ghosted)\b/.test(s)) {
    return { status: 'silent', reason: String(raw).trim() };
  }
  return undefined;
}

/** A person's name, out of a "jane-doe-8a41b2" LinkedIn slug. */
export function nameFromSlug(slug?: string): string | undefined {
  if (!slug) return undefined;
  // LinkedIn appends a disambiguating id to most slugs ("elena-rossi-4b21"). No name has a
  // digit in it, so any word carrying one is that id, not part of who they are.
  const words = slug.split(/[-_]+/).filter(w => w && !/\d/.test(w));
  if (!words.length) return undefined;
  const name = words.slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').trim();
  return name || undefined;
}

/** "Staff SRE at Monzo" -> title + employer. Also handles "Staff SRE @ Monzo" and "Monzo | Staff SRE". */
export function splitHeadline(headline?: string | null): { title?: string; employer?: string } {
  const h = (headline ?? '').trim();
  if (!h) return {};
  const at = /^(.{2,120}?)\s+(?:at|@)\s+(.{2,120})$/i.exec(h);
  if (at) return { title: at[1].trim(), employer: at[2].replace(/\s*[|·].*$/, '').trim() };
  const pipe = h.split(/\s*[|·]\s*/).filter(Boolean);
  if (pipe.length >= 2) return { title: pipe[0].trim(), employer: pipe[1].trim() };
  return { title: h };
}

export function trimTo(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}
