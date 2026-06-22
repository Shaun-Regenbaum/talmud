import type { UsageEntry } from '@corpus/core/telemetry/types';
import { describe, expect, it } from 'vitest';
import { readUsage, recordUsage } from '../src/worker/usage';

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
  tokensIn: 100,
  tokensOut: 50,
  costUsd: 0.001,
  costInUsd: 0.0006,
  costOutUsd: 0.0004,
  ...over,
});

describe('usage ledger', () => {
  it('starts empty and tolerates malformed stored JSON', async () => {
    expect((await readUsage(kvStub())).summary.totals.calls).toBe(0);
    expect((await readUsage(kvStub({ 'usage:v2': 'not json' }))).summary.totals.calls).toBe(0);
    expect((await readUsage(kvStub({ 'usage:v1': 'not json' }))).summary.totals.calls).toBe(0);
  });

  it('accumulates totals, per-producer, per-model and per-ref buckets', async () => {
    const kv = kvStub();
    await recordUsage(kv, entry({}));
    await recordUsage(
      kv,
      entry({
        producer: 'events',
        costUsd: null,
        tokensIn: 10,
        tokensOut: 5,
        costInUsd: 0,
        costOutUsd: 0,
      }),
    );
    await recordUsage(kv, entry({}));

    const { summary } = await readUsage(kv);
    expect(summary.totals.calls).toBe(3);
    expect(summary.totals.tokensIn).toBe(210);
    expect(summary.totals.tokensOut).toBe(105);
    expect(summary.totals.costUsd).toBeCloseTo(0.002);
    expect(summary.byProducer.translate).toEqual({
      calls: 2,
      tokensIn: 200,
      tokensOut: 100,
      costUsd: expect.closeTo(0.002),
      costInUsd: expect.closeTo(0.0012),
      costOutUsd: expect.closeTo(0.0008),
    });
    expect(summary.byProducer.events).toEqual({
      calls: 1,
      tokensIn: 10,
      tokensOut: 5,
      costUsd: 0,
      costInUsd: 0,
      costOutUsd: 0,
    });
    // per-ref (per-chapter) is the same fold over a third dimension.
    expect(summary.byRef['Genesis 1'].calls).toBe(3);
  });

  it('migrates a v1 ledger and keeps accumulating on top of it', async () => {
    // The pre-telemetry v1 shape: flat totals, per-producer/per-model buckets
    // without token fields, and recent entries keyed in/out/cost.
    const legacy = {
      calls: 1,
      inTokens: 100,
      outTokens: 50,
      costUsd: 0.001,
      byProducer: { translate: { calls: 1, costUsd: 0.001 } },
      byModel: { m: { calls: 1, costUsd: 0.001 } },
      recent: [
        {
          ts: 1,
          ref: 'Genesis 1',
          producer: 'translate',
          model: 'm',
          in: 100,
          out: 50,
          cost: 0.001,
        },
      ],
    };
    const kv = kvStub({ 'usage:v1': JSON.stringify(legacy) });

    // Reading alone migrates the visible numbers (in -> tokensIn on recent).
    const migrated = await readUsage(kv);
    expect(migrated.summary.totals.calls).toBe(1);
    expect(migrated.recent[0]?.tokensIn).toBe(100);

    await recordUsage(kv, entry({}));
    const { summary } = await readUsage(kv);
    expect(summary.totals.calls).toBe(2);
    expect(summary.byProducer.translate).toEqual({
      calls: 2,
      tokensIn: 100, // historical bucket had no tokens; only the new call adds them
      tokensOut: 50,
      costUsd: expect.closeTo(0.002),
      costInUsd: expect.closeTo(0.0006),
      costOutUsd: expect.closeTo(0.0004),
    });
  });

  it('keeps the most recent calls first, capped at 100', async () => {
    const kv = kvStub();
    for (let i = 0; i < 105; i++) {
      await recordUsage(kv, entry({ ts: i }));
    }
    const { summary, recent } = await readUsage(kv);
    expect(recent.length).toBe(100);
    expect(recent[0]?.ts).toBe(104);
    expect(summary.totals.calls).toBe(105);
  });
});
