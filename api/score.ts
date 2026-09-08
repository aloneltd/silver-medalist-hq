import type { VercelRequest, VercelResponse } from '@vercel/node'
import { complete, rateLimit, clientIp, parseJson, AiError } from './_lib/fastai.js'
import { keywordFitFallback, scoreOneCandidateFallback } from './_lib/scoreFallback.js'
import { scoreFingerprint } from '../src/lib/scoreFingerprint.js'
import type {
  ScoreRequestBody, ScoreResponseBody, ScoredRow, ScoreCandidateInput, ScoreRoleInput,
} from '../src/types/index.js'

const MAX_CANDIDATES_PER_CALL = 60

/**
 * The prompt is deliberately terse (2026-09-08 polish pass). The client now sends WAVES of 12
 * instead of one 40-60 candidate call, because Mark's Groq tier is capped at 8,000 tokens per
 * minute on gpt-oss-120b/20b: a single 40-candidate call needed ~8,800 tokens and was
 * structurally guaranteed to 429, which is why a "full bench sync" always landed on the
 * keyword-fit fallback.
 *
 * Two things keep a whole 60-row bench inside that cap:
 *   1. Candidates go over as one terse pipe-delimited line each (~35 tokens), not JSON.
 *   2. The model answers by wave-local INDEX with single-letter keys (~35 tokens a row),
 *      instead of echoing a 26-character ULID and a schema's worth of field names.
 * A 12-candidate wave costs ≈1.2k tokens round trip, so five waves — the whole bench — fit
 * inside one minute's budget with room to spare.
 */
const RESPONSE_SHAPE = `{"r":[{"i":<index>,"s":<0-100 overall>,"k":<skills>,"l":<seniority>,"c":<comp>,"t":<timing>,"w":"<one short grounded sentence, max 22 words>","f":["<flag>"]}]}`

function isFiniteNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

function daysAgo(iso: string): number {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 0
  return Math.max(0, Math.round((Date.now() - t) / 86_400_000))
}

function monthsAgo(iso: string): number {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 0
  return Math.max(0, Math.round((Date.now() - t) / (30.4375 * 86_400_000)))
}

/** "in band" / "18% over" / "under band" / "—" — the comp signal in three tokens, not a JSON object. */
function compRelation(c: ScoreCandidateInput, role: ScoreRoleInput): string {
  const snap = c.compExpectation ?? c.compAtLastProcess
  if (!snap || snap.currency !== role.compBand.currency) return '?'
  const { min, max } = role.compBand
  if (!min && !max) return '?'
  if (snap.amount >= min && snap.amount <= max) return 'in band'
  if (snap.amount < min) return 'under band'
  return `${Math.round(((snap.amount - max) / Math.max(1, max)) * 100)}% over`
}

/** One compact line per candidate — name, seniority, top 8 skills, comp, last process, warmth. */
function candidateLine(c: ScoreCandidateInput, role: ScoreRoleInput, index: number): string {
  const prior = (c.priorReason ?? '').replace(/[|\n]/g, ' ').trim().slice(0, 90) || 'no prior process'
  return [
    index,
    c.name,
    `${c.seniority} ${c.currentTitle}`.slice(0, 44),
    c.skills.slice(0, 8).join(','),
    compRelation(c, role),
    `${monthsAgo(c.tenureStart)}mo tenure`,
    prior,
    `${daysAgo(c.warmthAt)}d since touch`,
    c.status === 'active' ? '' : c.status,
  ].filter(Boolean).join('|')
}

/** Validates one compact row against the wave and expands it back to the public ScoredRow shape. */
function validateRow(row: unknown, candidates: ScoreCandidateInput[]): ScoredRow | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const idx = typeof r.i === 'number' ? r.i : Number(r.i)
  if (!Number.isInteger(idx) || idx < 0 || idx >= candidates.length) return null
  if (!isFiniteNum(r.s)) return null
  if (!isFiniteNum(r.k) || !isFiniteNum(r.l) || !isFiniteNum(r.c) || !isFiniteNum(r.t)) return null
  if (typeof r.w !== 'string' || !r.w.trim()) return null
  const flags = Array.isArray(r.f) ? r.f.filter((f): f is string => typeof f === 'string') : []
  return {
    candidateId: candidates[idx].id,
    score: clamp(r.s),
    sub: { skills: clamp(r.k), seniority: clamp(r.l), comp: clamp(r.c), timing: clamp(r.t) },
    why: r.w.trim().slice(0, 400),
    flags: flags.slice(0, 4),
  }
}

