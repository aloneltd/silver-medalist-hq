/**
 * fastai — one shared fast-inference brick for every Vercel app.
 *
 * Order of preference:
 *   1. Groq  openai/gpt-oss-120b   (~600 tok/s, sub-second first token, streams)
 *   2. Groq  openai/gpt-oss-20b    (same account, different capacity pool)
 *   3. Gemini gemini-2.5-flash     (thinking OFF — otherwise reasoning eats the token budget)
 *   4. Gemini gemini-3.5-flash-lite
 *
 * Every provider is a subscription/free tier Mark already has. No per-token paid APIs.
 * Repeated prompts are served from a module-level LRU+TTL cache (free + instant on warm lambdas).
 */

export type Role = 'user' | 'assistant' | 'model' | 'system'
export interface Msg { role: Role; text: string }

export interface AiOptions {
  messages: Msg[]
  system?: string
  /** ask for a strict JSON object back */
  json?: boolean
  temperature?: number
  maxTokens?: number
  /** skip Groq (e.g. when the task needs Google Search grounding) */
  geminiOnly?: boolean
  /** Google Search grounding — Gemini only */
  useSearch?: boolean
  timeoutMs?: number
}

export interface AiResult {
  text: string
  model: string
  cached: boolean
  sources?: { title: string; uri: string }[]
  /** non-secret upstream diagnostics, useful when everything failed */
  debug?: string
}

export class AiError extends Error {
  constructor(public status: number, message: string, public debug = '') { super(message) }
}

/* ------------------------------------------------------------------ cache */

const CACHE_MAX = 250
const CACHE_TTL = 10 * 60_000
const cache = new Map<string, { text: string; model: string; exp: number }>()

function hash(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 16777619)
    h2 = Math.imul(h2 + c, 2654435761)
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36)
}

export function cacheKey(opts: AiOptions): string {
  return hash(JSON.stringify([
    opts.system ?? '', opts.json ?? false, opts.temperature ?? 0.7,
    opts.useSearch ?? false, opts.messages.map(m => [m.role, m.text]),
  ]))
}

function cacheGet(k: string) {
  const hit = cache.get(k)
  if (!hit) return null
  if (Date.now() > hit.exp) { cache.delete(k); return null }
  cache.delete(k); cache.set(k, hit)   // refresh LRU recency
  return hit
}

function cacheSet(k: string, text: string, model: string) {
  if (!text) return
  cache.set(k, { text, model, exp: Date.now() + CACHE_TTL })
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string)
}

/* ------------------------------------------------------------------ groq */

const GROQ_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b']
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-3.5-flash-lite']

function groqBody(model: string, o: AiOptions, stream: boolean) {
  const messages: { role: string; content: string }[] = []
  if (o.system) messages.push({ role: 'system', content: o.system })
  for (const m of o.messages) {
    if (!m.text) continue
    messages.push({ role: m.role === 'model' || m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user', content: m.text })
  }
  return {
    model,
    messages,
    stream,
    // gpt-oss is a reasoning model; "low" keeps first-token latency well under a second
    reasoning_effort: 'low',
    temperature: o.temperature ?? 0.7,
    max_tokens: o.maxTokens ?? 1024,
    ...(o.json ? { response_format: { type: 'json_object' } } : {}),
  }
}

async function groqFetch(model: string, o: AiOptions, stream: boolean, signal: AbortSignal) {
  return fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(groqBody(model, o, stream)),
    signal,
  })
}

/* ---------------------------------------------------------------- gemini */

function geminiBody(o: AiOptions) {
  const contents = o.messages
    .filter(m => m.text && m.role !== 'system')
    .map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }))
  const body: Record<string, unknown> = {
    contents: contents.length ? contents : [{ role: 'user', parts: [{ text: o.system ?? 'Hello' }] }],
    generationConfig: {
      temperature: o.temperature ?? 0.7,
      maxOutputTokens: o.maxTokens ?? 1024,
      // Thinking off keeps latency down and stops reasoning eating the token budget —
      // but gemini-2.5-flash REJECTS a zero budget when Search grounding is on, because
      // it needs that budget to plan its queries. Omit it in that one case.
      ...(o.useSearch ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
      ...(o.json ? { responseMimeType: 'application/json' } : {}),
    },
  }
  if (o.system) body.systemInstruction = { parts: [{ text: o.system }] }
  if (o.useSearch) body.tools = [{ google_search: {} }]
  return body
}

async function geminiFetch(model: string, o: AiOptions, signal: AbortSignal) {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(geminiBody(o)), signal },
  )
}

function geminiText(data: any): { text: string; sources: { title: string; uri: string }[] } {
  const cand = data?.candidates?.[0]
  const text = (cand?.content?.parts ?? []).map((p: any) => p.text ?? '').join('')
  const sources: { title: string; uri: string }[] = []
  for (const c of cand?.groundingMetadata?.groundingChunks ?? []) {
    if (c?.web?.uri) sources.push({ title: c.web.title || 'Source', uri: c.web.uri })
  }
  return { text, sources }
}

/* ------------------------------------------------------------- public API */

