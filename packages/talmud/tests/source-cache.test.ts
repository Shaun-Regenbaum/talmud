import { afterEach, describe, expect, it, vi } from 'vitest';

// Stub the upstream-fetch surfaces so the miss-path of each wrapper doesn't
// reach out to the live HebrewBooks / Sefaria APIs during unit tests. We
// only care about the CacheTrack callback contract here, not the upstream
// integration (which is exercised by tests/integration/*).
vi.mock('../src/lib/sefref', () => ({
  fetchHebrewBooksDaf: vi.fn(async () => ({
    main: 'fetched-main',
    rashi: 'fetched-rashi',
    tosafot: 'fetched-tosafot',
  })),
  sefariaAPI: {
    getTalmudPageWithCommentaries: vi.fn(async () => ({
      mainText: { hebrew: 'fetched-hebrew', english: 'fetched-english' },
    })),
  },
}));

import {
  getHebrewBooksDafCached,
  getSefariaPageCached,
  getSefariaSegmentsCached,
} from '../src/worker/source-cache';

function makeFakeKV(initial: Record<string, string> = {}): KVNamespace {
  const store = new Map(Object.entries(initial));
  const kv = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    list: vi.fn(),
    delete: vi.fn(),
    getWithMetadata: vi.fn(),
  };
  return kv as unknown as KVNamespace;
}

describe('source-cache CacheTrack', () => {
  describe('getHebrewBooksDafCached', () => {
    it('reports hit when KV has the entry', async () => {
      const states: Array<'hit' | 'miss'> = [];
      const kv = makeFakeKV({
        'hb:v2:Berakhot:2a': JSON.stringify({
          main: 'cached-main',
          rashi: 'cached-rashi',
          tosafot: 'cached-tosafot',
        }),
      });
      const data = await getHebrewBooksDafCached(kv, 'Berakhot', '2a', {
        onCache: (s) => states.push(s),
      });
      expect(states).toEqual(['hit']);
      expect(data?.main).toBe('cached-main');
    });

    it('reports miss when KV has no entry', async () => {
      const states: Array<'hit' | 'miss'> = [];
      const kv = makeFakeKV();
      const data = await getHebrewBooksDafCached(kv, 'Berakhot', '2a', {
        onCache: (s) => states.push(s),
      });
      expect(states).toEqual(['miss']);
      // Falls through to the (mocked) upstream fetcher.
      expect(data?.main).toBe('fetched-main');
    });

    it('reports miss when cache binding is undefined', async () => {
      const states: Array<'hit' | 'miss'> = [];
      await getHebrewBooksDafCached(undefined, 'Berakhot', '2a', {
        onCache: (s) => states.push(s),
      });
      expect(states).toEqual(['miss']);
    });

    it('treats the __failed negative-cache marker as a hit', async () => {
      // The wrapper writes { __failed: true } after an upstream failure to
      // short-circuit re-tries inside TTL_NEGATIVE. From the route's POV
      // that's still a KV hit — we didn't go to the network this call.
      const states: Array<'hit' | 'miss'> = [];
      const kv = makeFakeKV({
        'hb:v2:Berakhot:2a': JSON.stringify({ __failed: true }),
      });
      const data = await getHebrewBooksDafCached(kv, 'Berakhot', '2a', {
        onCache: (s) => states.push(s),
      });
      expect(states).toEqual(['hit']);
      expect(data).toBeNull();
    });

    it('does not throw when track is omitted', async () => {
      const kv = makeFakeKV({
        'hb:v2:Berakhot:2a': JSON.stringify({ main: 'm' }),
      });
      await expect(getHebrewBooksDafCached(kv, 'Berakhot', '2a')).resolves.toMatchObject({
        main: 'm',
      });
    });
  });

  describe('getSefariaPageCached', () => {
    it('reports hit when KV has the entry', async () => {
      const states: Array<'hit' | 'miss'> = [];
      const kv = makeFakeKV({
        'sefaria-bundle:v5:Berakhot:2a': JSON.stringify({
          mainText: { hebrew: 'cached-h', english: 'cached-e' },
        }),
      });
      const data = await getSefariaPageCached(kv, 'Berakhot', '2a', {
        onCache: (s) => states.push(s),
      });
      expect(states).toEqual(['hit']);
      expect(data?.mainText.hebrew).toBe('cached-h');
    });

    it('reports miss when KV has no entry', async () => {
      const states: Array<'hit' | 'miss'> = [];
      const kv = makeFakeKV();
      const data = await getSefariaPageCached(kv, 'Berakhot', '2a', {
        onCache: (s) => states.push(s),
      });
      expect(states).toEqual(['miss']);
      expect(data?.mainText.hebrew).toBe('fetched-hebrew');
    });

    it('reports miss when cache binding is undefined', async () => {
      const states: Array<'hit' | 'miss'> = [];
      await getSefariaPageCached(undefined, 'Berakhot', '2a', {
        onCache: (s) => states.push(s),
      });
      expect(states).toEqual(['miss']);
    });
  });
});