async function runScorePass(role: ScoreRoleInput, candidates: ScoreCandidateInput[], attempt: number): Promise<ScoredRow[]> {
  const system = `You are an elite recruiting analyst scoring past candidates against one open role.
Score EVERY row, 0-100 overall (s) plus sub-scores skills (k), seniority (l), comp (c), timing (t).
"w" is ONE short sentence grounded ONLY in that row's own facts — never invent a company, number or outcome.
Answer with JSON only, exactly this shape, one entry per input row, referencing rows by their index:
${RESPONSE_SHAPE}`

  const roleLine = [
    `TITLE: ${role.title} (${role.level}) — ${role.location}`,
    `BAND: ${role.compBand.min}-${role.compBand.max} ${role.compBand.currency}`,
    `MUST: ${role.mustHaves.join(', ') || 'none stated'}`,
    `NICE: ${role.niceToHaves.join(', ') || 'none'}`,
    `DEALBREAKERS: ${role.dealbreakers.join(', ') || 'none'}`,
  ].join('\n')

  const rows = candidates.map((c, i) => candidateLine(c, role, i)).join('\n')

  const prompt = `${roleLine}\n\nCANDIDATES (index|name|level+title|skills|comp vs band|tenure|last process|warmth|status):\n${rows}\n\nScore all ${candidates.length} rows. JSON only.` +
    (attempt ? `\n\nRetry: the previous pass returned no usable rows. Be decisive; return every index.` : '')

  const result = await complete({
    messages: [{ role: 'user', text: prompt }],
    system,
    json: true,
    temperature: attempt ? 0.5 : 0.25,
    maxTokens: 2048,
    // A 12-row wave is small; 8s comfortably covers a genuinely slow-but-alive provider while
    // a rate-limited one still fails fast (Groq answers a 429 in well under a second).
    timeoutMs: 8000,
  })

  const parsed = parseJson<{ r?: unknown[]; scored?: unknown[] }>(result.text)
  const list = Array.isArray(parsed?.r) ? parsed.r : Array.isArray(parsed?.scored) ? parsed.scored : []
  return list
    .map(row => validateRow(row, candidates))
    .filter((r): r is ScoredRow => r !== null)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  // Waves mean more requests per sync (5 for a 60-row bench), so the per-IP budget has to
  // cover a couple of full syncs a minute rather than a couple of calls.
  if (!rateLimit(clientIp(req.headers as Record<string, unknown>), 40)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' })
  }

  const body = req.body as ScoreRequestBody | undefined
  if (!body || typeof body !== 'object' || !body.role || !Array.isArray(body.candidates)) {
    return res.status(400).json({ error: 'role and candidates[] are required' })
  }

  const role = body.role
  // Server-side belt-and-braces. `opted_out` is a consent withdrawal: those people never
  // reach an AI prompt, full stop. Every other status is scored — non-active people stay
  // visible and comparable on the bench, and the UI de-prioritises them in ranking.
  const candidates = body.candidates.filter(c =>
    c && typeof c.id === 'string' && c.status !== 'opted_out' && Array.isArray(c.skills))

  if (candidates.length > MAX_CANDIDATES_PER_CALL) {
    return res.status(400).json({
      error: `Too many candidates in one call (${candidates.length}). Chunk to ${MAX_CANDIDATES_PER_CALL} per request.`,
    })
  }

  const contentHash = scoreFingerprint(role, candidates)

  if (candidates.length === 0) {
    return res.status(200).json({ roleId: role.id, scored: [], fallback: false, hash: contentHash } satisfies ScoreResponseBody)
  }

  try {
    let rows = await runScorePass(role, candidates, 0)
    if (rows.length === 0) {
      rows = await runScorePass(role, candidates, 1).catch(() => [])
    }

    if (rows.length === 0) {
      // Every LLM provider failed or returned nothing usable — the board is never empty.
      const fallbackRows = keywordFitFallback(role, candidates)
      return res.status(200).json({ roleId: role.id, scored: fallbackRows, fallback: true, hash: contentHash } satisfies ScoreResponseBody)
    }

    // Fill any candidates the model dropped with the deterministic fallback so every
    // candidate sent in gets a row back — a partial board is as bad as an empty one.
    const scoredIds = new Set(rows.map(r => r.candidateId))
    const missing = candidates.filter(c => !scoredIds.has(c.id))
    const filled = missing.map(c => scoreOneCandidateFallback(c, role))

    return res.status(200).json({
      roleId: role.id, scored: [...rows, ...filled], fallback: false, hash: contentHash,
    } satisfies ScoreResponseBody)
  } catch (err) {
    const debug = err instanceof AiError ? err.debug : String(err)
    console.error('[api/score]', debug)
    const fallbackRows = keywordFitFallback(role, candidates)
    return res.status(200).json({ roleId: role.id, scored: fallbackRows, fallback: true, hash: contentHash } satisfies ScoreResponseBody)
  }
}
