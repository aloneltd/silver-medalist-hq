import type { VercelRequest, VercelResponse } from '@vercel/node'
import { stream, rateLimit, clientIp, AiError } from './_lib/fastai.js'
import type { BriefFact } from '../src/services/briefFacts.js'

/**
 * POST /api/brief — the Daily Brief's ONLY job here is ordering and phrasing a fact list that
 * src/services/briefFacts.ts already computed from real bench data. DESIGN-v2.1.md's council
 * amendment: "the model only orders and phrases it; never predictions, off-bench info, mood, or
 * names it wasn't handed." The client (getBrief) re-validates the response with
 * briefFacts.validatePhrasing() and falls back to the deterministic template on any failure or
 * a rejected phrasing — this endpoint doesn't need to be perfect, just fast and grounded.
 */

interface BriefRequestBody {
  facts: BriefFact[]
  /** Computed client-side (e.g. "Tuesday, 8 September") so the model never guesses the date. */
  dateLabel: string
}

function isValidBody(b: unknown): b is BriefRequestBody {
  if (!b || typeof b !== 'object') return false
  const r = b as Record<string, unknown>
  return Array.isArray(r.facts) && typeof r.dateLabel === 'string' && r.dateLabel.trim().length > 0
}

const SYSTEM_PROMPT = `You write the "Daily Brief" opener for a recruiter's dashboard from a JSON fact list that was
already computed by code. You ONLY order and phrase those facts into 3-5 short sentences — never
invent a number, a name, a company, a prediction, or a mood that isn't in the JSON. Every sentence
must trace to exactly one fact object; never combine or infer beyond what's given.

Opening line, this exact structure: "{dateLabel} — {N} things need you. {a short plain-English
clause describing the single biggest fact, using its real names/count}." N is the sum of every
fact's "count". Example, given dateLabel "Tuesday 8 September" and a biggest fact
{kind:"stale_strong", count:19, names:["Rafael Kimani", ...]}: "Tuesday 8 September — 30 things
need you. 19 strong fits have gone quiet for a month or more." Never write a fact's "kind" value
or the words "described as" into the sentence — always turn it into ordinary prose.
Then one short sentence per remaining fact, ordered by count descending, naming the real people
from that fact's "names" array (at most 3 names per sentence; if there are more, say "and N more").
If the fact list is empty, reply with exactly: "Nothing needs you today."
Plain text only — no markdown, no headings, no bullet points, no emoji.`

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!rateLimit(clientIp(req.headers as Record<string, unknown>), 20)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' })
  }

  const body = req.body as unknown
  if (!isValidBody(body)) return res.status(400).json({ error: 'facts[] and dateLabel are required' })

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Accel-Buffering', 'no')

  if (body.facts.length === 0) {
    res.write('Nothing needs you today.')
    return res.end()
  }

  const prompt = `dateLabel: ${body.dateLabel}\nfacts (JSON, already computed — do not add or remove anything):\n${JSON.stringify(body.facts)}\n\nWrite the brief now.`

  try {
    await stream(
      { messages: [{ role: 'user', text: prompt }], system: SYSTEM_PROMPT, temperature: 0.4, maxTokens: 350, timeoutMs: 10000 },
      delta => { res.write(delta) },
    )
    return res.end()
  } catch (err) {
    // The client's getBrief() falls back to its own deterministic template on an empty body,
    // so an honest empty response is enough here — no need to fake a phrased brief.
    const debug = err instanceof AiError ? err.debug : String(err)
    console.error('[api/brief]', debug)
    return res.end()
  }
}
