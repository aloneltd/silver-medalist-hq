/** Same formatting rule B2's `src/features/bench/lib/warmth.ts` uses, kept local so Today has
 * no cross-feature dependency for something this small. */
export function formatWarmthDays(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return '1 day';
  return `${days} days`;
}
