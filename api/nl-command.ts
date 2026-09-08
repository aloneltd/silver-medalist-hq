import type { VercelRequest, VercelResponse } from '@vercel/node'
import { complete, rateLimit, clientIp, parseJson, AiError } from './_lib/fastai.js'
import type { NLPlan, NLAction, NLFilterSpec, NLPlanParams } from '../src/services/nlCommand.js'

/**
 * POST /api/nl-command — natural-language ⌘K → a strict JSON plan (DESIGN-v2.1.md §C.2). The
 * model NEVER resolves candidate ids or dates: `target` is a description the client resolves
 * against its own Dexie bench (src/services/nlCommand.ts:resolveFilter), and `params.until` is
 * whatever relative-date phrase the recruiter actually said, resolved in code
 * (resolveRelativeDate) — never guessed by the model. fastai's complete() already caches on the
 * exact (system, json, temperature, messages) tuple, so normalizing whitespace/case here before
 * building the prompt is what makes "snooze everyone" and "Snooze everyone" share one cache hit.
 */

const VALID_ACTIONS: NLAction[] = ['snooze', 'status', 'tag', 'filter', 'compose', 'move_stage']
const VALID_STATUSES = ['active', 'silent', 'took_role', 'do_not_reapproach', 'opted_out']
const VALID_SENIORITY = ['junior', 'mid', 'senior', 'staff', 'principal', 'exec']
const VALID_STAGES = ['warm', 'reached_out', 'replied', 'interviewing', 'offer', 'placed', 'passed']
const VALID_TONES = ['warm', 'direct', 'short']

const SYSTEM_PROMPT = `You translate one recruiter command into a strict JSON plan for a candidate CRM. You never
touch a database and you never resolve a date yourself — you only describe what the command
means. Never invent a person, skill, location or number that wasn't in the command.

Valid actions: ${VALID_ACTIONS.join(' | ')}
Valid statuses: ${VALID_STATUSES.join(' | ')}
Valid seniority levels: ${VALID_SENIORITY.join(' | ')}
Valid board stages: ${VALID_STAGES.join(' | ')}
Valid tones: ${VALID_TONES.join(' | ')}

Return JSON only, exactly this shape (omit any field the command gives no evidence for):
{
  "action": "<one of the valid actions>",
  "target": {
    "names": ["<specific person names mentioned, verbatim>"],
    "status": ["<candidate statuses this targets>"],
    "tag": "<a tag mentioned>",
    "location": "<a location mentioned>",
    "skillsInclude": ["<skills mentioned>"],
    "seniority": ["<seniority levels mentioned>"],
    "boardStage": "<a board stage mentioned>",
    "compMaxUSD": <a max USD comp figure if stated>,
    "text": "<any other free-text search phrase, e.g. a role title or keyword>"
  },
  "params": {
    "until": "<the RAW date phrase from the command, verbatim — e.g. 'spring', 'next month', 'in 2 weeks' — NEVER a resolved calendar date>",
    "status": "<the single new status this command sets, only for action=status>",
    "tag": "<the tag to add, only for action=tag>",
    "stage": "<the new board stage, only for action=move_stage>",
    "tone": "<warm|direct|short, only for action=compose>"
  },
  "explanation": "<one short sentence, in the recruiter's own words, describing what this does>"
}
Only include target/params fields that are actually relevant to the chosen action. "filter" is
the fallback action for anything that's just a search/question rather than a command that
changes something.`

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  const arr = v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
  return arr.length ? arr : undefined
}

function asEnumArray<T extends string>(v: unknown, valid: readonly T[]): T[] | undefined {
  const arr = asStringArray(v)
  if (!arr) return undefined
  const filtered = arr.filter((x): x is T => (valid as readonly string[]).includes(x))
  return filtered.length ? filtered : undefined
}

