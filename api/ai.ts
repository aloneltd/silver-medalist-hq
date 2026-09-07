import type { VercelRequest, VercelResponse } from '@vercel/node'

const MAX_TOKENS = 4096

const responseCache = new Map<string, { text: string; expiresAt: number }>()
const CACHE_TTL = 300_000

// Free-tier guard: 10 req/min per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 })
    return true
  }
  if (entry.count >= 10) return false
  entry.count++
  return true
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured on the server' })

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 'unknown'
  if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Too many requests. Please wait a moment.' })

  const { messages, systemInstruction, temperature = 0.7, maxTokens = 2048 } = req.body

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' })
  }

  const payload: any = {
    contents: messages.slice(-10).map((m: any) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text || '' }]
    })),
    generationConfig: {
      temperature,
      maxOutputTokens: Math.min(Number(maxTokens) || 2048, MAX_TOKENS)
    }
  }

  if (systemInstruction) {
    payload.systemInstruction = { parts: [{ text: systemInstruction }] }
  }

  const lastMsg = (messages as { role: string; text: string }[]).filter((m) => m.role === 'user').at(-1)?.text ?? ''
  const cacheKey = `gemini-2.5-flash::${systemInstruction ?? ''}::${lastMsg}`
  const now = Date.now()
  const cached = responseCache.get(cacheKey)
  if (cached && now < cached.expiresAt) return res.status(200).json({ text: cached.text })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)

  try {
    const call = (model: string) =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

    // Flash first; on quota/transient upstream errors fall back once to Flash-Lite
    let r = await call('gemini-2.5-flash')
    if (!r.ok && (r.status === 429 || r.status >= 500)) {
      console.warn('Gemini flash returned', r.status, '— retrying with flash-lite')
      r = await call('gemini-2.5-flash-lite')
    }

    if (!r.ok) {
      const errBody = await r.text()
      console.error('Gemini API error:', r.status, errBody.slice(0, 300))
      const friendly = r.status === 429
        ? 'The AI is rate-limited right now — wait a minute and try again.'
        : 'The AI service had a hiccup — please try again.'
      return res.status(r.status >= 500 ? 502 : r.status).json({ error: friendly })
    }

    const data = await r.json()
    const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || ''
    if (text) responseCache.set(cacheKey, { text, expiresAt: now + CACHE_TTL })
    return res.status(200).json({ text })
  } catch (err: any) {
    console.error('AI proxy error:', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  } finally {
    clearTimeout(timeout)
  }
}
