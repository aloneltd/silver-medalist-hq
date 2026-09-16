/**
 * Small formatting helpers local to the Sources hub. Kept separate from
 * `../lib/personText.ts` deliberately: personText's `spokeLabel` is tuned for contact cadence
 * (buckets at "today" / "yesterday" / weeks) — the Sources live line ("last arrival 6 minutes
 * ago") needs minute- and hour-level precision that personText never needs.
 */

/** Turns any thrown value into one honest sentence — never a stack trace, never a blank screen. */
export function friendlyEngineError(e: unknown, context: string): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/still being built/i.test(raw)) {
    return `${context} isn't possible yet — the import engine is still being built. Nothing was changed.`;
  }
  return `${context} didn't work: ${raw}`;
}

/** "6 minutes ago" / "3 hours ago" / "2 days ago" — arrival-time precision for the Sources cards. */
export function agoLabel(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return 'no arrivals yet';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'no arrivals yet';
  const ms = now.getTime() - then;
  if (ms < 0 || ms < 60_000) return 'moments ago';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

export function pluralize(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** "three" for 3, falling back to the digit past ten — for sentences like "check the three we guessed". */
export function numberWord(n: number): string {
  return n >= 0 && n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : String(n);
}