/** Non-streaming completion with cache + full provider fallback chain. */
export async function complete(o: AiOptions): Promise<AiResult> {
  const key = cacheKey(o)
  const hit = cacheGet(key)
  if (hit) return { text: hit.text, model: hit.model, cached: true }

  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 20_000)
  const notes: string[] = []

  try {
    if (process.env.GROQ_API_KEY && !o.geminiOnly && !o.useSearch) {
      for (const model of GROQ_MODELS) {
        try {
          const r = await groqFetch(model, o, false, ctl.signal)
          if (r.ok) {
            const d: any = await r.json()
            const text = d?.choices?.[0]?.message?.content ?? ''
            if (text) { cacheSet(key, text, model); return { text, model, cached: false } }
            notes.push(`${model}:empty`)
          } else {
            notes.push(`${model}:${r.status}:${(await r.text().catch(() => '')).slice(0, 160)}`)
          }
        } catch (e) { notes.push(`${model}:${(e as Error).name}`) }
      }
    }

    if (process.env.GEMINI_API_KEY) {
      for (const model of GEMINI_MODELS) {
        try {
          const r = await geminiFetch(model, o, ctl.signal)
          if (r.ok) {
            const { text, sources } = geminiText(await r.json())
            if (text) { cacheSet(key, text, model); return { text, model, cached: false, sources } }
            notes.push(`${model}:empty`)
          } else {
            notes.push(`${model}:${r.status}:${(await r.text().catch(() => '')).slice(0, 160)}`)
          }
        } catch (e) { notes.push(`${model}:${(e as Error).name}`) }
      }
    }

    const debug = notes.join(' | ')
    const rateLimited = /:429/.test(debug)
    throw new AiError(rateLimited ? 429 : 502,
      rateLimited ? 'The AI is busy right now — try again in a moment.' : 'The AI service is unavailable right now — please try again.',
      debug)
  } finally { clearTimeout(timer) }
}

/**
 * Streaming completion. Calls onChunk(textDelta) as tokens arrive.
 * Falls back to a single onChunk() with the whole answer if no provider can stream.
 * Returns the full text.
 */
export async function stream(o: AiOptions, onChunk: (t: string) => void): Promise<AiResult> {
  const key = cacheKey(o)
  const hit = cacheGet(key)
  if (hit) { onChunk(hit.text); return { text: hit.text, model: hit.model, cached: true } }

  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? 25_000)
  const notes: string[] = []
  // Once any delta has reached the client we can never restart on another model —
  // the reader would see the answer twice.
  let emitted = false
  try {
    if (process.env.GROQ_API_KEY && !o.geminiOnly && !o.useSearch) {
      for (const model of GROQ_MODELS) {
        try {
          const r = await groqFetch(model, o, true, ctl.signal)
          if (!r.ok || !r.body) { notes.push(`${model}:${r.status}`); continue }
          let full = ''
          const reader = (r.body as any).getReader()
          const dec = new TextDecoder()
          let buf = ''
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            buf += dec.decode(value, { stream: true })
            const lines = buf.split('\n')
            buf = lines.pop() ?? ''
            for (const line of lines) {
              const s = line.trim()
              if (!s.startsWith('data:')) continue
              const payload = s.slice(5).trim()
              if (payload === '[DONE]') continue
              try {
                const d = JSON.parse(payload)
                const delta = d?.choices?.[0]?.delta?.content
                if (delta) { full += delta; emitted = true; onChunk(delta) }
              } catch { /* partial frame */ }
            }
          }
          if (full) { cacheSet(key, full, model); return { text: full, model, cached: false } }
          notes.push(`${model}:empty-stream`)
        } catch (e) { notes.push(`${model}:${(e as Error).name}`) }
        if (emitted) break
      }
    }
  } finally { clearTimeout(timer) }

  if (emitted) throw new AiError(502, 'The answer was cut off — please try again.', notes.join(' | '))

  // No stream available — fall back to a normal completion and emit it in one go.
  const res = await complete(o)
  onChunk(res.text)
  return { ...res, debug: notes.join(' | ') }
}

/** Shared per-IP guard so a free-tier key cannot be drained by one visitor. */
const rl = new Map<string, { n: number; reset: number }>()
export function rateLimit(ip: string, perMinute = 20): boolean {
  const now = Date.now()
  const e = rl.get(ip)
  if (!e || now > e.reset) { rl.set(ip, { n: 1, reset: now + 60_000 }); return true }
  if (e.n >= perMinute) return false
  e.n++
  return true
}

export function clientIp(headers: Record<string, unknown>): string {
  const f = headers['x-forwarded-for']
  return (typeof f === 'string' ? f.split(',')[0]?.trim() : '') || 'unknown'
}

/** Best-effort JSON extraction from a model reply (handles ```json fences and prose). */
export function parseJson<T = unknown>(text: string): T | null {
  if (!text) return null
  const cleaned = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim()
  try { return JSON.parse(cleaned) as T } catch { /* keep digging */ }
  const start = cleaned.search(/[[{]/)
  if (start === -1) return null
  const open = cleaned[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (esc) { esc = false; continue }
    if (ch === '\\') { esc = true; continue }
    if (ch === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (ch === open) depth++
    else if (ch === close) { depth--; if (depth === 0) { try { return JSON.parse(cleaned.slice(start, i + 1)) as T } catch { return null } } }
  }
  return null
}
