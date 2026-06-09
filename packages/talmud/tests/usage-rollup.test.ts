import { describe, expect, it } from 'vitest';
import { readUsageSummary, recordUsage, type UsageDelta } from '../src/worker/usage-rollup';

// Prefix-aware in-memory KV — usage-rollup lists `usage:daily:v1:*` and does a
// read-modify-write per record, so the fake must support get/put + prefix list.
function makeFakeKV() {
  const store = new Map<string, string>();
  const kv = {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => {
      store.set(k, v);
    },
    delete: async (k: string) => {
      store.delete(k);
    },
    list: async ({ prefix = '' }: { prefix?: string; cursor?: string; limit?: number } = {}) => ({
      keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })),
      list_complete: true,
      cursor: '',
    }),
    getWithMetadata: async () => ({ value: null, metadata: null }),
  };
  return { kv: kv as unknown as KVNamespace, store };
}

// recordUsage is fire-and-forget via ctx.waitUntil. Each write is a
// read-modify-write of the same daily key, and KV has no atomic increment — so
// in production concurrent writes can lose increments (the rollup accepts that
// raciness deliberately). The test settles each write before the next so the
// aggregation under test is exercised deterministically.
async function record(env: { CACHE: KVNamespace }, deltas: UsageDelta[]) {
  for (const d of deltas) {
    let captured: Promise<unknown> = Promise.resolve();
    recordUsage(
      env,
      {
        waitUntil: (p: Promise<unknown>) => {
          captured = p;
        },
      },
      d,
    );
    await captured;
  }
}

const priced = (over: Partial<UsageDelta> = {}): UsageDelta => ({
  ok: true,
  cacheHit: false,
  model: 'openrouter/deepseek/deepseek-v4-flash',
  tokensIn: 1000,
  tokensOut: 500,
  costUsd: 0.001,
  costInUsd: 0.0007,
  costOutUsd: 0.0003,
  ...over,
});

describe('usage-rollup with cost split', () => {
  it('accumulates totals and the input/output cost split', async () => {
    const { kv } = makeFakeKV();
    const env = { CACHE: kv };
    await record(env, [
      priced({ markId: 'rabbi' }),
      priced({
        markId: 'rabbi',
        tokensIn: 2000,
        tokensOut: 1000,
        costUsd: 0.002,
        costInUsd: 0.0014,
        costOutUsd: 0.0006,
      }),
    ]);
    const s = await readUsageSummary(kv);
    expect(s.totals.calls).toBe(2);
    expect(s.totals.costUsd).toBeCloseTo(0.003, 9);
    expect(s.totals.costInUsd).toBeCloseTo(0.0021, 9);
    expect(s.totals.costOutUsd).toBeCloseTo(0.0009, 9);
    // in + out split sums back to the total
    expect(s.totals.costInUsd + s.totals.costOutUsd).toBeCloseTo(s.totals.costUsd, 9);
    // attributed to the mark bucket
    expect(s.byMark.rabbi.calls).toBe(2);
    expect(s.byMark.rabbi.costInUsd).toBeCloseTo(0.0021, 9);
  });

  it('splits across model / mark / enrichment buckets', async () => {
    const { kv } = makeFakeKV();
    const env = { CACHE: kv };
    await record(env, [priced({ markId: 'rabbi' }), priced({ enrichmentId: 'rabbi.synthesis' })]);
    const s = await readUsageSummary(kv);
    expect(s.byModel['openrouter/deepseek/deepseek-v4-flash'].calls).toBe(2);
    expect(s.byMark.rabbi.calls).toBe(1);
    expect(s.byEnrichment['rabbi.synthesis'].calls).toBe(1);
  });

  it('counts unpriced calls without inflating cost, and tracks errors/cache hits', async () => {
    const { kv } = makeFakeKV();
    const env = { CACHE: kv };
    await record(env, [
      priced(),
      {
        ok: false,
        cacheHit: false,
        model: '@cf/moonshotai/kimi-k2.5',
        tokensIn: 10,
        tokensOut: 5,
        costUsd: null,
      },
      {
        ok: true,
        cacheHit: true,
        model: 'openrouter/deepseek/deepseek-v4-flash',
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
      },
    ]);
    const s = await readUsageSummary(kv);
    expect(s.totals.calls).toBe(3);
    expect(s.totals.pricedCalls).toBe(2); // the priced() and the zero-cost hit
    expect(s.totals.unpricedCalls).toBe(1);
    expect(s.totals.errors).toBe(1);
    expect(s.totals.cacheHits).toBe(1);
    // unpriced call contributed tokens but no dollars
    expect(s.totals.costUsd).toBeCloseTo(0.001, 9);
  });
});
