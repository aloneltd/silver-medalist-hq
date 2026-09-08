import type { VercelRequest, VercelResponse } from '@vercel/node'
import { complete, rateLimit, clientIp, parseJson, AiError } from './_lib/fastai.js'
import type { IngestJdRequestBody, IngestJdResponseBody } from '../src/types/index.js'

const SCHEMA = `{
  "title": "string",
  "team": "string or omit",
  "level": "string, e.g. Senior / Staff / Manager / Exec",
  "location": "string",
  "onsiteDays": "number 0-5 or omit if unclear",
  "compBand": { "min": number, "max": number, "currency": "USD" },
  "mustHaves": ["string"],
  "niceToHaves": ["string"],
  "dealbreakers": ["string"],
  "urgency": { "score": "1-5 integer", "reasons": ["string"] },
  "hiringManager": "string or omit"
}`

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!rateLimit(clientIp(req.headers as Record<string, unknown>), 20)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' })
  }

  const body = req.body as IngestJdRequestBody | undefined
  if (!body || typeof body.text !== 'string' || !body.text.trim()) {
    return res.status(400).json({ error: 'text is required' })
  }

  const system = `Extract a structured role from this job description. Only use what's in the text —
if compensation, urgency, or a hiring manager isn't mentioned, omit that field rather than guessing a number.
Return ONLY valid JSON matching this exact schema:\n${SCHEMA}`

  try {
    const result = await complete({
      messages: [{ role: 'user', text: body.text.slice(0, 12000) }],
      system,
      json: true,
      temperature: 0.2,
      maxTokens: 1200,
    })

    const parsed = parseJson<Record<string, unknown>>(result.text)
    if (!parsed || typeof parsed.title !== 'string' || !parsed.title.trim()) {
      return res.status(502).json({ error: 'Could not read a role from that text — please try again or fill it in by hand.' })
    }

    const compBand = parsed.compBand as Record<string, unknown> | undefined
    const urgency = parsed.urgency as Record<string, unknown> | undefined
    const clampScore = (n: unknown): 1 | 2 | 3 | 4 | 5 => {
      const v = Math.round(typeof n === 'number' ? n : 3)
      return (Math.max(1, Math.min(5, v)) as 1 | 2 | 3 | 4 | 5)
    }

    const role: IngestJdResponseBody = {
      title: parsed.title.trim(),
      team: typeof parsed.team === 'string' ? parsed.team : undefined,
      level: typeof parsed.level === 'string' ? parsed.level : 'unspecified',
      location: typeof parsed.location === 'string' ? parsed.location : 'unspecified',
      onsiteDays: typeof parsed.onsiteDays === 'number' ? parsed.onsiteDays : undefined,
      compBand: compBand && typeof compBand.min === 'number' && typeof compBand.max === 'number'
        ? { min: compBand.min, max: compBand.max, currency: typeof compBand.currency === 'string' ? compBand.currency : 'USD' }
        : { min: 0, max: 0, currency: 'USD' },
      mustHaves: Array.isArray(parsed.mustHaves) ? parsed.mustHaves.filter((s): s is string => typeof s === 'string') : [],
      niceToHaves: Array.isArray(parsed.niceToHaves) ? parsed.niceToHaves.filter((s): s is string => typeof s === 'string') : [],
      dealbreakers: Array.isArray(parsed.dealbreakers) ? parsed.dealbreakers.filter((s): s is string => typeof s === 'string') : [],
      urgency: { score: clampScore(urgency?.score), reasons: Array.isArray(urgency?.reasons) ? (urgency!.reasons as unknown[]).filter((s): s is string => typeof s === 'string') : [] },
      hiringManager: typeof parsed.hiringManager === 'string' ? parsed.hiringManager : undefined,
      status: 'open',
    }

    return res.status(200).json(role)
  } catch (err) {
    const debug = err instanceof AiError ? err.debug : String(err)
    console.error('[api/ingest-jd]', debug)
    return res.status(err instanceof AiError && err.status === 429 ? 429 : 502).json({
      error: err instanceof AiError ? err.message : 'The AI service had a hiccup — please try again.',
    })
  }
}
