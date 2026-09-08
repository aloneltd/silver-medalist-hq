import type { BoardStage } from '../../types';

export interface StageMeta {
  stage: BoardStage;
  label: string;
}

/** BLUEPRINT-v2.md: "Warm → Reached out → Replied → Interviewing → Offer → Placed | Passed."
 * Placed and Passed are both terminal and render as the last two columns. */
export const BOARD_STAGES: StageMeta[] = [
  { stage: 'warm', label: 'Warm' },
  { stage: 'reached_out', label: 'Reached out' },
  { stage: 'replied', label: 'Replied' },
  { stage: 'interviewing', label: 'Interviewing' },
  { stage: 'offer', label: 'Offer' },
  { stage: 'placed', label: 'Placed' },
  { stage: 'passed', label: 'Passed' },
];

export const STALE_DAYS = 14;

export function daysSince(iso: string, now: number = Date.now()): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 86400000));
}
