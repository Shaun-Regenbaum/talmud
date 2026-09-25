import { afterEach, describe, expect, it, vi } from 'vitest';
import { readAiDown } from '../src/worker/ai-down';
import { keyForAnalyzeSkeleton, keyForRabbiGraph } from '../src/worker/cache-keys';
import worker from '../src/worker/index';
import { readMark } from '../src/worker/studio-registry';
import type { Bindings } from '../src/worker/types';
import { readWarmCursor } from '../src/worker/warm-cron';

// Three cases per converted read, the ones that matter: a good value is served
// unchanged, a missing value takes the path it always did, and a value that is
// junk or has an older shape takes THAT SAME path instead of failing somewhere
// downstream. The middle and the last case must be indistinguishable to a
// caller - that is the whole promise of the change.

function fakeKV(initial: Record<string, string> = {}): KVNamespace {
  const store = new Map(Object.entries(initial));
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    list: vi.fn(async () => ({ keys: [], list_complete: true })),
    getWithMetadata: vi.fn(),
  } as unknown as KVNamespace;
}

function silenceWarnings(): void {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the warm walk cursor', () => {
  const KEY = 'warm-cursor:v1';

  it('serves a stored cursor', async () => {
    const cur = await readWarmCursor(fakeKV({ [KEY]: '{"tractateIdx":3,"amudIdx":12}' }));
    expect(cur).toMatchObject({ tractateIdx: 3, amudIdx: 12 });
  });

  it('starts from the beginning when there is no cursor', async () => {
    expect(await readWarmCursor(fakeKV())).toEqual({ tractateIdx: 0, amudIdx: 0 });
  });

  it('starts from the beginning when the cursor is junk', async () => {
    silenceWarnings();
    expect(await readWarmCursor(fakeKV({ [KEY]: 'not json' }))).toEqual({
      tractateIdx: 0,
      amudIdx: 0,
    });
  });

  it('starts from the beginning when the cursor has an older shape', async () => {
    // A cursor whose indices are strings would have walked to NaN and stalled
    // the warm cron on whatever daf it was at.
    silenceWarnings();
    expect(await readWarmCursor(fakeKV({ [KEY]: '{"tractate":"Berakhot","amud":"2a"}' }))).toEqual({
      tractateIdx: 0,
      amudIdx: 0,
    });
  });
});

describe('a Studio mark definition', () => {
  const KEY = 'mark-defs:v2:places';

  it('serves a stored definition', async () => {
    const stored = { id: 'places', label: 'Places', cache_version: '3', extractor: 'llm' };
    const env = { CACHE: fakeKV({ [KEY]: JSON.stringify(stored) }) };
    expect(await readMark(env, 'places')).toEqual(stored);
  });

  it('keeps a definition that predates a field, so the KV copy still wins', async () => {
    // Only id and cache_version are required; everything a later version added
    // has to stay optional, or an operator's saved definition would silently
    // stop being used.
    const env = { CACHE: fakeKV({ [KEY]: '{"id":"places","cache_version":"3"}' }) };
    expect(await readMark(env, 'places')).toMatchObject({ id: 'places' });
  });

  it('reads as absent when there is no definition', async () => {
    expect(await readMark({ CACHE: fakeKV() }, 'places')).toBeNull();
  });

  it('reads as absent when the definition has no cache_version', async () => {
    // Its cache_version goes into the key every result of this mark is stored
    // under; without one the worker would write under a key containing the
    // word "undefined".
    silenceWarnings();
    const env = { CACHE: fakeKV({ [KEY]: '{"id":"places","label":"Places"}' }) };
    expect(await readMark(env, 'places')).toBeNull();
  });
});

describe('the AI-down sentinel', () => {
  const KEY = 'ai-down:v1';

  it('reports the stored pause', async () => {
    const kv = fakeKV({ [KEY]: '{"reason":"credits","at":1700000000000}' });
    expect(await readAiDown(kv)).toMatchObject({ reason: 'credits' });
  });

  it('reads as not-down when nothing is stored', async () => {
    expect(await readAiDown(fakeKV())).toBeNull();
  });

  it('reads as not-down when the sentinel is junk', async () => {
    silenceWarnings();
    expect(await readAiDown(fakeKV({ [KEY]: '{"reason":' }))).toBeNull();
  });

  it('reads as not-down when the sentinel has no timestamp', async () => {
    silenceWarnings();
    expect(await readAiDown(fakeKV({ [KEY]: '{"reason":"credits"}' }))).toBeNull();
  });
});

// The same three cases through the real handlers, so the ANSWER a caller gets
// is what is pinned, not just the reader's return value.

