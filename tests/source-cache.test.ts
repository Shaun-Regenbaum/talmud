import { describe, it, expect, vi } from 'vitest';

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
        'hb:v1:Berakhot:2a': JSON.stringify({
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
        'hb:v1:Berakhot:2a': JSON.stringify({ __failed: true }),
      });
      const data = await getHebrewBooksDafCached(kv, 'Berakhot', '2a', {
        onCache: (s) => states.push(s),
      });
      expect(states).toEqual(['hit']);
      expect(data).toBeNull();
    });

    it('does not throw when track is omitted', async () => {
      const kv = makeFakeKV({
        'hb:v1:Berakhot:2a': JSON.stringify({ main: 'm' }),
      });
      await expect(
        getHebrewBooksDafCached(kv, 'Berakhot', '2a'),
      ).resolves.toMatchObject({ main: 'm' });
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
