import type {
  ScoreCandidateInput, ScoreRoleInput, ScoredRow, OutreachRequestBody,
  IngestJdResponseBody, ParseResumeResponseBody,
} from '../types';
import { scoreFingerprint } from '../lib/scoreFingerprint';

/**
 * The only place src/features/** talks to the network. Every call is grounded in
 * BLUEPRINT-v2.md's four endpoints — /api/score, /api/outreach, /api/ingest-jd,
 * /api/parse-resume. Score/comp/warmth *data* decisions live in dataService; this file
 * only shapes requests and parses responses.
 */

const NETWORK_ERROR_MESSAGE = "Can't reach the AI service right now — check your connection and try again.";

/**
 * ---------------------------------------------------------------------------------------
 * Wave scoring (2026-09-08 polish pass)
 * ---------------------------------------------------------------------------------------
 * The old code sent the whole bench in one 40-60 candidate request. On Mark's real Groq tier
 * (8,000 tokens/minute on gpt-oss-120b/20b) that call needed ~8,800 tokens, so it was
 * *structurally* guaranteed to 429 — meaning a "full bench sync" always ended on the
 * deterministic keyword-fit fallback and the AI never actually ran for a real bench.
 *
 * Now: waves of 12, one at a time, with a ~1.2s minimum spacing between wave starts.
 *   • ~1.2k tokens per wave × 5 waves = ~6k tokens, comfortably inside one minute's budget.
 *   • Results are handed back per wave, so rows light up as each wave lands — that
 *     progressive fill *is* the sync animation, instead of one global spinner.
 *   • Each wave retries once on its own; only a wave that fails twice falls back to the
 *     labelled keyword fit, so one bad wave never downgrades the other four.
 *   • Waves are cached by content hash, so re-syncing an unchanged slice costs zero network.
 */
const WAVE_SIZE = 12;
/**
 * Minimum gap between wave *starts*. Nothing bursts: at most one request leaves every 1.2s.
 */
const WAVE_SPACING_MS = 1200;
/**
 * How many waves may be in flight at once. Measured on the real Groq tier, one 12-row wave
 * answers in ~3.0s, so five strictly-sequential waves could never finish a 60-row bench
 * inside the 12s budget. Two in flight, still staggered 1.2s apart, lands the whole bench in
 * ~9s. The token budget is unaffected — a full sync is ~6.5k tokens against an 8,000/min cap,
 * and that total does not change with how the waves are spaced.
 */
const WAVE_CONCURRENCY = 2;
/** A wave is small; if it hasn't answered in 10s the provider is not going to. */
const WAVE_TIMEOUT_MS = 10_000;

interface ScoreApiResponse {
  roleId: string;
  scored: ScoredRow[];
  fallback: boolean;
  hash: string;
}

export interface WaveProgress {
  /** 1-based wave that just landed. */
  wave: number;
  totalWaves: number;
  /** Rows from this wave only — the caller merges them so the bench fills in place. */
  rows: ScoredRow[];
  /** True when this wave could not be AI-scored and came back as labelled keyword fit. */
  fallback: boolean;
  /** Cumulative counts across the whole sync so far. */
  scoredSoFar: number;
  fallbackSoFar: number;
}

export interface ScoreRoleResult {
  scored: ScoredRow[];
  /** True only when *every* wave fell back. */
  fallback: boolean;
  /** How many rows carry the deterministic keyword-fit label. */
  fallbackCount: number;
  totalWaves: number;
}

/**
 * Client-side wave cache: hash(role + that wave's candidates) → the rows it produced.
 * Identical input ⇒ zero network, which makes a re-sync after an unrelated edit instant.
 * Bounded so a long session can't grow it without limit.
 */
const WAVE_CACHE_MAX = 60;
const waveCache = new Map<string, ScoredRow[]>();

function waveCacheGet(key: string): ScoredRow[] | undefined {
  const hit = waveCache.get(key);
  if (!hit) return undefined;
  waveCache.delete(key);
  waveCache.set(key, hit); // refresh LRU recency
  return hit;
}

function waveCacheSet(key: string, rows: ScoredRow[]): void {
  waveCache.set(key, rows);
  while (waveCache.size > WAVE_CACHE_MAX) {
    waveCache.delete(waveCache.keys().next().value as string);
  }
}

/** Test/QA hook — a wipe should not leave a previous bench's scores in memory. */
export function clearWaveCache(): void {
  waveCache.clear();
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function postJSON<TRes>(url: string, body: unknown, timeoutMs?: number): Promise<TRes> {
  // A server-side timeout cannot rescue a request that never arrives; every call gets its
  // own AbortController so a stalled fetch can never spin forever.
  const ctl = new AbortController();
  const timer = timeoutMs ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
  } catch {
    throw new Error(NETWORK_ERROR_MESSAGE);
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `API error ${res.status}` }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json() as Promise<TRes>;
}

