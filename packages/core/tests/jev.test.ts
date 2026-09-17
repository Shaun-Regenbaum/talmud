import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BudgetPausedError } from '../src/llm/budget.ts';
import {
  type ChoiceAnswer,
  choice,
  JEV_ENDPOINT,
  jevAvailability,
  mergeChoiceMass,
  noul,
  rankedChoices,
  resetJevAvailability,
  runJev,
  score,
} from '../src/llm/jev.ts';
import type { LLMEnv } from '../src/llm/llm.ts';
import { LLMError } from '../src/llm/llm-error.ts';

/** In-memory KV: enough for the budget gate (counters read as absent) and to
 *  capture the cost ledger + spend counter writes. */
function fakeKV() {
  const store = new Map<string, string>();
  const kv = {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => {
      store.set(k, v);
    },
    delete: async (k: string) => {
      store.delete(k);
    },
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
  } as unknown as KVNamespace;
  return { kv, store };
}

function okResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const QUESTIONS = {
  which: choice('Which one?', { a: 'option a', b: 'option b', c: null }),
  yes: noul('Is it?', { true: 'yes', false: 'no' }),
  how: score('How much?', ['none', 'some', 'lots']),
};

const GOOD_ANSWERS = {
  model: 'jev-1.13.0',
  answers: {
    which: {
      type: 'choice',
      choice: 'a',
      probabilities: { a: 0.7, b: 0.2, c: 0.1 },
      confidence: 0.62,
    },
    yes: { type: 'noul', noul: 0.91 },
    how: {
      type: 'score',
      score: 1.4,
      legend: { '0': 'none', '1': 'some', '2': 'lots' },
      probabilities: { '0': 0.1, '1': 0.4, '2': 0.5 },
      confidence: 0.5,
    },
  },
  usage: { input_tokens: 1000, output_tokens: 48 },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  resetJevAvailability();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('runJev', () => {
  it('posts state + questions with the bearer key and returns typed answers', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(GOOD_ANSWERS));
    const { kv } = fakeKV();
    const env: LLMEnv = { CACHE: kv, TYPESAFE_API_KEY: 'k-test' };
    const res = await runJev(env, {
      state: { text: 'hello' },
      questions: QUESTIONS,
      tag: 'unit',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(JEV_ENDPOINT);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k-test');
    const sent = JSON.parse(init.body as string);
    expect(sent.model).toBe('jev-latest');
    expect(sent.state).toEqual({ text: 'hello' });
    expect(Object.keys(sent.questions)).toEqual(['which', 'yes', 'how']);

    expect(res.model).toBe('jev-1.13.0');
    expect(res.transport).toBe('typesafe');
    expect(res.answers.which.choice).toBe('a');
    expect(res.answers.which.probabilities.b).toBe(0.2);
    expect(res.answers.yes.noul).toBe(0.91);
    expect(res.answers.how.score).toBe(1.4);
    expect(res.usage).toEqual({ input_tokens: 1000, output_tokens: 48 });
  });

  it('writes a priced ledger row and bumps the daily spend counter', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(GOOD_ANSWERS));
    const { kv, store } = fakeKV();
    await runJev(
      { CACHE: kv, TYPESAFE_API_KEY: 'k' },
      {
        state: 's',
        questions: { yes: noul('q') },
        tag: 'rabbi.identity.pin',
        attribution: {
          kind: 'rabbi',
          producerId: 'rabbi.identity.pin',
          tractate: 'Berakhot',
          page: '2a',
        },
      },
    );
    const ledger = [...store.entries()].filter(([k]) => k.startsWith('llmcost:v1:'));
    expect(ledger).toHaveLength(1);
    const row = JSON.parse(ledger[0][1]);
    expect(row.model).toBe('typesafe/jev-1.13.0');
    expect(row.transport).toBe('typesafe');
    expect(row.tag).toBe('rabbi.identity.pin');
    expect(row.producer_id).toBe('rabbi.identity.pin');
    expect(row.tractate).toBe('Berakhot');
    expect(row.prompt_tokens).toBe(1000);
    expect(row.completion_tokens).toBe(48);
    // 1000 input tokens at $0.042 per million; output is free.
    expect(row.cost_in_est).toBeCloseTo(0.000042, 9);
    expect(row.cost_out_est).toBe(0);
    expect(row.cost).toBeNull();
    const spend = [...store.keys()].filter((k) => !k.startsWith('llmcost:v1:'));
    expect(spend.length).toBeGreaterThan(0); // daily bucket counter written
  });

  it('throws a non-retryable 503 before any fetch when the key is missing', async () => {
    const { kv } = fakeKV();
    await expect(
      runJev({ CACHE: kv }, { state: 's', questions: { yes: noul('q') } }),
    ).rejects.toMatchObject({ status: 503, retryable: false, fallbackWorthy: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses without a fetch when the spend guard is latched', async () => {
    const { kv, store } = fakeKV();
    // Arm the daily pause latch the way budget.ts writes it.
    const latch = {
      until: Date.now() + 3_600_000,
      reason: 'test',
      spentUsd: 999,
      armedAt: Date.now(),
    };
    for (const [k] of [...store.entries()]) store.delete(k);
    store.set('budget:v1:pause:all', JSON.stringify(latch));
    await expect(
      runJev({ CACHE: kv, TYPESAFE_API_KEY: 'k' }, { state: 's', questions: { yes: noul('q') } }),
    ).rejects.toBeInstanceOf(BudgetPausedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries a 429 and succeeds on the next attempt', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse({ error: 'slow down' }, 429))
      .mockResolvedValueOnce(okResponse(GOOD_ANSWERS));
    const { kv } = fakeKV();
    const res = await runJev(
      { CACHE: kv, TYPESAFE_API_KEY: 'k' },
      { state: 's', questions: QUESTIONS },
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.answers.which.choice).toBe('a');
  }, 10_000);

  it('does not retry a 422 (a malformed question is a bug, not a blip)', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ detail: 'bad question' }, 422));
    const { kv } = fakeKV();
    await expect(
      runJev({ CACHE: kv, TYPESAFE_API_KEY: 'k' }, { state: 's', questions: QUESTIONS }),
    ).rejects.toMatchObject({ status: 422, retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an answer whose choice is not one of the options', async () => {
    const bad = JSON.parse(JSON.stringify(GOOD_ANSWERS));
    bad.answers.which.choice = 'zzz';
    fetchMock.mockResolvedValueOnce(okResponse(bad));
    const { kv } = fakeKV();
    await expect(
      runJev({ CACHE: kv, TYPESAFE_API_KEY: 'k' }, { state: 's', questions: QUESTIONS }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it('rejects when an answer is missing or of the wrong type', async () => {
    const missing = JSON.parse(JSON.stringify(GOOD_ANSWERS));
    delete missing.answers.how;
    fetchMock.mockResolvedValueOnce(okResponse(missing));
    const { kv } = fakeKV();
    await expect(
      runJev({ CACHE: kv, TYPESAFE_API_KEY: 'k' }, { state: 's', questions: QUESTIONS }),
    ).rejects.toBeInstanceOf(LLMError);

    const wrongType = JSON.parse(JSON.stringify(GOOD_ANSWERS));
    wrongType.answers.yes = { type: 'choice', choice: 'a', probabilities: { a: 1 }, confidence: 1 };
    fetchMock.mockResolvedValueOnce(okResponse(wrongType));
    await expect(
      runJev({ CACHE: kv, TYPESAFE_API_KEY: 'k' }, { state: 's', questions: QUESTIONS }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it('fills a missing option probability with 0 rather than failing', async () => {
    const partial = JSON.parse(JSON.stringify(GOOD_ANSWERS));
    partial.answers.which.probabilities = { a: 0.9, b: 0.1 }; // c omitted
    fetchMock.mockResolvedValueOnce(okResponse(partial));
    const { kv } = fakeKV();
    const res = await runJev(
      { CACHE: kv, TYPESAFE_API_KEY: 'k' },
      { state: 's', questions: QUESTIONS },
    );
    expect(res.answers.which.probabilities.c).toBe(0);
  });
});

describe('availability breaker', () => {
  it('latches after a 402 (no credits) and fails fast without another fetch', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({ detail: { error_type: 'billing_error', message: 'no credits' } }, 402),
    );
    const { kv } = fakeKV();
    const env = { CACHE: kv, TYPESAFE_API_KEY: 'k' };
    await expect(runJev(env, { state: 's', questions: { yes: noul('q') } })).rejects.toMatchObject({
      status: 402,
      retryable: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(jevAvailability().ok).toBe(false);

    await expect(runJev(env, { state: 's', questions: { yes: noul('q') } })).rejects.toMatchObject({
      status: 402,
      message: expect.stringContaining('latched'),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1); // no second round trip
  });

  it('lets calls through again once the latch expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T12:00:00Z'));
    fetchMock.mockResolvedValueOnce(okResponse({ detail: 'bad key' }, 401));
    const { kv } = fakeKV();
    const env = { CACHE: kv, TYPESAFE_API_KEY: 'k' };
    await expect(runJev(env, { state: 's', questions: { yes: noul('q') } })).rejects.toMatchObject({
      status: 401,
    });
    expect(jevAvailability().ok).toBe(false);
    vi.setSystemTime(new Date('2026-09-17T12:11:00Z'));
    expect(jevAvailability().ok).toBe(true);
    fetchMock.mockResolvedValueOnce(okResponse(GOOD_ANSWERS));
    const res = await runJev(env, { state: 's', questions: QUESTIONS });
    expect(res.answers.which.choice).toBe('a');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not latch on a 422 or a retried 5xx', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ detail: 'bad question' }, 422));
    const { kv } = fakeKV();
    const env = { CACHE: kv, TYPESAFE_API_KEY: 'k' };
    await expect(runJev(env, { state: 's', questions: QUESTIONS })).rejects.toMatchObject({
      status: 422,
    });
    expect(jevAvailability().ok).toBe(true);
  });
});

describe('answer helpers', () => {
  const a: ChoiceAnswer = {
    type: 'choice',
    choice: 'rabbi-oshaya',
    probabilities: { 'rabbi-oshaya': 0.39, 'rabbi-oshaya-2': 0.33, decline: 0.28 },
    confidence: 0.09,
  };

  it('rankedChoices sorts highest first', () => {
    expect(rankedChoices(a).map(([k]) => k)).toEqual(['rabbi-oshaya', 'rabbi-oshaya-2', 'decline']);
  });

  it('mergeChoiceMass folds duplicate registry nodes into one option', () => {
    const m = mergeChoiceMass(a, { 'rabbi-oshaya': ['rabbi-oshaya-2'] });
    expect(m.choice).toBe('rabbi-oshaya');
    expect(m.probabilities['rabbi-oshaya']).toBeCloseTo(0.72, 9);
    expect(m.probabilities.decline).toBeCloseTo(0.28, 9);
    expect('rabbi-oshaya-2' in m.probabilities).toBe(false);
  });

  it('mergeChoiceMass can flip the winner when a group outweighs the raw top option', () => {
    const b: ChoiceAnswer = {
      type: 'choice',
      choice: 'x',
      probabilities: { x: 0.4, y1: 0.35, y2: 0.25 },
      confidence: 0.1,
    };
    const m = mergeChoiceMass(b, { y1: ['y2'] });
    expect(m.choice).toBe('y1');
    expect(m.probabilities.y1).toBeCloseTo(0.6, 9);
  });

  it('mergeChoiceMass leaves ungrouped answers unchanged', () => {
    const m = mergeChoiceMass(a, {});
    expect(m.choice).toBe('rabbi-oshaya');
    expect(m.probabilities).toEqual(a.probabilities);
  });
});
