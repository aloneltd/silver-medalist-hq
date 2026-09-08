import type {
  ScoreCandidateInput, ScoreRoleInput, ScoredRow, OutreachRequestBody,
  IngestJdResponseBody, ParseResumeResponseBody,
} from '../types';

/**
 * The only place src/features/** talks to the network. Every call is grounded in
 * BLUEPRINT-v2.md's four endpoints — /api/score, /api/outreach, /api/ingest-jd,
 * /api/parse-resume. Score/comp/warmth *data* decisions live in dataService; this file
 * only shapes requests and parses responses.
 */

const NETWORK_ERROR_MESSAGE = "Can't reach the AI service right now — check your connection and try again.";
const SCORE_CHUNK_SIZE = 60;

interface ScoreApiResponse {
  roleId: string;
  scored: ScoredRow[];
  fallback: boolean;
  hash: string;
}

async function postJSON<TRes>(url: string, body: unknown): Promise<TRes> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Error(NETWORK_ERROR_MESSAGE);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `API error ${res.status}` }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json() as Promise<TRes>;
}

export const aiService = {
  /**
   * One call per role, chunked to ≤60 candidates per request (server rejects more).
   * `fallback` is true only if every chunk fell back to the deterministic keyword-fit scorer.
   */
  async scoreRole(role: ScoreRoleInput, candidates: ScoreCandidateInput[]): Promise<{ scored: ScoredRow[]; fallback: boolean }> {
    if (candidates.length === 0) return { scored: [], fallback: false };

    const chunks: ScoreCandidateInput[][] = [];
    for (let i = 0; i < candidates.length; i += SCORE_CHUNK_SIZE) chunks.push(candidates.slice(i, i + SCORE_CHUNK_SIZE));

    const results = await Promise.all(
      chunks.map(chunk => postJSON<ScoreApiResponse>('/api/score', { role, candidates: chunk })),
    );

    return {
      scored: results.flatMap(r => r.scored),
      fallback: results.every(r => r.fallback),
    };
  },

  /** Streams the outreach draft. Calls onDelta as tokens arrive; always returns the full text. */
  async draftOutreach(body: OutreachRequestBody, onDelta?: (chunk: string) => void): Promise<string> {
    let res: Response;
    try {
      res = await fetch('/api/outreach', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    } catch {
      throw new Error(NETWORK_ERROR_MESSAGE);
    }
    if (!res.ok || !res.body) throw new Error('The AI service is unavailable right now — please try again.');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) { full += chunk; onDelta?.(chunk); }
      }
    } catch {
      if (!full) throw new Error(NETWORK_ERROR_MESSAGE);
      // Partial draft already streamed to the caller — let them keep what arrived.
    }
    return full;
  },

  async ingestJobDescription(text: string): Promise<IngestJdResponseBody> {
    return postJSON('/api/ingest-jd', { text });
  },

  async parseResume(base64: string, mimeType = 'application/pdf', filename = 'resume'): Promise<ParseResumeResponseBody> {
    return postJSON('/api/parse-resume', { base64, mimeType, filename });
  },
};
