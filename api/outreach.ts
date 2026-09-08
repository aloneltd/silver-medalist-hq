import type { VercelRequest, VercelResponse } from '@vercel/node'
import { stream, rateLimit, clientIp, AiError } from './_lib/fastai.js'
import type { OutreachRequestBody } from '../src/types/index.js'

const TONE_GUIDANCE: Record<OutreachRequestBody['tone'], string> = {
  warm: 'Warm and personal — like writing to someone you respect and stayed in touch with.',
  direct: 'Direct and efficient — get to the opportunity fast, still respectful.',
  short: 'Very short — 3-4 sentences total, the minimum needed to open a conversation.',
}

const STEP_GUIDANCE: Record<number, string> = {
  0: 'This is the first message — a full introduction of the opportunity.',
  3: 'This is a Day 3 nudge — assume no reply yet, reference the first email briefly, add one new reason to reply.',
  7: 'This is a Day 7 LinkedIn note — very short, casual, a last light touch before moving on.',
}

function isValidBody(b: unknown): b is OutreachRequestBody {
  if (!b || typeof b !== 'object') return false
  const r = b as Record<string, unknown>
  return typeof r.candidateName === 'string' && r.candidateName.trim().length > 0
    && typeof r.roleTitle === 'string' && r.roleTitle.trim().length > 0
    && (r.tone === 'warm' || r.tone === 'direct' || r.tone === 'short')
    && typeof r.reason === 'string'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!rateLimit(clientIp(req.headers as Record<string, unknown>), 20)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' })
  }

  const body = req.body as unknown
  if (!isValidBody(body)) {
    return res.status(400).json({ error: 'candidateName, roleTitle, tone and reason are required' })
  }

  const step = body.sequenceStep ?? 0
  const system = `You write outreach messages for a recruiter re-engaging a "silver medalist" — a strong
candidate who came second (or close) for a previous role. Ground every claim ONLY in the facts given below.
Never invent a company, a number, a mutual contact, or a prior conversation that wasn't given to you.
Tone: ${TONE_GUIDANCE[body.tone]}
${STEP_GUIDANCE[step] ?? STEP_GUIDANCE[0]}
Always end with one concrete, specific ask (a question or a suggested next step) — never a vague "let me know".
Never say the message was sent automatically; this is a draft a human will review before sending.`

  const prompt = `Candidate: ${body.candidateName}
Role we're reaching out about: ${body.roleTitle}
Why now / context (the honest reason they're a fit, and their history with us): ${body.reason}
${body.candidateNotes ? `Additional notes about this candidate: ${body.candidateNotes}` : ''}

Write the message now. If this is an email (Day 0 or Day 3), start with a "Subject:" line, then the body.
If this is a LinkedIn note (Day 7), skip the subject line — just the message.`

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Accel-Buffering', 'no')

  try {
    await stream(
      { messages: [{ role: 'user', text: prompt }], system, temperature: 0.75, maxTokens: 700 },
      delta => { res.write(delta) },
    )
    return res.end()
  } catch (err) {
    if (!res.writableEnded) {
      res.write(`\n\n${err instanceof AiError ? err.message : 'The AI service is unavailable right now.'}`)
    }
    return res.end()
  }
}
