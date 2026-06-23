import type { VercelRequest, VercelResponse } from '@vercel/node'

const MAX_TOKENS = 4096

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

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }
    )

    if (!r.ok) {
      const errBody = await r.text()
      console.error('Gemini API error:', r.status, errBody)
      return res.status(r.status).json({ error: `Gemini API error: ${r.status}` })
    }

    const data = await r.json()
    const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || ''
    return res.status(200).json({ text })
  } catch (err: any) {
    console.error('AI proxy error:', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  } finally {
    clearTimeout(timeout)
  }
}
