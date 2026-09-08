import { describe, it, expect, afterEach, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Force fastai.ts's complete() down the Groq path so the fake fetch below is actually hit.
process.env.GROQ_API_KEY = 'test-key';
delete process.env.GEMINI_API_KEY;

const handler = (await import('./score')).default;

interface FakeRes {
  req: VercelRequest;
  res: VercelResponse;
  status: () => number;
  json: () => any;
}

function fakeReqRes(body: unknown, ip: string): FakeRes {
  const req = { method: 'POST', body, headers: { 'x-forwarded-for': ip } } as unknown as VercelRequest;
  let statusCode = 200;
  let jsonBody: unknown = null;
  const res = {
    status(code: number) { statusCode = code; return res; },
    json(payload: unknown) { jsonBody = payload; return res; },
  } as unknown as VercelResponse;
  return { req, res, status: () => statusCode, json: () => jsonBody };
}

const ROLE = {
  id: 'role_1', title: 'Senior Engineer', level: 'Senior', location: 'Remote',
  compBand: { min: 100000, max: 150000, currency: 'USD' },
  mustHaves: ['TypeScript'], niceToHaves: [], dealbreakers: [],
};

function candidate(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, name: `Cand ${id}`, skills: ['TypeScript'], seniority: 'senior',
    currentTitle: 'Engineer', currentEmployer: 'Acme', tenureStart: new Date().toISOString(),
    location: 'Remote', status: 'active', warmthAt: new Date().toISOString(),
    ...overrides,
  };
}

function groqResponse(scored: unknown[]): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ scored }) } }],
  }), { status: 200 });
}

describe('/api/score contract', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('drops malformed rows and backfills them from the deterministic fallback', async () => {
    global.fetch = vi.fn(async () => groqResponse([
      { candidateId: 'c1', score: 80, sub: { skills: 80, seniority: 80, comp: 80, timing: 80 }, why: 'Good fit', flags: [] },
      { candidateId: 'c2', score: 'not-a-number', sub: {}, why: '' }, // malformed — must be dropped
    ])) as unknown as typeof fetch;

    const { req, res, json } = fakeReqRes({ role: ROLE, candidates: [candidate('c1'), candidate('c2')] }, '1.1.1.1');
    await handler(req, res);
    const body = json();

    expect(body.scored).toHaveLength(2);
    const c1 = body.scored.find((r: any) => r.candidateId === 'c1');
    const c2 = body.scored.find((r: any) => r.candidateId === 'c2');
    expect(c1.fallback).toBeFalsy();
    expect(c1.score).toBe(80);
    expect(c2.fallback).toBe(true); // filled in by the deterministic scorer
    expect(body.fallback).toBe(false); // not *every* row was a fallback
  });

  it('engages the deterministic fallback for every row when every provider fails', async () => {
    global.fetch = vi.fn(async () => new Response('server error', { status: 500 })) as unknown as typeof fetch;

    const { req, res, json } = fakeReqRes({ role: ROLE, candidates: [candidate('c3')] }, '2.2.2.2');
    await handler(req, res);
    const body = json();

    expect(body.fallback).toBe(true);
    expect(body.scored).toHaveLength(1);
    expect(body.scored[0].fallback).toBe(true);
  });

  it('never scores an empty board: zero candidates still returns 200 with an empty list', async () => {
    global.fetch = vi.fn() as unknown as typeof fetch;
    const { req, res, json } = fakeReqRes({ role: ROLE, candidates: [] }, '4.4.4.4');
    await handler(req, res);
    expect(json().scored).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('a cache hit on identical input makes zero additional network calls', async () => {
    let calls = 0;
    global.fetch = vi.fn(async () => {
      calls++;
      return groqResponse([
        { candidateId: 'c4', score: 70, sub: { skills: 70, seniority: 70, comp: 70, timing: 70 }, why: 'ok', flags: [] },
      ]);
    }) as unknown as typeof fetch;

    const candidates = [candidate('c4')];
    const first = fakeReqRes({ role: ROLE, candidates }, '3.3.3.3');
    await handler(first.req, first.res);
    expect(calls).toBe(1);
    expect(first.json().scored[0].score).toBe(70);

    const second = fakeReqRes({ role: ROLE, candidates }, '3.3.3.3');
    await handler(second.req, second.res);
    expect(calls).toBe(1); // same prompt -> served from fastai's LRU, no new fetch
    expect(second.json().scored[0].score).toBe(70);
  });

  it('rejects a chunk over the per-call candidate cap', async () => {
    const tooMany = Array.from({ length: 61 }, (_, i) => candidate(`c${i}`));
    const { req, res, status } = fakeReqRes({ role: ROLE, candidates: tooMany }, '5.5.5.5');
    await handler(req, res);
    expect(status()).toBe(400);
  });

  it('drops non-active candidates server-side even if the caller forgot to filter', async () => {
    global.fetch = vi.fn(async () => groqResponse([
      { candidateId: 'c6', score: 60, sub: { skills: 60, seniority: 60, comp: 60, timing: 60 }, why: 'ok', flags: [] },
    ])) as unknown as typeof fetch;

    const { req, res, json } = fakeReqRes({
      role: ROLE,
      candidates: [candidate('c6', { status: 'active' }), candidate('c7', { status: 'silent' })],
    }, '6.6.6.6');
    await handler(req, res);
    const body = json();
    expect(body.scored.map((r: any) => r.candidateId)).toEqual(['c6']);
  });
});
