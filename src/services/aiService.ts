import type { MatchingInput, MatchResponse, Job } from '../types';
import { SYSTEM_INSTRUCTION } from '../constants';

interface CallOpts {
  systemInstruction?: string;
  temperature?: number;
  json?: boolean;
  maxTokens?: number;
}

async function callAI(
  messages: Array<{ role: string; text: string }>,
  { systemInstruction, temperature = 0.7, json = false, maxTokens = 8192 }: CallOpts = {}
): Promise<string> {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, systemInstruction, temperature, maxTokens, json })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  const data = await res.json();
  return data.text || '';
}

/** Streaming variant — calls onDelta as the answer is written. */
async function streamAI(
  messages: Array<{ role: string; text: string }>,
  onDelta: (chunk: string) => void,
  { systemInstruction, temperature = 0.7, maxTokens = 2048 }: CallOpts = {}
): Promise<string> {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, systemInstruction, temperature, maxTokens, stream: true })
  });
  if (!res.ok || !res.body) throw new Error('The AI service is unavailable right now — please try again.');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) { full += chunk; onDelta(chunk); }
  }
  return full;
}

/**
 * Models sometimes wrap JSON in prose or a code fence. Pull the first balanced
 * object out rather than trusting a naive greedy regex.
 */
function extractJson<T>(text: string, what: string): T {
  const cleaned = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(cleaned) as T; } catch { /* keep digging */ }

  const start = cleaned.indexOf('{');
  if (start === -1) throw new Error(`Could not read ${what} from the AI response`);
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(cleaned.slice(start, i + 1)) as T; }
        catch { throw new Error(`The AI returned malformed JSON for ${what}`); }
      }
    }
  }
  throw new Error(`The AI returned malformed JSON for ${what}`);
}

const MATCH_SCHEMA = `{
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

/** One round trip can only hold so many roles — beyond this we fan out and merge. */
const JOBS_PER_BATCH = 4;

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

    const text = await callAI([{ role: 'user', text: prompt }], { temperature: 0.2, json: true, maxTokens: 1500 });
    return extractJson<Partial<Job>>(text, 'the job description');
  }

  private async runMatchBatch(data: MatchingInput, jobs: MatchingInput['jobs']): Promise<MatchResponse> {
    const systemInst = `${SYSTEM_INSTRUCTION}\n\nReturn ONLY valid JSON matching this exact schema:\n${MATCH_SCHEMA}`;

    const prompt = `Run silver-medalist matching on this data. Match threshold: ${data.config.match_threshold}. Today: ${data.config.today}. Org size: ${data.config.org_size}.

JOBS:
${JSON.stringify(jobs, null, 2)}

CANDIDATES:
${JSON.stringify(data.candidates, null, 2)}

Active Bridge: ${data.activeBridge}

Return ONLY valid JSON. No markdown, no explanation.`;

    const text = await callAI([{ role: 'user', text: prompt }], {
      systemInstruction: systemInst, temperature: 0.4, json: true, maxTokens: 8192,
    });
    return extractJson<MatchResponse>(text, 'the match results');
  }

  async runMatch(data: MatchingInput): Promise<MatchResponse> {
    const jobs = data.jobs ?? [];
    if (jobs.length <= JOBS_PER_BATCH) return this.runMatchBatch(data, jobs);

    // Fan out over job batches in parallel, then merge — one giant prompt for a
    // large vault truncates and times out.
    const batches: MatchingInput['jobs'][] = [];
    for (let i = 0; i < jobs.length; i += JOBS_PER_BATCH) batches.push(jobs.slice(i, i + JOBS_PER_BATCH));
    const results = await Promise.all(batches.map(b => this.runMatchBatch(data, b).catch(() => null)));
    const ok = results.filter(Boolean) as MatchResponse[];
    if (!ok.length) throw new Error('The AI returned no match results — please try again.');

    const merged: MatchResponse = {
      summary: {
        matches_above_threshold: 0,
        medalist_redeployment_count: 0,
        security_audit_id: ok[0].summary.security_audit_id,
        estimated_savings_usd: 0,
      },
      matches: [],
      broadcast: { hot_jobs: [], hot_candidates: [] },
    };
    for (const r of ok) {
      merged.matches.push(...(r.matches ?? []));
      merged.summary.medalist_redeployment_count += r.summary?.medalist_redeployment_count ?? 0;
      merged.summary.estimated_savings_usd += r.summary?.estimated_savings_usd ?? 0;
      merged.broadcast.hot_jobs.push(...(r.broadcast?.hot_jobs ?? []));
      merged.broadcast.hot_candidates.push(...(r.broadcast?.hot_candidates ?? []));
    }
    merged.summary.matches_above_threshold = merged.matches.length;
    // A candidate can surface in several batches — keep the strongest mention only.
    const seen = new Set<string>();
    merged.broadcast.hot_candidates = merged.broadcast.hot_candidates.filter(c => !seen.has(c.id) && seen.add(c.id));
    return merged;
  }

  async draftOutreachEmail(
    candidateName: string,
    jobTitle: string,
    strategy: string,
    onDelta?: (chunk: string) => void
  ): Promise<string> {
    const prompt = `Draft a concise, professional outreach email to ${candidateName} about a ${jobTitle} opportunity.
Context: ${strategy}

Write a warm, personalized email (3-4 short paragraphs). Start with "Subject:" line, then the email body.
Tone: professional but human. Acknowledge they are a valued candidate. Don't be pushy.`;

    const messages = [{ role: 'user', text: prompt }];
    if (onDelta) return streamAI(messages, onDelta, { temperature: 0.8, maxTokens: 900 });
    return callAI(messages, { temperature: 0.8, maxTokens: 900 });
  }
}
