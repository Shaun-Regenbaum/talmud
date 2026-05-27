import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import type { RunResult } from '../src/client/enrichmentQueue';
import type { LruMap } from '../src/lib/lruMap';

// The module registers a `marks-runs-invalidate` listener on `window` at load
// (guarded by `typeof window !== 'undefined'`). The default test env is `node`
// with no `window`, so install a minimal EventTarget-backed shim BEFORE the
// module is imported (below, in beforeAll) — node provides EventTarget + Event
// globally, so no jsdom dependency is needed just to exercise the wiring.
class FakeWindow extends EventTarget {}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).window = new FakeWindow();

let runResultCache: LruMap<string, RunResult>;
let runCacheKey: (e: string, t: string, p: string, i: string, lang: string) => string;
let clearRunResultCache: () => void;

beforeAll(async () => {
  const m = await import('../src/client/enrichmentQueue');
  runResultCache = m.runResultCache;
  runCacheKey = m.runCacheKey;
  clearRunResultCache = m.clearRunResultCache;
});

function fakeResult(content: string): RunResult {
  return { content, parsed: { content }, parse_error: null, model: 'test', total_ms: 0 };
}

beforeEach(() => clearRunResultCache());

describe('runCacheKey', () => {
  it('joins enrichmentId:tractate:page:instanceKey:lang', () => {
    expect(runCacheKey('argument.synthesis', 'Berakhot', '2a', '0-4-Opening', 'en')).toBe(
      'argument.synthesis:Berakhot:2a:0-4-Opening:en',
    );
  });

  it('is distinct when any component differs', () => {
    const keys = new Set([
      runCacheKey('rabbi.synthesis', 'Berakhot', '2a', 'Rabbi Eliezer', 'en'),
      runCacheKey('rabbi.relationships', 'Berakhot', '2a', 'Rabbi Eliezer', 'en'), // enrichment
      runCacheKey('rabbi.synthesis', 'Shabbat', '2a', 'Rabbi Eliezer', 'en'),       // tractate
      runCacheKey('rabbi.synthesis', 'Berakhot', '2b', 'Rabbi Eliezer', 'en'),      // page
      runCacheKey('rabbi.synthesis', 'Berakhot', '2a', 'Rabbi Akiva', 'en'),        // instance
      runCacheKey('rabbi.synthesis', 'Berakhot', '2a', 'Rabbi Eliezer', 'he'),      // lang
    ]);
    expect(keys.size).toBe(6);
  });

  it('separates English and Hebrew so a lang switch never reads the other lang', () => {
    expect(runCacheKey('argument.synthesis', 'Shabbat', '126a', '0-0-Opening', 'en'))
      .not.toBe(runCacheKey('argument.synthesis', 'Shabbat', '126a', '0-0-Opening', 'he'));
  });
});

describe('runResultCache — store / retrieve', () => {
  it('round-trips a result under its key (a re-click hits the memo)', () => {
    const key = runCacheKey('pesukim.synthesis', 'Berakhot', '2a', 'Deuteronomy 6:7', 'en');
    expect(runResultCache.has(key)).toBe(false);     // cold: first open misses
    runResultCache.set(key, fakeResult('verse synthesis'));
    expect(runResultCache.get(key)?.content).toBe('verse synthesis'); // warm: re-click hits
  });

  it('does not collide across instances of the same enrichment', () => {
    const k1 = runCacheKey('pesukim.synthesis', 'Berakhot', '2a', 'Deuteronomy 6:7', 'en');
    const k2 = runCacheKey('pesukim.synthesis', 'Berakhot', '2a', 'Leviticus 22:7', 'en');
    runResultCache.set(k1, fakeResult('deut'));
    runResultCache.set(k2, fakeResult('lev'));
    expect(runResultCache.get(k1)?.content).toBe('deut');
    expect(runResultCache.get(k2)?.content).toBe('lev');
    // A third, never-stored instance is a miss (would trigger a fetch).
    expect(runResultCache.has(runCacheKey('pesukim.synthesis', 'Berakhot', '2a', 'Genesis 1:5', 'en'))).toBe(false);
  });
});

describe('cache invalidation', () => {
  it('clearRunResultCache() empties the memo', () => {
    runResultCache.set(runCacheKey('a', 'B', '2a', 'x', 'en'), fakeResult('one'));
    runResultCache.set(runCacheKey('b', 'B', '2a', 'y', 'en'), fakeResult('two'));
    expect(runResultCache.size).toBe(2);
    clearRunResultCache();
    expect(runResultCache.size).toBe(0);
  });

  it('a `marks-runs-invalidate` event clears the memo (model/prompt change)', () => {
    runResultCache.set(runCacheKey('rabbi.synthesis', 'B', '2a', 'Hillel', 'en'), fakeResult('bio'));
    expect(runResultCache.size).toBe(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.dispatchEvent(new Event('marks-runs-invalidate'));
    expect(runResultCache.size).toBe(0);
  });
});
