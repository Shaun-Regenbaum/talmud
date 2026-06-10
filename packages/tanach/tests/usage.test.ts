import { describe, expect, it } from 'vitest';
import { readUsage, recordUsage, type UsageEntry } from '../src/worker/usage';

/** Minimal in-memory stand-in for the KV binding (string get/put only). */
function kvStub(initial?: Record<string, string>) {
  const store = new Map(Object.entries(initial ?? {}));
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => {
      store.set(k, v);
    },
  } as unknown as KVNamespace;
}

const entry = (over: Partial<UsageEntry>): UsageEntry => ({
  ts: 0,
  ref: 'Genesis 1',
  producer: 'translate',
  model: 'm',
  in: 100,
  out: 50,
  cost: 0.001,
  ...over,
});

describe('usage ledger', () => {
  it('starts empty and tolerates malformed stored JSON', async () => {
    expect((await readUsage(kvStub())).calls).toBe(0);
    expect((await readUsage(kvStub({ 'usage:v1': 'not json' }))).calls).toBe(0);
  });

  it('accumulates totals and per-producer buckets', async () => {
    const kv = kvStub();
    await recordUsage(kv, entry({}));
    await recordUsage(kv, entry({ producer: 'events', cost: null, in: 10, out: 5 }));
    await recordUsage(kv, entry({}));

    const s = await readUsage(kv);
    expect(s.calls).toBe(3);
    expect(s.inTokens).toBe(210);
    expect(s.outTokens).toBe(105);
    expect(s.costUsd).toBeCloseTo(0.002);
    expect(s.byProducer.translate).toEqual({
      calls: 2,
      costUsd: expect.closeTo(0.002),
      inTokens: 200,
      outTokens: 100,
    });
    expect(s.byProducer.events).toEqual({ calls: 1, costUsd: 0, inTokens: 10, outTokens: 5 });
  });

  it('buckets per model and tolerates pre-token ledger entries', async () => {
    // A stored summary from before token/byModel tracking: per-producer buckets
    // without token fields and no byModel at all. Recording on top must not
    // throw, and the old buckets keep accumulating.
    const legacy = {
      calls: 1,
      inTokens: 100,
      outTokens: 50,
      costUsd: 0.001,
      byProducer: { translate: { calls: 1, costUsd: 0.001 } },
      recent: [],
    };
    const kv = kvStub({ 'usage:v1': JSON.stringify(legacy) });
    await recordUsage(kv, entry({}));
    const s = await readUsage(kv);
    expect(s.calls).toBe(2);
    expect(s.byProducer.translate).toEqual({
      calls: 2,
      costUsd: expect.closeTo(0.002),
      inTokens: 100,
      outTokens: 50,
    });
    expect(s.byModel?.[entry({}).model]).toEqual({
      calls: 1,
      costUsd: expect.closeTo(0.001),
      inTokens: 100,
      outTokens: 50,
    });
  });

  it('keeps the most recent calls first, capped at 100', async () => {
    const kv = kvStub();
    for (let i = 0; i < 105; i++) {
      await recordUsage(kv, entry({ ts: i }));
    }
    const s = await readUsage(kv);
    expect(s.recent.length).toBe(100);
    expect(s.recent[0]?.ts).toBe(104);
    expect(s.calls).toBe(105);
  });
});
