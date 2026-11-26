import { BudgetPausedError } from '@corpus/core/llm/budget';
import { LLMError } from '@corpus/core/llm/llm-error';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readAiDown } from '../src/worker/ai-down';
import { registerTranslateRoutes } from '../src/worker/routes/translate';
import type { Bindings } from '../src/worker/types';

const runLLM = vi.fn();
vi.mock('@corpus/core/llm/llm', () => ({
  runLLM: (...args: unknown[]) => runLLM(...args),
}));

const KEY_URL = 'https://openrouter.ai/settings/keys';
const WORD = 'פילפול';
const FLASH = 'openrouter/deepseek/deepseek-v4-flash';
const GEMMA = '@cf/google/gemma-4-26b-a4b-it';

function keyLimit(): LLMError {
  return new LLMError(
    403,
    `OpenRouter HTTP 403: {"error":{"message":"Key limit exceeded (weekly limit). $50.19 of $50.00 used. Manage it using ${KEY_URL}"}}`,
  );
}

function fakeKV() {
  const store = new Map<string, string>();
  const ttls = new Map<string, number | undefined>();
  const kv = {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }) {
      store.set(key, value);
      ttls.set(key, opts?.expirationTtl);
    },
    async delete(key: string) {
      store.delete(key);
    },
  } as unknown as KVNamespace;
  return { kv, store, ttls };
}

function execution() {
  const pending: Promise<unknown>[] = [];
  const ctx = {
    waitUntil(p: Promise<unknown>) {
      pending.push(Promise.resolve(p));
    },
    passThroughOnException() {},
  } as unknown as ExecutionContext;
  return { ctx, flush: () => Promise.all(pending) };
}

const app = new Hono<{ Bindings: Bindings }>();
registerTranslateRoutes(app);

function models(): string[] {
  return runLLM.mock.calls.map((call) => (call[1] as { model: string }).model);
}

async function post(env: Partial<Bindings>, ctx: ExecutionContext) {
  return app.request(
    '/api/translate',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ word: WORD, tractate: 'Berakhot', page: '2a' }),
    },
    env,
    ctx,
  );
}

describe('POST /api/translate when the OpenRouter key is capped', () => {
  beforeEach(() => {
    runLLM.mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('no', { status: 404 })),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serves a Workers AI gloss and does not return the upstream body', async () => {
    runLLM.mockRejectedValueOnce(keyLimit()).mockResolvedValueOnce({ content: '"dialectic"' });
    const { kv, ttls } = fakeKV();
    const exec = execution();
    const res = await post({ AI: {} as Ai, CACHE: kv }, exec.ctx);
    await exec.flush();

    expect(res.status).toBe(200);
    expect(models()).toEqual([FLASH, GEMMA]);
    const body = await res.json();
    expect(body).toEqual({ translation: 'dialectic', cached: false, _model: 'gemma-4-26b' });
    expect(JSON.stringify(body)).not.toContain('openrouter.ai');
    expect(JSON.stringify(body)).not.toContain('attempts');
    const translateTtl = [...ttls.entries()].find(([key]) => key.startsWith('translate:'));
    expect(translateTtl?.[1]).toBe(60 * 60);
    expect((await readAiDown(kv))?.reason).toBe('key-limit');
  });

  it('answers 503 with Retry-After and no raw attempts when every model fails', async () => {
    runLLM
      .mockRejectedValueOnce(keyLimit())
      .mockRejectedValueOnce(new Error(`AiError 3046 upstream ${KEY_URL}`));
    const { kv } = fakeKV();
    const exec = execution();
    const res = await post({ AI: {} as Ai, CACHE: kv }, exec.ctx);

    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('3600');
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.attempts).toBeUndefined();
    expect(body).toMatchObject({ aiUnavailable: true, reason: 'key-limit' });
    expect(String(body.error)).not.toContain('openrouter.ai');
    expect(String(body.error)).not.toContain('Key limit');
    expect(String(body.error).length).toBeGreaterThan(10);
    expect(models()).toEqual([FLASH, GEMMA]);
  });

  it('does not call OpenRouter again while the key-cap sentinel is up', async () => {
    const { kv } = fakeKV();
    await kv.put('ai-down:v1', JSON.stringify({ reason: 'key-limit', at: Date.now() }));
    runLLM.mockResolvedValueOnce({ content: 'dialectic' });
    const exec = execution();
    const res = await post({ AI: {} as Ai, CACHE: kv }, exec.ctx);
    expect(res.status).toBe(200);
    expect(models()).toEqual([GEMMA]);
  });

  it('skips Workers AI when the binding is missing and still hides the key URL', async () => {
    runLLM.mockRejectedValueOnce(keyLimit());
    const exec = execution();
    const res = await post({ CACHE: fakeKV().kv }, exec.ctx);
    expect(res.status).toBe(503);
    expect(models()).toEqual([FLASH]);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.reason).toBe('key-limit');
    expect(JSON.stringify(body)).not.toContain(KEY_URL);
    expect(JSON.stringify(body)).not.toContain('OPENROUTER');
  });

  it('still uses OpenRouter alone when Workers AI is not bound and the key is fine', async () => {
    runLLM.mockResolvedValueOnce({ content: 'dialectic' });
    const { kv, ttls } = fakeKV();
    const exec = execution();
    const res = await post({ CACHE: kv }, exec.ctx);
    expect(res.status).toBe(200);
    expect(models()).toEqual([FLASH]);
    const translateTtl = [...ttls.entries()].find(([key]) => key.startsWith('translate:'));
    expect(translateTtl?.[1]).toBe(60 * 60 * 24 * 30);
  });

  it('does not try Workers AI after our own daily budget pause', async () => {
    runLLM.mockRejectedValueOnce(new BudgetPausedError('all', Date.now() + 5_000, 'over'));
    const exec = execution();
    const res = await post({ AI: {} as Ai, CACHE: fakeKV().kv }, exec.ctx);
    expect(res.status).toBe(503);
    expect(models()).toEqual([FLASH]);
    const body = (await res.json()) as { reason?: string };
    expect(body.reason).toBe('daily-cap');
    const retry = Number(res.headers.get('retry-after'));
    expect(retry).toBeGreaterThanOrEqual(4);
    expect(retry).toBeLessThanOrEqual(5);
  });
});
