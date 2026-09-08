/**
 * Deterministic keyword-fit fallback scorer — BLUEPRINT-v2.md:
 * "deterministic keyword-fit fallback (labelled as such) so the board is never empty."
 *
 * No network call, no randomness — same input always produces the same output. Used when
 * every LLM provider in api/_lib/fastai.ts fails, or a specific candidate row didn't come
 * back validated from the model. Pure function so it's directly unit-testable.
 */

import type { ScoreCandidateInput, ScoreRoleInput, ScoredRow, MatchSubScores } from '../../src/types/index.js'

const SENIORITY_ORDER = ['junior', 'mid', 'senior', 'staff', 'principal', 'exec'] as const

function inferLevelRank(level: string): number {
  const l = level.toLowerCase()
  if (l.includes('exec') || l.includes('vp') || l.includes('chief')) return SENIORITY_ORDER.indexOf('exec')
  if (l.includes('principal')) return SENIORITY_ORDER.indexOf('principal')
  if (l.includes('staff')) return SENIORITY_ORDER.indexOf('staff')
  if (l.includes('manager') || l.includes('lead')) return SENIORITY_ORDER.indexOf('senior')
  if (l.includes('senior') || l.includes('sr')) return SENIORITY_ORDER.indexOf('senior')
  if (l.includes('junior') || l.includes('jr') || l.includes('associate')) return SENIORITY_ORDER.indexOf('junior')
  return SENIORITY_ORDER.indexOf('mid')
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)))
}

function skillsScore(candidate: ScoreCandidateInput, role: ScoreRoleInput): { score: number; matched: string[] } {
  const have = new Set(candidate.skills.map(s => s.toLowerCase().trim()))
  const must = role.mustHaves.map(s => s.toLowerCase().trim())
  const nice = role.niceToHaves.map(s => s.toLowerCase().trim())
  const matchedMust = must.filter(s => have.has(s))
  const matchedNice = nice.filter(s => have.has(s))
  const totalWeight = must.length * 2 + nice.length
  if (totalWeight === 0) return { score: 60, matched: [...matchedMust, ...matchedNice] }
  const earned = matchedMust.length * 2 + matchedNice.length
  return { score: clamp((earned / totalWeight) * 100), matched: [...matchedMust, ...matchedNice] }
}

function seniorityScore(candidate: ScoreCandidateInput, role: ScoreRoleInput): number {
  const candRank = SENIORITY_ORDER.indexOf(candidate.seniority)
  const roleRank = inferLevelRank(role.level)
  const distance = Math.abs(candRank - roleRank)
  return clamp(100 - distance * 28)
}

function compScore(candidate: ScoreCandidateInput, role: ScoreRoleInput): { score: number; aboveBand: boolean } {
  const expectation = candidate.compExpectation ?? candidate.compAtLastProcess
  if (!expectation || expectation.currency !== role.compBand.currency) {
    // Can't compare across currencies without a rate table — stay neutral rather than guess.
    return { score: 65, aboveBand: false }
  }
  const { amount } = expectation
  const { min, max } = role.compBand
  if (amount >= min && amount <= max) return { score: 100, aboveBand: false }
  if (amount < min) return { score: clamp(90 - ((min - amount) / min) * 100), aboveBand: false }
  const overPct = (amount - max) / max
  return { score: clamp(90 - overPct * 200), aboveBand: overPct > 0.05 }
}

function timingScore(candidate: ScoreCandidateInput, now: number): number {
  let score = 50
  const tenureMonths = (now - new Date(candidate.tenureStart).getTime()) / (30 * 86_400_000)
  if (tenureMonths >= 18 && tenureMonths <= 36) score += 30
  else if (tenureMonths >= 12 && tenureMonths < 18) score += 15
  else if (tenureMonths > 36 && tenureMonths <= 48) score += 10
  else if (tenureMonths < 6) score -= 20

  if (candidate.snoozeUntil) {
    const snooze = new Date(candidate.snoozeUntil).getTime()
    score += snooze > now ? -40 : 10
  }

  const warmthDays = (now - new Date(candidate.warmthAt).getTime()) / 86_400_000
  if (warmthDays > 90) score -= 10
  else if (warmthDays <= 14) score += 10

  return clamp(score)
}

export function scoreOneCandidateFallback(candidate: ScoreCandidateInput, role: ScoreRoleInput, now = Date.now()): ScoredRow {
  const skills = skillsScore(candidate, role)
  const seniority = seniorityScore(candidate, role)
  const comp = compScore(candidate, role)
  const timing = timingScore(candidate, now)

  const sub: MatchSubScores = { skills: skills.score, seniority, comp: comp.score, timing }
  const score = clamp(sub.skills * 0.4 + sub.seniority * 0.2 + sub.comp * 0.2 + sub.timing * 0.2)

  const flags: string[] = []
  if (comp.aboveBand) flags.push('comp above band')
  if (seniority < 50) flags.push('seniority mismatch')
  if (skills.matched.length === 0) flags.push('no matched skills')

  const why = skills.matched.length
    ? `Keyword fit: matched ${skills.matched.length} of ${role.mustHaves.length + role.niceToHaves.length} required/nice-to-have skills (${skills.matched.slice(0, 3).join(', ')}${skills.matched.length > 3 ? '…' : ''}).`
    : 'Keyword fit: no overlapping skills found against this role\'s requirements.'

  return { candidateId: candidate.id, score, sub, why, flags, fallback: true }
}

export function keywordFitFallback(role: ScoreRoleInput, candidates: ScoreCandidateInput[]): ScoredRow[] {
  const now = Date.now()
  return candidates.map(c => scoreOneCandidateFallback(c, role, now))
}