function validateTarget(t: unknown): NLFilterSpec {
  if (!t || typeof t !== 'object') return {}
  const r = t as Record<string, unknown>
  const target: NLFilterSpec = {}
  const names = asStringArray(r.names)
  if (names) target.names = names
  const status = asEnumArray(r.status, VALID_STATUSES)
  if (status) target.status = status as NLFilterSpec['status']
  if (typeof r.tag === 'string' && r.tag.trim()) target.tag = r.tag.trim()
  if (typeof r.location === 'string' && r.location.trim()) target.location = r.location.trim()
  const skills = asStringArray(r.skillsInclude)
  if (skills) target.skillsInclude = skills
  const seniority = asEnumArray(r.seniority, VALID_SENIORITY)
  if (seniority) target.seniority = seniority as NLFilterSpec['seniority']
  if (typeof r.boardStage === 'string' && (VALID_STAGES as string[]).includes(r.boardStage)) {
    target.boardStage = r.boardStage as NLFilterSpec['boardStage']
  }
  if (typeof r.compMaxUSD === 'number' && Number.isFinite(r.compMaxUSD)) target.compMaxUSD = r.compMaxUSD
  if (typeof r.text === 'string' && r.text.trim()) target.text = r.text.trim()
  return target
}

function validateParams(p: unknown): NLPlanParams {
  if (!p || typeof p !== 'object') return {}
  const r = p as Record<string, unknown>
  const params: NLPlanParams = {}
  if (typeof r.until === 'string' && r.until.trim()) params.until = r.until.trim()
  if (typeof r.status === 'string' && (VALID_STATUSES as string[]).includes(r.status)) {
    params.status = r.status as NLPlanParams['status']
  }
  if (typeof r.tag === 'string' && r.tag.trim()) params.tag = r.tag.trim()
  if (typeof r.stage === 'string' && (VALID_STAGES as string[]).includes(r.stage)) {
    params.stage = r.stage as NLPlanParams['stage']
  }
  if (typeof r.tone === 'string' && (VALID_TONES as string[]).includes(r.tone)) {
    params.tone = r.tone as NLPlanParams['tone']
  }
  return params
}

/** Validates the model's raw JSON into a strict NLPlan, or returns null if it's unusable. */
export function validatePlan(raw: unknown, fallbackText: string): NLPlan | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const action = typeof r.action === 'string' && (VALID_ACTIONS as string[]).includes(r.action)
    ? (r.action as NLAction)
    : 'filter'
  const explanation = typeof r.explanation === 'string' && r.explanation.trim()
    ? r.explanation.trim().slice(0, 200)
    : `Search for "${fallbackText}"`
  return { action, target: validateTarget(r.target), params: validateParams(r.params), explanation }
}

function isValidBody(b: unknown): b is { text: string } {
  if (!b || typeof b !== 'object') return false
  const text = (b as Record<string, unknown>).text
  return typeof text === 'string' && text.trim().length > 0
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!rateLimit(clientIp(req.headers as Record<string, unknown>), 20)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' })
  }

  const body = req.body as unknown
  if (!isValidBody(body)) return res.status(400).json({ error: 'text is required' })

  const text = normalize(body.text).slice(0, 400)

  try {
    const result = await complete({
      messages: [{ role: 'user', text }],
      system: SYSTEM_PROMPT,
      json: true,
      temperature: 0.2,
      maxTokens: 350,
      timeoutMs: 8000,
    })
    const parsed = parseJson<unknown>(result.text)
    const plan = validatePlan(parsed, text)
    if (!plan) throw new AiError(502, 'Could not understand that command.', `unparseable model output: ${result.text.slice(0, 300)}`)
    return res.status(200).json({ plan } satisfies { plan: NLPlan })
  } catch (err) {
    // Falls back to a plain-search plan (DESIGN-v2.1.md §C.2: "Falls back to plain search")
    // rather than surfacing a raw AI error for something as routine as ⌘K.
    const debug = err instanceof AiError ? err.debug : String(err)
    console.error('[api/nl-command]', debug)
    const fallback: NLPlan = { action: 'filter', target: { text }, params: {}, explanation: `Search for "${text}"` }
    return res.status(200).json({ plan: fallback, fallback: true })
  }
}
