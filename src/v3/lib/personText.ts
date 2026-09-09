import type { Candidate, Process, Role, Match } from '../../types';

/**
 * The plain-language layer. DESIGN-v3.md's rename pass lives here, in one place, so "spoke 3
 * weeks ago" reads identically on Home, People, a Profile and the Inbox — and so there is
 * exactly one thing to change when the wording is wrong.
 *
 * Rule: sentences, not chips. Nothing here returns jargon.
 */

/** "spoke 3 weeks ago" — never a raw day count, never a date the reader has to subtract. */
export function spokeLabel(days: number, verb = 'spoke'): string {
  if (!Number.isFinite(days) || days < 0) return `${verb} recently`;
  if (days === 0) return `${verb} today`;
  if (days === 1) return `${verb} yesterday`;
  if (days < 14) return `${verb} ${days} days ago`;
  if (days < 60) return `${verb} ${Math.round(days / 7)} weeks ago`;
  if (days < 730) return `${verb} ${Math.round(days / 30)} months ago`;
  return `${verb} over two years ago`;
}

export type FitBand = 'strong' | 'possible' | 'long-shot';

export function fitBand(score: number): FitBand {
  if (score >= 80) return 'strong';
  if (score >= 60) return 'possible';
  return 'long-shot';
}

/** "Strong fit · 94" — the phrase AND the number, per council/designer-v3.md §2. */
export function fitPhrase(score: number): string {
  const band = fitBand(score);
  const word = band === 'strong' ? 'Strong fit' : band === 'possible' ? 'Possible fit' : 'Long shot';
  return `${word} · ${Math.round(score)}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "May" for this year, "May 2024" for any other — how a colleague would say it. */
export function whenPhrase(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const month = MONTHS[d.getMonth()];
  return d.getFullYear() === now.getFullYear() ? month : `${month} ${d.getFullYear()}`;
}

const FINISH_WORDS: Record<Process['finishedAs'], string> = {
  second: 'Came second',
  final: 'Reached the final round',
  shortlist: 'Was shortlisted',
  offer_declined: 'Turned down an offer',
  placed: 'Was placed',
};

/**
 * The one line that carries the product: what they came close to, when, and why they lost.
 * Built from the most recent process, grounded entirely in stored facts — no model involved.
 */
export function storyLine(
  candidate: Candidate,
  processes: Process[],
  roles: Role[],
  now = new Date(),
): string {
  const mine = processes
    .filter(p => p.candidateId === candidate.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const latest = mine[0];
  if (!latest) {
    const from = candidate.source?.label ? ` Arrived from ${candidate.source.label.toLowerCase()}.` : '';
    return `${candidate.currentTitle} at ${candidate.currentEmployer}. No process on file yet.${from}`;
  }
  const role = roles.find(r => r.id === latest.roleId);
  const roleName = role ? role.title : 'a role';
  const head = `${FINISH_WORDS[latest.finishedAs]} for ${roleName} in ${whenPhrase(latest.date, now)}`;
  const why = latest.reason ? `; ${lowerFirst(latest.reason.replace(/\.$/, ''))}` : '';
  const again = mine.length > 1 ? ` One of ${mine.length} processes with you.` : '';
  return `${head}${why}.${again}`;
}

function lowerFirst(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

/** "from Greenhouse export" / "added by Dana" — the badge on every card. */
export function sourceLabel(candidate: Candidate): string | null {
  const src = candidate.source;
  if (!src) return null;
  if (src.kind === 'teammate' || src.kind === 'link') return src.addedBy ? `added by ${src.addedBy}` : src.label;
  return `from ${src.label}`;
}

/** A short, honest sentence about a non-active status — or null when they are simply active. */
export function statusPhrase(candidate: Candidate, now = new Date()): string | null {
  switch (candidate.status) {
    case 'silent':
      return candidate.statusReason ? `Went quiet — ${lowerFirst(candidate.statusReason)}` : 'Went quiet after your last note';
    case 'took_role': {
      if (!candidate.snoozeUntil) return 'Took another role';
      const days = Math.ceil((new Date(candidate.snoozeUntil).getTime() - now.getTime()) / 86_400_000);
      if (days <= 0) return 'Took another role — the resurface window is open now';
      if (days <= 14) return `Took another role — the resurface window opens in ${days} day${days === 1 ? '' : 's'}`;
      return `Took another role — worth another look in ${Math.round(days / 30)} months`;
    }
    case 'do_not_reapproach':
      return candidate.statusReason ? `Do not approach — ${lowerFirst(candidate.statusReason)}` : 'Do not approach';
    case 'opted_out':
      return 'Asked to be removed — kept out of every list and every prompt';
    default:
      return null;
  }
}

/** True when a person must never appear in a queue, a prompt, or an outreach draft. */
export function isOffLimits(candidate: Candidate): boolean {
  return candidate.status === 'do_not_reapproach' || candidate.status === 'opted_out';
}

/** The fit for the selected role, honouring a human override, or null if unscored. */
export function fitFor(candidateId: string, matches: Match[]): number | null {
  const m = matches.find(x => x.candidateId === candidateId);
  if (!m) return null;
  return m.override?.score ?? m.score;
}

/** "Tuesday 9 September" — the brief's date line. */
export function dayLabel(now = new Date()): string {
  return now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}
