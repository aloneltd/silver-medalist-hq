import type { VercelRequest, VercelResponse } from '@vercel/node'
import { complete, rateLimit, clientIp, parseJson, AiError } from './_lib/fastai.js'
import type { CaptureDraft } from '../src/types/index.js'

/**
 * The Capture bookmarklet's payload -> a structured person.
 *
 * The bookmarklet sends whatever the page showed: a name, a headline, a location, the URL and
 * the visible text. This turns that into our fields. It is allowed to fail — the client builds
 * the person from the name and headline alone when it does — so nothing here retries forever
 * or invents a fact to fill a gap.
 */

const SCHEMA = `{
  "name": "the person's full name",
  "currentTitle": "their job title today",
  "currentEmployer": "where they work today",
  "location": "City, Country",
  "seniority": "junior | mid | senior | staff | principal | exec",
  "skills": ["string"],
  "summary": "one plain sentence about what they do, in under 200 characters"
}`

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!rateLimit(clientIp(req.headers as Record<string, unknown>), 20)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' })
  }

  const body = (req.body ?? {}) as CaptureDraft
  const parts = [
    body.name ? `Name on the page: ${body.name}` : '',
    body.headline ? `Headline: ${body.headline}` : '',
    body.location ? `Location: ${body.location}` : '',
    body.url ? `Page: ${body.url}` : '',
    body.site ? `Site: ${body.site}` : '',
    body.text ? `Visible text:\n${String(body.text).slice(0, 12000)}` : '',
  ].filter(Boolean).join('\n')

  if (!parts.trim()) {
    return res.status(400).json({ error: 'Nothing was captured from that page.' })
  }

  const system = `You are reading one profile page that a recruiter just captured. Pull out the
person it is about. Return ONLY valid JSON matching this exact schema:
${SCHEMA}

Rules:
- Use only what is on the page. Omit any field the page does not say — never guess an employer,
  a location or a seniority that is not there.
- The page may include navigation, adverts and other people's names. The person the page is
  about is the one in the headline near the top.
- summary: describe what they do in the page's own terms. No praise, no invented detail.`

  try {
    const result = await complete({
      messages: [{ role: 'user', text: parts }],
      system,
      json: true,
      temperature: 0.15,
      maxTokens: 900,
    })

    const parsed = parseJson<Record<string, unknown>>(result.text)
    if (!parsed) {
      return res.status(502).json({ error: 'Could not read that page — add the details by hand.' })
    }

    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
    const validSeniority = new Set(['junior', 'mid', 'senior', 'staff', 'principal', 'exec'])
    const seniority = str(parsed.seniority)

    return res.status(200).json({
      name: str(parsed.name) ?? str(body.name),
      currentTitle: str(parsed.currentTitle),
      currentEmployer: str(parsed.currentEmployer),
      location: str(parsed.location) ?? str(body.location),
      seniority: seniority && validSeniority.has(seniority) ? seniority : undefined,
      skills: Array.isArray(parsed.skills)
        ? parsed.skills.filter((s): s is string => typeof s === 'string').slice(0, 40)
        : [],
      summary: str(parsed.summary),
    })
  } catch (err) {
    const debug = err instanceof AiError ? err.debug : String(err)
    console.error('[api/capture-structure]', debug)
    return res.status(err instanceof AiError && err.status === 429 ? 429 : 502).json({
      error: err instanceof AiError ? err.message : 'The AI service had a hiccup — please try again.',
    })
  }
}
