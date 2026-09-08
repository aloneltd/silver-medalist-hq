import { describe, it, expect, afterEach, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

process.env.GROQ_API_KEY = 'test-key';
delete process.env.GEMINI_API_KEY;

const handler = (await import('./nl-command')).default;
const { validatePlan } = await import('./nl-command');

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

function groqResponse(planObj: unknown): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(planObj) } }],
  }), { status: 200 });
}

describe('/api/nl-command contract', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('rejects a GET request', async () => {
    const { req, res, status } = fakeReqRes(undefined, '1.1.1.1');
    (req as any).method = 'GET';
    await handler(req, res);
    expect(status()).toBe(405);
  });

  it('rejects a missing text field', async () => {
    const { req, res, status } = fakeReqRes({}, '2.2.2.2');
    await handler(req, res);
    expect(status()).toBe(400);
  });

  it('falls back to a plain-search plan when every provider fails', async () => {
    global.fetch = vi.fn(async () => new Response('down', { status: 500 })) as unknown as typeof fetch;
    const { req, res, json } = fakeReqRes({ text: 'staff engineers in Berlin' }, '3.3.3.3');
    await handler(req, res);
    const body = json();
    expect(body.plan.action).toBe('filter');
    expect(body.plan.target.text).toContain('staff engineers in Berlin');
  });

  it('returns the plan the model produced, validated', async () => {
    global.fetch = vi.fn(async () => groqResponse({
      action: 'snooze',
      target: { status: ['took_role'] },
      params: { until: 'spring' },
      explanation: 'Snooze everyone who took a role until spring',
    })) as unknown as typeof fetch;
    const { req, res, json } = fakeReqRes({ text: 'snooze everyone who took a role until spring' }, '4.4.4.4');
    await handler(req, res);
    const body = json();
    expect(body.plan.action).toBe('snooze');
    expect(body.plan.target.status).toEqual(['took_role']);
    expect(body.plan.params.until).toBe('spring');
  });
});

/** 12 example utterances → the expected plan shape, run through the pure validator directly
 *  (the same validation the live handler applies to whatever the model returns) so this suite
 *  never depends on network/model behaviour. */
describe('validatePlan — 12 example utterances', () => {
  const cases: Array<{ utterance: string; raw: unknown; expect: Partial<Record<string, unknown>> }> = [
    {
      utterance: 'snooze everyone who took a role until spring',
      raw: { action: 'snooze', target: { status: ['took_role'] }, params: { until: 'spring' }, explanation: 'Snooze took_role people until spring' },
      expect: { action: 'snooze' },
    },
    {
      utterance: 'show staff engineers in Berlin under 200k who are warm',
      raw: {
        action: 'filter',
        target: { seniority: ['staff'], location: 'Berlin', compMaxUSD: 200000, status: ['active'] },
        params: {},
        explanation: 'Staff engineers in Berlin under $200k, active',
      },
      expect: { action: 'filter' },
    },
    {
      utterance: 'draft a warm note to Kofi',
      raw: { action: 'compose', target: { names: ['Kofi'] }, params: { tone: 'warm' }, explanation: 'Draft a warm note to Kofi' },
      expect: { action: 'compose' },
    },
    {
      utterance: 'tag everyone from Acme as "acme-alum"',
      raw: { action: 'tag', target: { text: 'Acme' }, params: { tag: 'acme-alum' }, explanation: 'Tag Acme alumni' },
      expect: { action: 'tag' },
    },
    {
      utterance: 'mark silent candidates in London as do not reapproach',
      raw: { action: 'status', target: { status: ['silent'], location: 'London' }, params: { status: 'do_not_reapproach' }, explanation: 'Mark silent London candidates do-not-reapproach' },
      expect: { action: 'status' },
    },
    {
      utterance: 'move everyone who replied to interviewing',
      raw: { action: 'move_stage', target: { boardStage: 'replied' }, params: { stage: 'interviewing' }, explanation: 'Move repliers to interviewing' },
      expect: { action: 'move_stage' },
    },
    {
      utterance: 'snooze Ada for 2 weeks',
      raw: { action: 'snooze', target: { names: ['Ada'] }, params: { until: 'in 2 weeks' }, explanation: 'Snooze Ada 2 weeks' },
      expect: { action: 'snooze' },
    },
    {
      utterance: 'find senior Go engineers who know Kubernetes',
      raw: { action: 'filter', target: { seniority: ['senior'], skillsInclude: ['Go', 'Kubernetes'] }, params: {}, explanation: 'Senior Go/Kubernetes engineers' },
      expect: { action: 'filter' },
    },
    {
      utterance: 'draft a direct note to everyone tagged founding-team',
      raw: { action: 'compose', target: { tag: 'founding-team' }, params: { tone: 'direct' }, explanation: 'Direct note to founding-team tag' },
      expect: { action: 'compose' },
    },
    {
      utterance: 'reactivate everyone who took a role until next month',
      raw: { action: 'status', target: { status: ['took_role'] }, params: { status: 'active', until: 'next month' }, explanation: 'Reactivate took_role people' },
      expect: { action: 'status' },
    },
    {
      utterance: 'what would you even do with this',
      raw: { garbage: true },
      expect: { action: 'filter' }, // unrecognisable model output -> safe filter fallback
    },
    {
      utterance: 'move principal candidates to offer',
      raw: { action: 'move_stage', target: { seniority: ['principal'] }, params: { stage: 'offer' }, explanation: 'Move principal candidates to offer' },
      expect: { action: 'move_stage' },
    },
  ];

  for (const { utterance, raw, expect: exp } of cases) {
    it(`"${utterance}"`, () => {
      const plan = validatePlan(raw, utterance);
      expect(plan).not.toBeNull();
      expect(plan!.action).toBe(exp.action);
      expect(typeof plan!.explanation).toBe('string');
      expect(plan!.explanation.length).toBeGreaterThan(0);
    });
  }

  it('drops an out-of-enum status rather than passing it through', () => {
    const plan = validatePlan({
      action: 'status', target: {}, params: { status: 'made-up-status' }, explanation: 'x',
    }, 'x');
    expect(plan!.params.status).toBeUndefined();
  });

  it('never lets the model set an actual date string as-is beyond string type — until stays a raw phrase', () => {
    const plan = validatePlan({
      action: 'snooze', target: {}, params: { until: '2027-03-01' }, explanation: 'x',
    }, 'x');
    expect(plan!.params.until).toBe('2027-03-01'); // passed through verbatim; resolution happens client-side
  });
});
