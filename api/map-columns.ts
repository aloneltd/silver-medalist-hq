import type { VercelRequest, VercelResponse } from '@vercel/node'
import { complete, rateLimit, clientIp, parseJson, AiError } from './_lib/fastai.js'
import type { ImportFieldKey, ParseResumeResponseBody } from '../src/types/index.js'

/**
 * Two jobs, one endpoint, because both are "read this and give me our fields back":
 *
 *   mode: 'columns'  headers we could not match by rule -> { column, field } pairs
 *   mode: 'resume'   the text of a CV                   -> a candidate
 *
 * Everything the model returns is validated here as well as on the client. A field name that
 * is not one of ours is dropped rather than trusted, so a bad answer can only ever mean "we
 * did not map that column", never a wrong write.
 */

const FIELDS: ImportFieldKey[] = [
  'name', 'firstName', 'lastName', 'email', 'phone', 'linkedin', 'location',
  'currentEmployer', 'currentTitle', 'seniority', 'skills', 'tenureStart',
  'compExpectation', 'compAtLastProcess', 'noticePeriodDays', 'tags', 'notes',
  'status', 'statusReason',
  'processRole', 'processStage', 'processReason', 'processDate', 'processLostTo',
  'sourceUrl', 'skip',
]
const FIELD_SET = new Set<string>(FIELDS)

const FIELD_GUIDE = `
name / firstName / lastName — the person's name
email, phone, linkedin — how to reach them
location — where they are
currentEmployer, currentTitle, seniority, skills, tenureStart — their job today
compExpectation (what they want) / compAtLastProcess (what they were on), noticePeriodDays
tags, notes — free text and labels
status, statusReason — ONLY for a do-not-contact / opted-out column
processRole — the job they applied for; processStage — how far they got; processReason — why
  they did not get it; processDate — when; processLostTo — who got it instead
sourceUrl — a link back to the original record
skip — anything else, including ids, recruiter names and internal timestamps
`.trim()

const RESUME_SCHEMA = `{
  "name": "full name",
  "email": "string or omit",
  "phone": "string or omit",
  "linkedin": "profile URL or omit",
  "location": "City, Country",
  "currentEmployer": "string",
  "currentTitle": "string",
  "seniority": "junior | mid | senior | staff | principal | exec",
  "skills": ["string"],
  "compExpectation": { "amount": number, "currency": "USD" }
}`

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!rateLimit(clientIp(req.headers as Record<string, unknown>), 20)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' })
  }

  const body = (req.body ?? {}) as {
    mode?: string
    headers?: unknown
    samples?: unknown
    text?: unknown
    filename?: unknown
  }

  try {
    if (body.mode === 'resume') return await handleResume(body, res)
    return await handleColumns(body, res)
  } catch (err) {
    const debug = err instanceof AiError ? err.debug : String(err)
    console.error('[api/map-columns]', debug)
    return res.status(err instanceof AiError && err.status === 429 ? 429 : 502).json({
      error: err instanceof AiError ? err.message : 'The AI service had a hiccup — please try again.',
    })
  }
}

async function handleColumns(
  body: { headers?: unknown; samples?: unknown },
  res: VercelResponse,
) {
  const headers = Array.isArray(body.headers)
    ? body.headers.filter((h): h is string => typeof h === 'string' && !!h.trim()).slice(0, 80)
    : []
  if (!headers.length) return res.status(400).json({ error: 'headers is required' })

  const samples = (body.samples ?? {}) as Record<string, unknown>
  const described = headers.map(h => {
    const values = Array.isArray(samples[h])
      ? (samples[h] as unknown[]).filter(v => typeof v === 'string').slice(0, 2).join(' | ')
      : ''
    return values ? `- "${h}" (for example: ${String(values).slice(0, 160)})` : `- "${h}"`
  }).join('\n')

  const system = `You map spreadsheet columns from a recruiting export onto a fixed set of fields.
These are the ONLY field names you may use:
${FIELD_GUIDE}

Return ONLY valid JSON: {"mapping":[{"column":"<the header, copied exactly>","field":"<one field name>"}]}
Include every column given to you. Use "skip" when no field fits — a wrong guess is worse than
skipping. Never invent a field name that is not in the list above.`

  const result = await complete({
    messages: [{ role: 'user', text: `Columns:\n${described}` }],
    system,
    json: true,
    temperature: 0.1,
    maxTokens: 1200,
  })

  const parsed = parseJson<{ mapping?: unknown }>(result.text)
  const rows = Array.isArray(parsed?.mapping) ? parsed.mapping : []
  const known = new Set(headers)
  const mapping: { column: string; field: ImportFieldKey }[] = []
  for (const row of rows as unknown[]) {
    if (!row || typeof row !== 'object') continue
    const { column, field } = row as { column?: unknown; field?: unknown }
    if (typeof column !== 'string' || !known.has(column)) continue
    if (typeof field !== 'string' || !FIELD_SET.has(field)) continue
    mapping.push({ column, field: field as ImportFieldKey })
  }

  return res.status(200).json({ mapping })
}

async function handleResume(
  body: { text?: unknown; filename?: unknown },
  res: VercelResponse,
) {
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return res.status(400).json({ error: 'text is required' })

  const system = `You are an expert recruiter reading one CV. Return ONLY valid JSON matching this
exact schema (no markdown, no code fences):
${RESUME_SCHEMA}

Rules:
- Use only what is in the text. If a field is not stated, omit it rather than guessing.
- seniority: infer from the titles and dates (junior <2y, mid 2-5y, senior 5-8y, staff/principal 8y+, exec = VP or C-level).
- compExpectation: only if a number is actually written in the CV.
- skills: every technology, tool, language and framework named.`

  const result = await complete({
    messages: [{ role: 'user', text: text.slice(0, 16000) }],
    system,
    json: true,
    temperature: 0.15,
    maxTokens: 1400,
  })

  const parsed = parseJson<Record<string, unknown>>(result.text)
  if (!parsed || typeof parsed.name !== 'string' || !parsed.name.trim()) {
    return res.status(502).json({ error: 'Could not read a person out of that CV.' })
  }

  const validSeniority = new Set(['junior', 'mid', 'senior', 'staff', 'principal', 'exec'])
  const comp = parsed.compExpectation as Record<string, unknown> | undefined
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

  const candidate: ParseResumeResponseBody = {
    name: parsed.name.trim(),
    email: str(parsed.email),
    phone: str(parsed.phone),
    linkedin: str(parsed.linkedin),
    location: str(parsed.location) ?? 'unspecified',
    currentEmployer: str(parsed.currentEmployer) ?? 'Unknown',
    currentTitle: str(parsed.currentTitle) ?? 'Unknown',
    seniority: typeof parsed.seniority === 'string' && validSeniority.has(parsed.seniority)
      ? (parsed.seniority as ParseResumeResponseBody['seniority']) : 'mid',
    skills: Array.isArray(parsed.skills) ? parsed.skills.filter((s): s is string => typeof s === 'string').slice(0, 60) : [],
    compExpectation: comp && typeof comp.amount === 'number'
      ? { amount: comp.amount, currency: typeof comp.currency === 'string' ? comp.currency : 'USD', date: new Date().toISOString() }
      : undefined,
    tags: [],
    status: 'active',
  }

  return res.status(200).json(candidate)
}