// A KV value that isn't JSON, or that has a shape the readers can't use, is
// treated as a MISS: the wrapper refetches from upstream instead of handing the
// junk on. Before the schema gate the second kind sailed through the cast and
// failed (or rendered wrong) somewhere downstream.
describe('source-cache rejects unusable KV values', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function silenceWarnings(): void {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  }

  it('refetches when the cached HebrewBooks value is not JSON', async () => {
    silenceWarnings();
    const states: Array<'hit' | 'miss'> = [];
    const kv = makeFakeKV({ 'hb:v2:Berakhot:2a': 'not json' });
    const data = await getHebrewBooksDafCached(kv, 'Berakhot', '2a', {
      onCache: (s) => states.push(s),
    });
    expect(states).toEqual(['miss']);
    expect(data?.main).toBe('fetched-main');
  });

  it('refetches when the cached HebrewBooks value has the wrong shape', async () => {
    silenceWarnings();
    // An entry with no Gemara column at all - nothing downstream can use it.
    const kv = makeFakeKV({ 'hb:v2:Berakhot:2a': JSON.stringify({ columns: ['a', 'b'] }) });
    const data = await getHebrewBooksDafCached(kv, 'Berakhot', '2a');
    expect(data?.main).toBe('fetched-main');
  });

  it('says which key it threw away', async () => {
    const warnings: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    });
    const kv = makeFakeKV({ 'hb:v2:Berakhot:2a': '{' });
    await getHebrewBooksDafCached(kv, 'Berakhot', '2a');
    expect(warnings.some((w) => w.includes('hb:v2:Berakhot:2a'))).toBe(true);
  });

  it('refetches when the cached Sefaria bundle has no mainText', async () => {
    silenceWarnings();
    const states: Array<'hit' | 'miss'> = [];
    const kv = makeFakeKV({
      'sefaria-bundle:v5:Berakhot:2a': JSON.stringify({ hebrew: 'h', english: 'e' }),
    });
    const data = await getSefariaPageCached(kv, 'Berakhot', '2a', {
      onCache: (s) => states.push(s),
    });
    expect(states).toEqual(['miss']);
    expect(data?.mainText.hebrew).toBe('fetched-hebrew');
  });

  it('reports a miss, not a hit, for a segments entry it cannot read', async () => {
    // This one is a deliberate correction, not a preserved behaviour: the old
    // code reported `hit` for a present-but-unreadable value and then refetched
    // anyway, so the x-cache header said hit while the request went upstream.
    // Every other wrapper in this file already reported miss for the same case.
    silenceWarnings();
    // The miss path goes on to Sefaria; the suite is offline, so stub it out.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 })),
    );
    const states: Array<'hit' | 'miss'> = [];
    const kv = makeFakeKV({ 'sefaria-seg:v1:Berakhot:2a': '{"he":[' });
    await getSefariaSegmentsCached(kv, 'Berakhot', '2a', { onCache: (s) => states.push(s) });
    expect(states).toEqual(['miss']);
  });

  it('still serves a value that is merely missing optional fields', async () => {
    const states: Array<'hit' | 'miss'> = [];
    const kv = makeFakeKV({
      'sefaria-bundle:v5:Berakhot:2a': JSON.stringify({
        mainText: { hebrew: 'cached-h', english: 'cached-e' },
        futureField: 7,
      }),
    });
    const data = await getSefariaPageCached(kv, 'Berakhot', '2a', {
      onCache: (s) => states.push(s),
    });
    expect(states).toEqual(['hit']);
    expect(data?.mainText.hebrew).toBe('cached-h');
    // Unknown keys survive the gate untouched - the schema reads the value, it
    // does not rewrite it.
    expect(data).toMatchObject({ futureField: 7 });
  });
});
