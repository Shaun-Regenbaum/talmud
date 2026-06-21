import { describe, expect, it, vi } from 'vitest';
import {
  halachaWarmProgressProcessed,
  readHalachaWarmCursor,
  runHalachaPhase,
} from '../src/worker/warm-cron';

const CURSOR_KEY = 'halacha-warm-cursor:v1';

// Minimal KV stub: the cursor key reads back what was put; halacha-refs keys are
// "all cached" or "all cold" per the flag — so the phase can be exercised
// without touching Sefaria (an all-cached run skips every fetch).
function mockCache(opts: { halachaCached: boolean }) {
  const puts: Record<string, string> = {};
  const get = vi.fn(async (k: string) => {
    if (k === CURSOR_KEY) return puts[k] ?? null;
    if (k.startsWith('halacha-refs:')) return opts.halachaCached ? '{}' : null;
    return null;
  });
  const put = vi.fn(async (k: string, v: string) => {
    puts[k] = v;
  });
  return { puts, get, put } as unknown as KVNamespace & {
    puts: Record<string, string>;
    get: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
  };
}

describe('runHalachaPhase — gated Shas-wide halacha-refs fill', () => {
  it('is a no-op when HALACHA_WARM_SHAS is unset (dormant by default)', async () => {
    const cache = mockCache({ halachaCached: true });
    await runHalachaPhase({ CACHE: cache });
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("is a no-op when the flag is '0'", async () => {
    const cache = mockCache({ halachaCached: true });
    await runHalachaPhase({ CACHE: cache, HALACHA_WARM_SHAS: '0' });
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('advances the cursor by one batch and skips already-cached dapim (no fetch)', async () => {
    const cache = mockCache({ halachaCached: true });
    await runHalachaPhase({ CACHE: cache, HALACHA_WARM_SHAS: '1' });
    const raw = cache.puts[CURSOR_KEY];
    expect(raw).toBeTruthy();
    const cursor = JSON.parse(raw);
    // Exactly one batch of amudim consumed (HALACHA_BATCH = 5), regardless of
    // which tractate leads the walk.
    expect(halachaWarmProgressProcessed(cursor)).toBe(5);
    expect(cursor.wraps).toBe(0);
    // Every probed key was already cached, so no halacha-refs were (re)written —
    // only the cursor key is put.
    const putKeys = cache.put.mock.calls.map((c) => c[0] as string);
    expect(putKeys).toEqual([CURSOR_KEY]);
  });

  it('resumes from a persisted cursor', async () => {
    const cache = mockCache({ halachaCached: true });
    cache.puts[CURSOR_KEY] = JSON.stringify({ tractateIdx: 0, amudIdx: 10, wraps: 0 });
    await runHalachaPhase({ CACHE: cache, HALACHA_WARM_SHAS: '1' });
    const cursor = JSON.parse(cache.puts[CURSOR_KEY]);
    expect(halachaWarmProgressProcessed(cursor)).toBe(15); // 10 + one batch of 5
  });
});

describe('halacha warm cursor helpers', () => {
  it('defaults a missing cursor to the start', async () => {
    const cache = mockCache({ halachaCached: false });
    expect(await readHalachaWarmCursor(cache)).toEqual({ tractateIdx: 0, amudIdx: 0, wraps: 0 });
  });

  it('counts processed amudim from the cursor position', () => {
    expect(halachaWarmProgressProcessed({ tractateIdx: 0, amudIdx: 0 })).toBe(0);
    expect(halachaWarmProgressProcessed({ tractateIdx: 0, amudIdx: 7 })).toBe(7);
  });
});
