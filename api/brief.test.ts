import { describe, it, expect, afterEach, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

process.env.GROQ_API_KEY = 'test-key';
delete process.env.GEMINI_API_KEY;

const handler = (await import('./brief')).default;

interface FakeRes {
  req: VercelRequest;
  res: VercelResponse;
  status: () => number;
  text: () => string;
  headers: Record<string, string>;
}

function fakeReqRes(body: unknown, ip: string): FakeRes {
  const req = { method: 'POST', body, headers: { 'x-forwarded-for': ip } } as unknown as VercelRequest;
  let statusCode = 200;
  let written = '';
  const headers: Record<string, string> = {};
  const res = {
    status(code: number) { statusCode = code; return res; },
    json(payload: unknown) { written = JSON.stringify(payload); return res; },
    setHeader(k: string, v: string) { headers[k] = v; return res; },
    write(chunk: string) { written += chunk; return true; },
    end() { return res; },
    get writableEnded() { return false; },
  } as unknown as VercelResponse;
  return { req, res, status: () => statusCode, text: () => written, headers };
}

function groqStreamResponse(text: string): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

describe('/api/brief contract', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('rejects a non-POST request', async () => {
    const { req, res, status } = fakeReqRes(undefined, '1.1.1.1');
    (req as any).method = 'GET';
    await handler(req, res);
    expect(status()).toBe(405);
  });

  it('rejects a missing facts array', async () => {
    const { req, res, status } = fakeReqRes({ dateLabel: 'Tuesday' }, '2.2.2.2');
    await handler(req, res);
    expect(status()).toBe(400);
  });

  it('short-circuits to "Nothing needs you today." for an empty facts array without calling the model', async () => {
    global.fetch = vi.fn() as unknown as typeof fetch;
    const { req, res, text } = fakeReqRes({ facts: [], dateLabel: 'Tuesday, 8 September' }, '3.3.3.3');
    await handler(req, res);
    expect(text()).toBe('Nothing needs you today.');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('streams the model phrasing through for a non-empty fact list', async () => {
    global.fetch = vi.fn(async () => groqStreamResponse('Tuesday — 1 thing needs you. Kofi is due to resurface.')) as unknown as typeof fetch;
    const { req, res, text } = fakeReqRes({
      facts: [{ kind: 'resurface_window', count: 1, names: ['Kofi'], link: '?c=1' }],
      dateLabel: 'Tuesday, 8 September',
    }, '4.4.4.4');
    await handler(req, res);
    expect(text()).toContain('Kofi');
  });

  it('sends the exact fact list in the prompt (no extra facts invented server-side)', async () => {
    global.fetch = vi.fn(async () => groqStreamResponse('ok')) as unknown as typeof fetch;
    const { req, res } = fakeReqRes({
      facts: [{ kind: 'placement_this_month', count: 1, names: ['Ada'], link: '?c=1' }],
      dateLabel: 'Tuesday, 8 September',
    }, '5.5.5.5');
    await handler(req, res);
    const mockFetch = global.fetch as unknown as { mock: { calls: [string, { body: string }][] } };
    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const userMessage = sentBody.messages.find((m: { role: string }) => m.role === 'user');
    expect(userMessage.content).toContain('"placement_this_month"');
    expect(userMessage.content).toContain('Ada');
  });

  it('ends the response cleanly (no thrown error surfaces to the client) when every provider fails', async () => {
    global.fetch = vi.fn(async () => new Response('down', { status: 500 })) as unknown as typeof fetch;
    const { req, res, text, status } = fakeReqRes({
      facts: [{ kind: 'sequence_due', count: 1, names: ['Ada'], link: '?c=1' }],
      dateLabel: 'Tuesday, 8 September',
    }, '6.6.6.6');
    await expect(handler(req, res)).resolves.not.toThrow();
    expect(status()).toBe(200);
    expect(text()).toBe('');
  });
});