/** One wave, with a single retry — a blip on one wave must not downgrade the whole sync. */
async function fetchWave(role: ScoreRoleInput, wave: ScoreCandidateInput[]): Promise<ScoreApiResponse | null> {
  try {
    return await postJSON<ScoreApiResponse>('/api/score', { role, candidates: wave }, WAVE_TIMEOUT_MS);
  } catch { /* fall through to exactly one retry */ }
  try {
    return await postJSON<ScoreApiResponse>('/api/score', { role, candidates: wave }, WAVE_TIMEOUT_MS);
  } catch {
    return null;
  }
}

/**
 * A serverless function that hasn't been called in a few minutes pays a cold start, and on a
 * wave-based sync that cold start lands entirely on wave 1 — measured at ~3s of the ~14s a
 * cold production sync took. So the moment the recruiter opens the paste dialog, we send the
 * scorer a zero-candidate request: the handler returns immediately without touching an AI
 * provider (see the `candidates.length === 0` branch in api/score.ts), but the lambda is up
 * and warm by the time they finish reading the parsed role. Fire-and-forget, never blocking,
 * never surfaced.
 */
let lastWarmAt = 0;
const WARM_TTL_MS = 3 * 60_000;

export function warmScorer(): void {
  if (Date.now() - lastWarmAt < WARM_TTL_MS) return;
  lastWarmAt = Date.now();
  void fetch('/api/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: { id: 'warm', title: '', level: '', location: '', compBand: { min: 0, max: 0, currency: 'USD' }, mustHaves: [], niceToHaves: [], dealbreakers: [] },
      candidates: [],
    }),
  }).catch(() => { /* warming is best-effort; a failure changes nothing */ });
}

export const aiService = {
  WAVE_SIZE,
  warmScorer,

  /**
   * Scores a whole bench in waves of 12, sequentially, reporting each wave as it lands.
   * Never throws for a partial failure: a wave that fails twice comes back as labelled
   * keyword fit, so the caller always gets a row for every candidate it sent.
   */
  async scoreRole(
    role: ScoreRoleInput,
    candidates: ScoreCandidateInput[],
    onWave?: (p: WaveProgress) => void,
  ): Promise<ScoreRoleResult> {
    if (candidates.length === 0) {
      return { scored: [], fallback: false, fallbackCount: 0, totalWaves: 0 };
    }

    const waves: ScoreCandidateInput[][] = [];
    for (let i = 0; i < candidates.length; i += WAVE_SIZE) {
      waves.push(candidates.slice(i, i + WAVE_SIZE));
    }

    const all: ScoredRow[] = [];
    let fallbackCount = 0;
    let fallbackWaves = 0;
    let completed = 0;

    /** One wave: cache, then network with a single retry, then an honest unscored row. */
    const runOne = async (wave: ScoreCandidateInput[]): Promise<{ rows: ScoredRow[]; fellBack: boolean }> => {
      const key = scoreFingerprint(role, wave);
      const cached = waveCacheGet(key);
      if (cached) return { rows: cached, fellBack: cached.every(r => r.fallback) };

      const res = await fetchWave(role, wave);
      if (res) {
        waveCacheSet(key, res.scored);
        return { rows: res.scored, fellBack: res.fallback };
      }
      // The endpoint itself is unreachable. Rather than dropping these people off the board,
      // mark them honestly as unscored and let the row say so.
      return {
        fellBack: true,
        rows: wave.map(c => ({
          candidateId: c.id,
          score: 0,
          sub: { skills: 0, seniority: 0, comp: 0, timing: 0 },
          why: 'Not scored — the scoring service could not be reached for this wave.',
          flags: ['not scored'],
          fallback: true,
        })),
      };
    };

    let cursor = 0;
    let nextAllowedStart = 0;

    const worker = async (): Promise<void> => {
      for (;;) {
        const index = cursor++;
        if (index >= waves.length) return;

        const wait = nextAllowedStart - Date.now();
        if (wait > 0) await sleep(wait);
        nextAllowedStart = Date.now() + WAVE_SPACING_MS;

        const { rows, fellBack } = await runOne(waves[index]);
        all.push(...rows);
        fallbackCount += rows.filter(r => r.fallback).length;
        if (fellBack) fallbackWaves++;

        // The counter reports waves *landed*, so it only ever goes up even though two are
        // in flight at a time.
        completed++;
        onWave?.({
          wave: completed,
          totalWaves: waves.length,
          rows,
          fallback: fellBack,
          scoredSoFar: all.length,
          fallbackSoFar: fallbackCount,
        });
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(WAVE_CONCURRENCY, waves.length) }, () => worker()),
    );

    return {
      scored: all,
      fallback: fallbackWaves === waves.length,
      fallbackCount,
      totalWaves: waves.length,
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
    return postJSON('/api/ingest-jd', { text }, 20_000);
  },

  async parseResume(base64: string, mimeType = 'application/pdf', filename = 'resume'): Promise<ParseResumeResponseBody> {
    return postJSON('/api/parse-resume', { base64, mimeType, filename }, 30_000);
  },
};
