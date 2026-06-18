import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured on the server' })

  const { messages, systemInstruction, temperature = 0.7, maxTokens = 8192 } = req.body

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' })
  }

  const payload: any = {
    contents: messages.map((m: any) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text || '' }]
    })),
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens
    }
  }

  if (systemInstruction) {
    payload.systemInstruction = { parts: [{ text: systemInstruction }] }
  }

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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
  }
}
