import type { VercelRequest, VercelResponse } from '@vercel/node'
import { complete, rateLimit, clientIp, parseJson, AiError } from './_lib/fastai.js'
import { keywordFitFallback, scoreOneCandidateFallback } from './_lib/scoreFallback.js'
import { scoreFingerprint } from '../src/lib/scoreFingerprint.js'
import type {
  ScoreRequestBody, ScoreResponseBody, ScoredRow, ScoreCandidateInput, ScoreRoleInput,
} from '../src/types/index.js'

const MAX_CANDIDATES_PER_CALL = 60

const RESPONSE_SCHEMA = `{
  "roleId": "string",
  "scored": [{
    "candidateId": "string",
    "score": number,
    "sub": { "skills": number, "seniority": number, "comp": number, "timing": number },
    "why": "string — one grounded sentence, cite the candidate's own history, never invent facts",
    "flags": ["string"]
  }]
}`

function isFiniteNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

/** Validates one row from the model's response against the candidate set. Drops anything malformed. */
function validateRow(row: unknown, validIds: Set<string>): ScoredRow | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  if (typeof r.candidateId !== 'string' || !validIds.has(r.candidateId)) return null
  if (!isFiniteNum(r.score)) return null
  const sub = r.sub as Record<string, unknown> | undefined
  if (!sub || !isFiniteNum(sub.skills) || !isFiniteNum(sub.seniority) || !isFiniteNum(sub.comp) || !isFiniteNum(sub.timing)) return null
  if (typeof r.why !== 'string' || !r.why.trim()) return null
  const flags = Array.isArray(r.flags) ? r.flags.filter((f): f is string => typeof f === 'string') : []
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
  return {
    candidateId: r.candidateId,
    score: clamp(r.score),
    sub: { skills: clamp(sub.skills), seniority: clamp(sub.seniority), comp: clamp(sub.comp), timing: clamp(sub.timing) },
    why: r.why.trim().slice(0, 400),
    flags: flags.slice(0, 5),
  }
}

async function runScorePass(role: ScoreRoleInput, candidates: ScoreCandidateInput[], attempt: number): Promise<ScoredRow[]> {
  const system = `You are an elite recruiting analyst scoring silver-medalist candidates against one open role.
Score EVERY candidate in the input, 0-100. Sub-scores (skills, seniority, comp, timing) are each 0-100.
"why" must be one grounded sentence using ONLY the facts given (skills, current title/employer, tenure, comp,
prior process reason) — never invent a company, a number, or an outcome that isn't in the input.
Return ONLY valid JSON matching this exact schema, one row per candidate:
${RESPONSE_SCHEMA}`

  const prompt = `ROLE:\n${JSON.stringify(role, null, 2)}\n\nCANDIDATES:\n${JSON.stringify(candidates, null, 2)}\n\n` +
    `Score all ${candidates.length} candidates. Return ONLY JSON, no markdown.` +
    (attempt ? `\n\nRun ${attempt + 1}: the previous pass returned no usable rows. Be decisive; score every candidate.` : '')

  // reasoning_effort is fixed to 'low' inside fastai's groqBody() — every Groq call already
  // gets that, no option to pass here.
  //
  // timeoutMs is deliberately short (fastai's default is 20s, shared across the WHOLE
  // Groq+Gemini provider ladder in one AbortController, not per-provider). BLUEPRINT-v2.md's
  // Definition of Done wants a role synced in under 4s; on Mark's actual Groq tier a role with
  // more than ~25-30 active candidates structurally exceeds the account's 8,000 TPM cap for
  // gpt-oss-120b/20b (measured: a 40-candidate call needs ~8,800 tokens), so the AI branch is
  // *going* to fail for a typical full-bench sync — the only question is how long the UI waits
  // to find that out. A live provider that's genuinely just slow (not rate-limited) rarely
  // needs anywhere near 20s to answer; a live provider that's rate-limited answers in well
  // under a second. Capping at 3s means a real, in-budget score still completes comfortably,
  // while a doomed one hands off to the deterministic keyword-fit fallback fast instead of
  // making the recruiter stare at a spinner for 20-40s across the two runScorePass attempts.
  const result = await complete({
    messages: [{ role: 'user', text: prompt }],
    system,
    json: true,
    temperature: attempt ? 0.6 : 0.3,
    maxTokens: 4096,
    timeoutMs: 3000,
  })

  const parsed = parseJson<{ scored?: unknown[] }>(result.text)
  const validIds = new Set(candidates.map(c => c.id))
  const rows = (parsed?.scored ?? [])
    .map(row => validateRow(row, validIds))
    .filter((r): r is ScoredRow => r !== null)
  return rows
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!rateLimit(clientIp(req.headers as Record<string, unknown>), 20)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' })
  }

  const body = req.body as ScoreRequestBody | undefined
  if (!body || typeof body !== 'object' || !body.role || !Array.isArray(body.candidates)) {
    return res.status(400).json({ error: 'role and candidates[] are required' })
  }

  const role = body.role
  // Server-side belt-and-braces: only ever score active candidates, and never a bare id
  // list — silently drop rows missing required fields rather than 500ing the whole board.
  const candidates = body.candidates.filter(c =>
    c && typeof c.id === 'string' && c.status === 'active' && Array.isArray(c.skills))

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
