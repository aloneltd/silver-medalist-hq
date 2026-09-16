/**
 * The engine's only network calls. Every one of them is optional: if the AI is down, slow or
 * simply not configured, the import still completes with deterministic rules. Nothing in here
 * is ever allowed to throw out of an import.
 */
import type { ImportFieldKey, ParseResumeResponseBody } from '../../types';
import { contentHash } from '../../lib/hash';
import { isImportField } from './headers';

const TIMEOUT_MS = 20_000;

async function postJson<T>(url: string, body: unknown, timeoutMs = TIMEOUT_MS): Promise<T | null> {
  if (typeof fetch !== 'function') return null;
  const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller?.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// ------------------------------------------------------------------ column mapping

export interface AiColumnGuess { column: string; field: ImportFieldKey }

/**
 * ONE call for every unknown header in the file. Anything the model returns that is not a real
 * field name is dropped rather than trusted.
 */
export async function askColumnMapping(
  headers: string[],
  samples: Record<string, string[]>,
): Promise<AiColumnGuess[] | null> {
  if (!headers.length) return [];
  const data = await postJson<{ mapping?: unknown }>('/api/map-columns', {
    mode: 'columns',
    headers: headers.slice(0, 80),
    samples,
  });
  if (!data || !Array.isArray(data.mapping)) return null;

  const known = new Set(headers);
  const out: AiColumnGuess[] = [];
  for (const row of data.mapping as unknown[]) {
    if (!row || typeof row !== 'object') continue;
    const { column, field } = row as { column?: unknown; field?: unknown };
    if (typeof column !== 'string' || !known.has(column)) continue;
    if (!isImportField(field)) continue;
    out.push({ column, field });
  }
  return out;
}

// -------------------------------------------------------------------------- résumés

export type ResumeFields = ParseResumeResponseBody;

const resumeCache = new Map<string, ResumeFields | null>();

/** Structures one résumé's extracted text. Cached by content, so a re-drop costs nothing. */
export async function askResumeFromText(text: string, filename?: string): Promise<ResumeFields | null> {
  const key = contentHash(text);
  if (resumeCache.has(key)) return resumeCache.get(key) ?? null;
  const data = await postJson<Record<string, unknown>>('/api/map-columns', {
    mode: 'resume',
    text: text.slice(0, 16_000),
    filename,
  });
  const parsed = data && typeof data.name === 'string' && data.name.trim() ? (data as ResumeFields) : null;
  resumeCache.set(key, parsed);
  return parsed;
}

/** The vision path, for a PDF that has no text layer at all (a scan or an image export). */
export async function askResumeFromImage(base64: string, mimeType: string, filename?: string): Promise<ResumeFields | null> {
  const key = contentHash(`vision:${base64.slice(0, 4000)}:${base64.length}`);
  if (resumeCache.has(key)) return resumeCache.get(key) ?? null;
  const data = await postJson<Record<string, unknown>>('/api/parse-resume', { base64, mimeType, filename }, 30_000);
  const parsed = data && typeof data.name === 'string' && data.name.trim() ? (data as ResumeFields) : null;
  resumeCache.set(key, parsed);
  return parsed;
}

// -------------------------------------------------------------------------- capture

export interface CaptureFields {
  name?: string;
  currentTitle?: string;
  currentEmployer?: string;
  location?: string;
  skills?: string[];
  seniority?: string;
  summary?: string;
}

/** Structures the visible text of a captured page. A failure here is never fatal. */
export async function askCaptureStructure(payload: {
  name?: string; headline?: string; location?: string; url?: string; text?: string; site?: string;
}): Promise<CaptureFields | null> {
  const data = await postJson<Record<string, unknown>>('/api/capture-structure', {
    ...payload,
    text: (payload.text ?? '').slice(0, 12_000),
  });
  if (!data) return null;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  return {
    name: str(data.name),
    currentTitle: str(data.currentTitle),
    currentEmployer: str(data.currentEmployer),
    location: str(data.location),
    seniority: str(data.seniority),
    summary: str(data.summary),
    skills: Array.isArray(data.skills) ? data.skills.filter((s): s is string => typeof s === 'string').slice(0, 40) : undefined,
  };
}

// ------------------------------------------------------------------------ batching

/**
 * Runs `worker` over `items` at most `limit` at a time. Twelve dropped CVs must not become
 * twelve simultaneous model calls — that is how a free tier turns into a wall of 429s.
 */
export async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

/** Test seam — clears the résumé memo between cases. */
export function clearAiCache(): void {
  resumeCache.clear();
}
