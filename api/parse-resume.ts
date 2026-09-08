import type { VercelRequest, VercelResponse } from '@vercel/node';
import { rateLimit, clientIp, parseJson } from './_lib/fastai.js';
import type { ParseResumeRequestBody, ParseResumeResponseBody } from '../src/types/index.js';

// Resume parsing needs vision, which fastai.ts's Groq/Gemini text path doesn't cover, so this
// stays a direct Gemini call — but never on a single model, per BLUEPRINT-v2.md's
// "Gemini 2.5 Flash vision → 3.5-flash-lite fallback".
const VISION_MODELS = ['gemini-2.5-flash', 'gemini-3.5-flash-lite'];

const SCHEMA = `{
  "name": "Full name from the resume",
  "currentEmployer": "string",
  "currentTitle": "string",
  "location": "City, Country",
  "skills": ["skill1", "skill2"],
  "seniority": "junior" | "mid" | "senior" | "staff" | "principal" | "exec",
  "compExpectation": { "amount": number, "currency": "USD" } ,
  "tags": []
}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate-limited like every other AI endpoint (this app has a local-only mode with no auth
  // token to gate on) rather than hard-gated to one Google account.
  if (!rateLimit(clientIp(req.headers as Record<string, unknown>), 20)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const { base64, mimeType = 'application/pdf' } = (req.body ?? {}) as ParseResumeRequestBody;
  if (!base64) return res.status(400).json({ error: 'base64 content required' });

  const prompt = `You are an expert recruiter. Extract a structured candidate profile from this resume.
Return ONLY valid JSON with this exact structure (no markdown, no code fences):
${SCHEMA}

Rules:
- Extract ALL technical skills, tools, frameworks, languages mentioned.
- seniority: infer from years of experience and title (junior <2y, mid 2-5y, senior 5-8y, staff/principal 8y+, exec = VP/C-level).
- location: city from the header/address, or the city of their most recent employer.
- compExpectation: only include if a number is actually stated in the resume — never guess one.
- If a field truly cannot be determined, omit it rather than inventing a value.`;

  try {
    const payload = {
      contents: [{ parts: [{ inlineData: { mimeType, data: base64 } }, { text: prompt }] }],
      generationConfig: {
        temperature: 0.15,
        maxOutputTokens: 2048,
        // 2.5 Flash is a thinking model: without this its reasoning eats the output budget
        // and the JSON comes back truncated.
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
      },
    };

    const call = (model: string) => fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(25000) },
    );

    let r = await call(VISION_MODELS[0]);
    if (!r.ok && r.status !== 401 && r.status !== 403) r = await call(VISION_MODELS[1]);

    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      console.error('[parse-resume] gemini', r.status, errText.slice(0, 300));
      return res.status(502).json({ error: 'Could not read that resume right now — please try again in a moment.' });
    }

    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') || '';
    const parsed = parseJson<Record<string, unknown>>(text);
    if (!parsed || typeof parsed.name !== 'string' || !parsed.name.trim()) {
      return res.status(502).json({ error: 'Could not extract a candidate from that resume.' });
    }

    const validSeniority = new Set(['junior', 'mid', 'senior', 'staff', 'principal', 'exec']);
    const compExpectation = parsed.compExpectation as Record<string, unknown> | undefined;

    const candidate: ParseResumeResponseBody = {
      name: parsed.name.trim(),
      currentEmployer: typeof parsed.currentEmployer === 'string' ? parsed.currentEmployer : 'Unknown',
      currentTitle: typeof parsed.currentTitle === 'string' ? parsed.currentTitle : 'Unknown',
      location: typeof parsed.location === 'string' ? parsed.location : 'unspecified',
      skills: Array.isArray(parsed.skills) ? parsed.skills.filter((s): s is string => typeof s === 'string') : [],
      seniority: typeof parsed.seniority === 'string' && validSeniority.has(parsed.seniority)
        ? (parsed.seniority as ParseResumeResponseBody['seniority']) : 'mid',
      compExpectation: compExpectation && typeof compExpectation.amount === 'number'
        ? { amount: compExpectation.amount, currency: typeof compExpectation.currency === 'string' ? compExpectation.currency : 'USD', date: new Date().toISOString() }
        : undefined,
      tags: ['resume-parsed'],
      status: 'active',
    };

    return res.status(200).json(candidate);
  } catch (err) {
    console.error('[parse-resume]', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Resume parsing failed' });
  }
}
