import { describe, expect, it } from 'vitest';
import {
  clearAiDown,
  isHardAiPause,
  noteAiDown,
  readAiDown,
  transportProvesAiUp,
} from '../src/worker/ai-down';

// Minimal in-memory KVNamespace covering the get/put surface the sentinel uses
// (mirrors observed-place-filter.test.ts), capturing TTLs for assertion.
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

describe('ai-down sentinel', () => {
  it('round-trips a raised sentinel', async () => {
    const { kv } = fakeKV();
    expect(await readAiDown(kv)).toBeNull();
    await noteAiDown(kv, 'key-limit');
    const down = await readAiDown(kv);
    expect(down?.reason).toBe('key-limit');
    expect(typeof down?.at).toBe('number');
  });

  it('uses the long TTL for hard spend pauses and the short one for blips', async () => {
    const hard = fakeKV();
    await noteAiDown(hard.kv, 'credits');
    expect(hard.ttls.get('ai-down:v1')).toBe(300);

    const soft = fakeKV();
    await noteAiDown(soft.kv, 'provider');
    expect(soft.ttls.get('ai-down:v1')).toBe(60);
  });

  it('writes at most once per TTL window (same-key KV writes are rate-limited)', async () => {
    const { kv, store } = fakeKV();
    await noteAiDown(kv, 'key-limit');
    const first = store.get('ai-down:v1');
    await noteAiDown(kv, 'provider'); // storm continues — must not overwrite
    expect(store.get('ai-down:v1')).toBe(first);
    await noteAiDown(kv, 'credits'); // hard-to-hard: also no rewrite
    expect(store.get('ai-down:v1')).toBe(first);
  });

  it('upgrades a soft blip to a hard spend pause (but never downgrades)', async () => {
    const { kv, ttls } = fakeKV();
    await noteAiDown(kv, 'rate-limit');
    expect(ttls.get('ai-down:v1')).toBe(60);
    await noteAiDown(kv, 'key-limit'); // the hard failure must not be masked
    expect((await readAiDown(kv))?.reason).toBe('key-limit');
    expect(ttls.get('ai-down:v1')).toBe(300);
  });

  it('clears when the succeeding run started after the sentinel rose', async () => {
    const { kv } = fakeKV();
    await clearAiDown(kv, Date.now()); // nothing raised: no-op
    await noteAiDown(kv, 'credits');
    await clearAiDown(kv, Date.now() + 1); // run began after the failure: disproves it
    expect(await readAiDown(kv)).toBeNull();
    await clearAiDown(undefined, Date.now()); // no cache binding: silent no-op
  });

  it('leaves a sentinel raised MID-run standing (a concurrent failure is newer info)', async () => {
    const { kv } = fakeKV();
    const runStart = Date.now() - 60_000; // job began a minute ago
    await noteAiDown(kv, 'key-limit'); // raised while the job was running
    await clearAiDown(kv, runStart);
    expect((await readAiDown(kv))?.reason).toBe('key-limit');
  });

  it('only LLM transports prove the provider is up', () => {
    expect(transportProvesAiUp('openrouter-gateway')).toBe(true);
    expect(transportProvesAiUp('workers-ai')).toBe(true);
    expect(transportProvesAiUp('computed')).toBe(false);
    expect(transportProvesAiUp('graph')).toBe(false);
    expect(transportProvesAiUp('lookup')).toBe(false);
    expect(transportProvesAiUp(undefined)).toBe(false);
  });

  it('reads a corrupt or missing sentinel as "not down"', async () => {
    const { kv, store } = fakeKV();
    store.set('ai-down:v1', 'not json');
    expect(await readAiDown(kv)).toBeNull();
    store.set('ai-down:v1', JSON.stringify({ nope: true }));
    expect(await readAiDown(kv)).toBeNull();
    expect(await readAiDown(undefined)).toBeNull();
    await noteAiDown(undefined, 'credits'); // no cache binding: silent no-op
  });

  it('classifies hard vs soft pauses', () => {
    expect(isHardAiPause('credits')).toBe(true);
    expect(isHardAiPause('key-limit')).toBe(true);
    expect(isHardAiPause('rate-limit')).toBe(false);
    expect(isHardAiPause('provider')).toBe(false);
    expect(isHardAiPause('cost-control')).toBe(false);
  });
});
