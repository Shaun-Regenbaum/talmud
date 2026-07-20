import { describe, expect, it } from 'vitest';
import { getCreditsState, resolveAiDown } from '../src/worker/ai-credits';
import { readAiDown } from '../src/worker/ai-down';

// In-memory KVNamespace covering the get/put/delete surface both the sentinel
// and the credits cache use (mirrors ai-down.test.ts). `kv` reads and writes the
// returned `store`, so a test seeds `store` then reads through the gate.
function fakeKV(seed: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(seed));
  const kv = {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string, _opts?: { expirationTtl?: number }) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  } as unknown as KVNamespace;
  return { kv, store };
}

const T = 1_700_000_000_000;

// Seed the credits cache directly so getCreditsState reads it and never touches
// the network — the balance + observation time under test travel through the row.
function seedBalance(store: Map<string, string>, remaining: number, at = T): void {
  store.set('ai-credits:v1', JSON.stringify({ remaining, at }));
}
// Seed the reactive sentinel with an explicit raise time so freshness ordering
// against the balance reading is deterministic.
function seedSentinel(store: Map<string, string>, reason: string, at = T): void {
  store.set('ai-down:v1', JSON.stringify({ reason, at }));
}

describe('getCreditsState', () => {
  it('reports out when the cached balance is at or below the floor', async () => {
    for (const remaining of [-0.18, 0, 0.05, 0.1]) {
      const { kv, store } = fakeKV();
      seedBalance(store, remaining);
      expect(await getCreditsState({ CACHE: kv })).toEqual({ out: true, remaining, at: T });
    }
  });

  it('reports healthy when the cached balance is above the floor', async () => {
    const { kv, store } = fakeKV();
    seedBalance(store, 12.5);
    expect(await getCreditsState({ CACHE: kv })).toEqual({ out: false, remaining: 12.5, at: T });
  });

  it('reports unknown (never "out") when the balance cannot be determined', async () => {
    // No provisioning key -> fetchOpenRouterBalance short-circuits, no network.
    const { kv, store } = fakeKV();
    expect(await getCreditsState({ CACHE: kv })).toEqual({ out: false, remaining: null, at: null });
    // Unknown must not be cached as a balance.
    expect(store.has('ai-credits:v1')).toBe(false);
  });

  it('reads a corrupt or timestamp-less cache row as unknown rather than out', async () => {
    const bad = fakeKV({ 'ai-credits:v1': 'not json' });
    expect(await getCreditsState({ CACHE: bad.kv })).toEqual({
      out: false,
      remaining: null,
      at: null,
    });
    const noTs = fakeKV({ 'ai-credits:v1': JSON.stringify({ remaining: 0 }) });
    expect(await getCreditsState({ CACHE: noTs.kv })).toEqual({
      out: false,
      remaining: null,
      at: null,
    });
  });
});

describe('resolveAiDown', () => {
  it('proactively raises a credits sentinel when out (quiet-window gap)', async () => {
    const { kv, store } = fakeKV();
    seedBalance(store, 0);
    expect(await readAiDown(kv)).toBeNull(); // no failure has happened yet
    const down = await resolveAiDown({ CACHE: kv });
    expect(down?.reason).toBe('credits');
    // ...and persists it so every plain readAiDown gate lights up too.
    expect((await readAiDown(kv))?.reason).toBe('credits');
  });

  it('leaves a non-credits sentinel standing when out of credits', async () => {
    const { kv, store } = fakeKV();
    seedBalance(store, 0);
    seedSentinel(store, 'provider');
    expect((await resolveAiDown({ CACHE: kv }))?.reason).toBe('provider');
  });

  it('clears a credits sentinel once a NEWER balance reading proves healthy', async () => {
    const { kv, store } = fakeKV();
    seedSentinel(store, 'credits', T); // raised before the top-up
    seedBalance(store, 20, T + 1000); // balance measured after
    expect(await resolveAiDown({ CACHE: kv })).toBeNull();
    expect(await readAiDown(kv)).toBeNull(); // recovered promptly
  });

  it('does NOT let a STALE positive balance clear a freshly-raised credits sentinel', async () => {
    // The race Codex flagged: a 60s-cached healthy balance, then a real 402
    // raises the sentinel. The stale positive reading must not delete it.
    const { kv, store } = fakeKV();
    seedBalance(store, 20, T); // cached healthy an instant ago
    seedSentinel(store, 'credits', T + 1000); // 402 landed AFTER that reading
    expect((await resolveAiDown({ CACHE: kv }))?.reason).toBe('credits');
    expect((await readAiDown(kv))?.reason).toBe('credits'); // sentinel survives
  });

  it('does NOT let a healthy balance clear a key-limit sentinel (credits exist, key capped)', async () => {
    const { kv, store } = fakeKV();
    seedSentinel(store, 'key-limit', T);
    seedBalance(store, 20, T + 1000);
    expect((await resolveAiDown({ CACHE: kv }))?.reason).toBe('key-limit');
  });

  it('defers to the sentinel when the balance is unknown', async () => {
    // Out-of-credits already known reactively; balance probe unavailable (no key).
    const { kv, store } = fakeKV();
    seedSentinel(store, 'credits', T);
    expect((await resolveAiDown({ CACHE: kv }))?.reason).toBe('credits');
  });

  it('allows generation when the balance is unknown and nothing failed', async () => {
    const { kv } = fakeKV();
    expect(await resolveAiDown({ CACHE: kv })).toBeNull();
  });
});