const ctx = {
  waitUntil() {},
  passThroughOnException() {},
} as unknown as ExecutionContext;

function get(url: string, env: Partial<Bindings>) {
  return worker.fetch(new Request(url, { headers: { host: 'talmud.dev' } }), env as Bindings, ctx);
}

describe('GET /api/admin/rabbi-graph', () => {
  const KEY = keyForRabbiGraph();

  it('serves the compiled graph', async () => {
    const blob = { generatedAt: '2026-01-01T00:00:00Z', count: 1, nodes: { rav: {} } };
    const res = await get('https://talmud.dev/api/admin/rabbi-graph', {
      CACHE: fakeKV({ [KEY]: JSON.stringify(blob) }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(blob);
  });

  it('answers "not compiled" when the graph was never built', async () => {
    const res = await get('https://talmud.dev/api/admin/rabbi-graph', { CACHE: fakeKV() });
    expect(res.status).toBe(404);
  });

  it('answers "not compiled" when the stored graph is junk', async () => {
    silenceWarnings();
    const res = await get('https://talmud.dev/api/admin/rabbi-graph', {
      CACHE: fakeKV({ [KEY]: 'half a blo' }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not compiled' });
  });

  it('answers "not compiled" when the stored graph has no nodes map', async () => {
    silenceWarnings();
    const res = await get('https://talmud.dev/api/admin/rabbi-graph', {
      CACHE: fakeKV({ [KEY]: '{"generatedAt":"2026-01-01T00:00:00Z","count":0}' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/region/:tractate/:page', () => {
  const KEY = keyForAnalyzeSkeleton('Berakhot', '2a');

  it('reads the cached skeleton', async () => {
    const skeleton = {
      summary: 's',
      sections: [{ title: 't', summary: 's', excerpt: 'e', rabbiNames: [] }],
    };
    const res = await get('https://talmud.dev/api/region/Berakhot/2a', {
      CACHE: fakeKV({ [KEY]: JSON.stringify(skeleton) }),
    });
    expect(res.status).toBe(200);
  });

  it('asks for the skeleton to be run when there is none', async () => {
    const res = await get('https://talmud.dev/api/region/Berakhot/2a', { CACHE: fakeKV() });
    expect(res.status).toBe(412);
  });

  it('asks for the skeleton to be run when the stored one is junk', async () => {
    // Before the gate this threw inside the handler and the caller got a 500.
    silenceWarnings();
    const res = await get('https://talmud.dev/api/region/Berakhot/2a', {
      CACHE: fakeKV({ [KEY]: '{"summary":"s","sections":' }),
    });
    expect(res.status).toBe(412);
  });

  it('asks for the skeleton to be run when the stored one has no sections', async () => {
    silenceWarnings();
    const res = await get('https://talmud.dev/api/region/Berakhot/2a', {
      CACHE: fakeKV({ [KEY]: '{"summary":"s"}' }),
    });
    expect(res.status).toBe(412);
  });
});

describe('GET /api/log/recent', () => {
  const KEY = 'client-logs:recent';

  it('serves the buffer', async () => {
    const res = await get('https://talmud.dev/api/log/recent', {
      CACHE: fakeKV({ [KEY]: '[{"ts":"2026-01-01T00:00:00Z"}]' }),
    });
    expect(await res.json()).toEqual({ logs: [{ ts: '2026-01-01T00:00:00Z' }] });
  });

  it('serves an empty list when nothing has been logged', async () => {
    const res = await get('https://talmud.dev/api/log/recent', { CACHE: fakeKV() });
    expect(await res.json()).toEqual({ logs: [] });
  });

  it('serves an empty list when the buffer is junk', async () => {
    silenceWarnings();
    const res = await get('https://talmud.dev/api/log/recent', {
      CACHE: fakeKV({ [KEY]: '{"not":"a list"}' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ logs: [] });
  });
});

describe('GET /api/run-status/:runId', () => {
  it('serves the job record', async () => {
    const res = await get('https://talmud.dev/api/run-status/abc', {
      CACHE: fakeKV({ 'job:abc': '{"status":"done"}' }),
    });
    expect(await res.json()).toEqual({ status: 'done' });
  });

  it('still calls a job record it cannot read corrupt, rather than pending', async () => {
    // Deliberately NOT the missing-value answer here: a client polling for a
    // specific run would otherwise poll for one that can never arrive.
    silenceWarnings();
    const res = await get('https://talmud.dev/api/run-status/abc', {
      CACHE: fakeKV({ 'job:abc': '{"status":' }),
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: 'corrupt job record' });
  });
});
