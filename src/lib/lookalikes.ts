/**
 * lookalikes — "People like this" (DESIGN-v2.1.md §C.3). Pure local cosine similarity over a
 * sparse tag vector (skills, seniority, location, comp bucket) — zero AI, zero network,
 * deterministic. Never suggests reaching out to someone who has opted out or asked not to be
 * re-approached, same rule dataService.prepareScoreRequest applies before an AI prompt.
 */

import type { Candidate } from '../types';

export interface Lookalike {
  candidateId: string;
  name: string;
  /** cosine similarity, 0..1, rounded to 3 decimals for stable display/tests. */
  score: number;
  /** one-line, human-readable reason — the specific overlaps that drove the score. */
  reason: string;
}

const COMP_BUCKET_SIZE = 20_000;
const EXCLUDED_STATUSES = new Set<Candidate['status']>(['opted_out', 'do_not_reapproach']);

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

interface WeightedToken {
  token: string;
  weight: number;
}

function skillTokens(c: Candidate): WeightedToken[] {
  return c.skills.map(s => ({ token: `skill:${normalize(s)}`, weight: 1 }));
}

function locationTokens(c: Candidate): WeightedToken[] {
  const norm = normalize(c.location);
  if (!norm) return [];
  const tokens: WeightedToken[] = [{ token: `location:${norm}`, weight: 2 }];
  // "Berlin, Germany" vs "Munich, Germany" should still share *some* signal on the country part.
  for (const part of norm.split(',').map(p => p.trim()).filter(Boolean)) {
    tokens.push({ token: `location-part:${part}`, weight: 0.5 });
  }
  return tokens;
}

function compBucketToken(c: Candidate): WeightedToken | null {
  const snap = c.compExpectation ?? c.compAtLastProcess;
  if (!snap || !Number.isFinite(snap.amount)) return null;
  const bucket = Math.round(snap.amount / COMP_BUCKET_SIZE) * COMP_BUCKET_SIZE;
  return { token: `comp:${snap.currency}:${bucket}`, weight: 1.5 };
}

function vectorize(c: Candidate): WeightedToken[] {
  const tokens: WeightedToken[] = [
    ...skillTokens(c),
    { token: `seniority:${c.seniority}`, weight: 2 },
    ...locationTokens(c),
  ];
  const comp = compBucketToken(c);
  if (comp) tokens.push(comp);
  return tokens;
}

function toVector(tokens: WeightedToken[]): Map<string, number> {
  const v = new Map<string, number>();
  for (const { token, weight } of tokens) v.set(token, (v.get(token) ?? 0) + weight);
  return v;
}

function magnitude(v: Map<string, number>): number {
  let sumSq = 0;
  for (const w of v.values()) sumSq += w * w;
  return Math.sqrt(sumSq);
}

export function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const [token, weight] of smaller) {
    const other = larger.get(token);
    if (other) dot += weight * other;
  }
  const denom = magnitude(a) * magnitude(b);
  return denom === 0 ? 0 : dot / denom;
}

function buildReason(target: Candidate, other: Candidate): string {
  const targetSkills = new Set(target.skills.map(normalize));
  const sharedSkills = other.skills.filter(s => targetSkills.has(normalize(s)));

  const parts: string[] = [];
  if (sharedSkills.length) {
    const preview = sharedSkills.slice(0, 3).join(', ');
    parts.push(`${sharedSkills.length} shared skill${sharedSkills.length === 1 ? '' : 's'} (${preview}${sharedSkills.length > 3 ? '…' : ''})`);
  }
  if (other.seniority === target.seniority) {
    parts.push(`same seniority (${other.seniority})`);
  }
  if (target.location && normalize(other.location) === normalize(target.location)) {
    parts.push(`same location (${other.location})`);
  }
  const targetComp = target.compExpectation ?? target.compAtLastProcess;
  const otherComp = other.compExpectation ?? other.compAtLastProcess;
  if (targetComp && otherComp && targetComp.currency === otherComp.currency) {
    const diffPct = Math.abs(targetComp.amount - otherComp.amount) / Math.max(1, targetComp.amount);
    if (diffPct <= 0.15) parts.push('similar comp range');
  }

  return parts.length ? parts.slice(0, 3).join(' · ') : 'Similar overall profile';
}

/**
 * Top `limit` candidates from `pool` most like `target`, by cosine similarity over the tag
 * vector. Excludes `target` itself and anyone excluded from re-approach. Deterministic: ties
 * break on candidate id so the list never reshuffles between renders on identical input.
 */
export function findLookalikes(target: Candidate, pool: Candidate[], limit = 5): Lookalike[] {
  const targetVector = toVector(vectorize(target));
  return pool
    .filter(c => c.id !== target.id && !EXCLUDED_STATUSES.has(c.status))
    .map(c => ({ candidate: c, score: cosineSimilarity(targetVector, toVector(vectorize(c))) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id))
    .slice(0, limit)
    .map(({ candidate, score }) => ({
      candidateId: candidate.id,
      name: candidate.name,
      score: Math.round(score * 1000) / 1000,
      reason: buildReason(target, candidate),
    }));
}

export default findLookalikes;
