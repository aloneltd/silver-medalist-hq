import type { VercelRequest, VercelResponse } from '@vercel/node'
import { complete, stream, rateLimit, clientIp, AiError, type Msg } from './_lib/fastai.js'

const MAX_TOKENS = 8192

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!rateLimit(clientIp(req.headers as Record<string, unknown>), 20)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' })
  }

  const {
    messages, systemInstruction, temperature = 0.7, maxTokens = 2048,
    json = false, stream: wantStream = false,
  } = req.body ?? {}

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' })
  }

  const opts = {
    messages: (messages as Msg[]).slice(-10),
    system: systemInstruction || undefined,
    temperature,
    maxTokens: Math.min(Number(maxTokens) || 2048, MAX_TOKENS),
    json: !!json,
    timeoutMs: 25_000,
  }

  // Streaming path — used for the outreach email so words appear as they are written.
  if (wantStream) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Accel-Buffering', 'no')
    try {
      await stream(opts, delta => { res.write(delta) })
      return res.end()
    } catch (err) {
      if (!res.writableEnded) res.write(`\n\n${err instanceof AiError ? err.message : 'The AI service is unavailable right now.'}`)
      return res.end()
    }
  }

  try {
    const result = await complete(opts)
    return res.status(200).json({ text: result.text, model: result.model, cached: result.cached })
  } catch (err) {
    const debug = err instanceof AiError ? err.debug : String(err)
    console.error('[api/ai]', debug)
    return res.status(err instanceof AiError && err.status === 429 ? 429 : 502).json({
      error: err instanceof AiError ? err.message : 'The AI service had a hiccup — please try again.',
      // Opt-in, non-secret upstream detail so a broken provider is diagnosable from the browser.
      ...(req.query?.debug === '1' ? { debug } : {}),
    })
  }
}
