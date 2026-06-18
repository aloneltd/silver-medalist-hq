import type { MatchingInput, MatchResponse, Job } from '../types';
import { SYSTEM_INSTRUCTION } from '../constants';

async function callAI(messages: Array<{ role: string; text: string }>, systemInstruction?: string, temperature = 0.7): Promise<string> {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, systemInstruction, temperature, maxTokens: 8192 })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  const data = await res.json();
  return data.text || '';
}

export class AIService {
  async parseJobDescription(input: { text?: string }): Promise<Partial<Job>> {
    const prompt = `Extract a structured job requirement from this job description text.
Focus on: title, level, location, remote_policy (remote/hybrid/onsite/unknown), comp_range (min/max/currency as numbers), must_haves (array), dealbreakers (array), urgency (score_1_to_5 and reasons array).

Return ONLY valid JSON with this exact structure:
{
  "title": "string",
  "level": "string",
  "location": "string",
  "remote_policy": "remote" | "hybrid" | "onsite" | "unknown",
  "comp_range": { "min": number, "max": number, "currency": "USD" },
  "must_haves": ["string"],
  "dealbreakers": ["string"],
  "urgency": { "score_1_to_5": number, "reasons": ["string"] }
}

Job Description:
${input.text}`;

    const text = await callAI([{ role: 'user', text: prompt }], undefined, 0.3);

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Could not extract structured job data from AI response');

    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      throw new Error('AI returned malformed JSON for job description parsing');
    }
  }

  async runMatch(data: MatchingInput): Promise<MatchResponse> {
    const systemInst = SYSTEM_INSTRUCTION + `\n\nReturn ONLY valid JSON matching this exact schema:
{
  "summary": {
    "matches_above_threshold": number,
    "medalist_redeployment_count": number,
    "security_audit_id": "string",
    "estimated_savings_usd": number
  },
  "matches": [{
    "job_id": "string",
    "candidate_id": "string",
    "match_score": number,
    "redeployment_strategy": "string",
    "next_actions": [{
      "type": "email_draft" | "slack_dm" | "ats_update",
      "label": "string",
      "context": "string",
      "ai_pitch": "string"
    }],
    "risk_heatmap": { "tech": number, "culture": number, "comp": number, "timing": number }
  }],
  "broadcast": {
    "hot_jobs": [{ "id": "string", "reason": "string" }],
    "hot_candidates": [{ "id": "string", "reason": "string" }]
  }
}`;

    const prompt = `Run silver-medalist matching on this data. Match threshold: ${data.config.match_threshold}. Today: ${data.config.today}. Org size: ${data.config.org_size}.

JOBS:
${JSON.stringify(data.jobs, null, 2)}

CANDIDATES:
${JSON.stringify(data.candidates, null, 2)}

Active Bridge: ${data.activeBridge}

Return ONLY valid JSON. No markdown, no explanation.`;

    const text = await callAI([{ role: 'user', text: prompt }], systemInst, 0.7);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Could not extract match results from AI response');

    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      throw new Error('AI returned malformed JSON for match results');
    }
  }

  async draftOutreachEmail(candidateName: string, jobTitle: string, strategy: string): Promise<string> {
    const prompt = `Draft a concise, professional outreach email to ${candidateName} about a ${jobTitle} opportunity.
Context: ${strategy}

Write a warm, personalized email (3-4 short paragraphs). Start with "Subject:" line, then the email body.
Tone: professional but human. Acknowledge they are a valued candidate. Don't be pushy.`;

    return callAI([{ role: 'user', text: prompt }], undefined, 0.8);
  }
}
