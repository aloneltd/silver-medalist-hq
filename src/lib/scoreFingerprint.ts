import type { ScoreCandidateInput, ScoreRoleInput } from '../types/index.js';
import { contentHash } from './hash.js';

/**
 * hash(role fingerprint + sorted candidate fingerprints) — BLUEPRINT-v2.md's cache key for
 * both the server LRU (api/score.ts) and the client short-circuit (dataService.prepareScoreRequest:
 * identical hash to the last-stored Match rows ⇒ zero network, instant re-score animation).
 * Must produce byte-identical output on both sides for the same logical input, so this is the
 * one place the fingerprint shape is defined — do not inline a second copy.
 */
export function scoreFingerprint(role: ScoreRoleInput, candidates: ScoreCandidateInput[]): string {
  const roleFp = [
    role.id, role.title, role.level, role.location, JSON.stringify(role.compBand),
    role.mustHaves.slice().sort().join(','),
    role.niceToHaves.slice().sort().join(','),
    role.dealbreakers.slice().sort().join(','),
  ].join('|');

  const candFps = candidates
    .map(c => [
      c.id,
      c.skills.slice().sort().join(','),
      c.seniority,
      c.status,
      c.warmthAt,
      c.snoozeUntil ?? '',
      c.compExpectation ? `${c.compExpectation.amount}${c.compExpectation.currency}` : '',
      c.compAtLastProcess ? `${c.compAtLastProcess.amount}${c.compAtLastProcess.currency}` : '',
    ].join(':'))
    .sort();

  return contentHash(`${roleFp}::${candFps.join(';')}`);
}
