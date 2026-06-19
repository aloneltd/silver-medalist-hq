import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization' });
  }
  const token = authHeader.slice(7);

  try {
    const tokenInfo = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${token}`);
    const info = await tokenInfo.json();
    if (info.email !== 'm@alone.ltd') {
      return res.status(403).json({ error: 'Access denied' });
    }
  } catch {
    return res.status(401).json({ error: 'Token verification failed' });
  }

  const { base64, mimeType = 'application/pdf', filename = 'resume' } = req.body || {};
  if (!base64) return res.status(400).json({ error: 'base64 content required' });

  const prompt = `You are an expert recruiter. Extract a structured candidate profile from this resume.

Return ONLY valid JSON with this exact structure (no markdown, no code fences):
{
  "name": "Full Name from resume",
  "current_stage": "Available",
  "availability": { "start_date": "Immediate", "status": "active" },
  "locations": ["City, Country"],
  "remote_preference": "flexible",
  "comp_expectation": { "min": 0, "max": 0, "currency": "USD" },
  "skills": ["skill1", "skill2", "skill3"],
  "silver_medalist": {
    "is_true": false,
    "previous_role_id": "",
    "why_not_selected": [],
    "strengths": [],
    "endorsements": []
  },
  "dealbreakers": [],
  "recruiter_owner": { "name": "Resume Parser", "team": "Ingest System" }
}

Rules:
- Extract ALL technical skills, tools, frameworks, languages
- If salary/comp mentioned: fill min/max (annual USD equivalent)
- Location: city from address or where they've worked
- remote_preference: "remote" | "hybrid" | "onsite" | "flexible" based on resume keywords
- Keep strengths as 3-5 bullet points about the candidate's standout qualities
- current_stage: use "Active" if no indication of passive search`;

  try {
    const payload = {
      contents: [{
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: prompt }
        ]
      }],
      generationConfig: { temperature: 0.15, maxOutputTokens: 4096 }
    };

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );

    if (!r.ok) {
      const errText = await r.text();
      return res.status(r.status).json({ error: `Gemini error: ${errText}` });
    }

    const data = await r.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'Could not extract JSON from Gemini response' });

    const candidate = JSON.parse(jsonMatch[0]);
    candidate.candidate_id = `TALENT-${Math.floor(Math.random() * 90000) + 10000}`;
    candidate.resume_filename = filename;

    return res.status(200).json({ candidate });
  } catch (err: any) {
    console.error('[parse-resume]', err);
    return res.status(500).json({ error: err.message || 'Resume parsing failed' });
  }
}
