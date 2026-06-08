import { describe, it, expect } from 'vitest';
import { dafMarkCost, dafCostReport, bestStampUsd, type MarkRowLite } from '../src/worker/daf-cost';
import { keyForMark } from '../src/worker/cache-keys';

// Build a mark cache key the same way the worker does, so the fake KV is seeded
// at the exact keys dafMarkCost reconstructs.
function markKey(id: string, version: string, tractate: string, page: string, lang: 'en' | 'he' = 'en'): string {
  return keyForMark({ id, cache_version: version } as never, tractate, page, lang);
}

function makeKV(entries: Record<string, unknown>) {
  const store = new Map<string, string>(Object.entries(entries).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => { store.set(k, v); },
    delete: async (k: string) => { store.delete(k); },
    list: async () => ({ keys: [], list_complete: true, cursor: '' }),
    getWithMetadata: async () => ({ value: null, metadata: null }),
  } as unknown as KVNamespace;
}

const stamp = (over: Record<string, unknown> = {}) => ({
  cost: {
    billedUsd: 0.01, estimatedUsd: 0.012, costInUsd: 0.004, costOutUsd: 0.006,
    tokensIn: 1000, tokensOut: 500, lang: 'en', cacheVersion: '5', computedAt: 1,
    ...over,
  },
});

describe('bestStampUsd', () => {
  it('prefers billed, falls back to estimate, then zero', () => {
    expect(bestStampUsd({ billedUsd: 0.01, estimatedUsd: 0.99 })).toBe(0.01);
    expect(bestStampUsd({ billedUsd: null, estimatedUsd: 0.02 })).toBe(0.02);
    expect(bestStampUsd({ billedUsd: null, estimatedUsd: null })).toBe(0);
    expect(bestStampUsd(null)).toBe(0);
  });
});

describe('dafMarkCost', () => {
  it('splits current-version from superseded-version entries for one daf', async () => {
    const T = 'Berakhot', P = '5a';
    const kv = makeKV({
      [markKey('rabbi', '5', T, P)]: stamp({ billedUsd: 0.02 }),           // current EN
      [markKey('rabbi', '5', T, P, 'he')]: stamp({ billedUsd: 0.03 }),     // current HE
      [markKey('rabbi', '4', T, P)]: stamp({ billedUsd: 0.01 }),           // superseded
      // a different daf must NOT leak in
      [markKey('rabbi', '5', T, '7b')]: stamp({ billedUsd: 0.99 }),
    });
    const mark: MarkRowLite = { id: 'rabbi', label: 'Rabbi', cache_version: '5', versions: { '5': 1, '5:he': 1, '4': 1 } };
    const r = await dafMarkCost(kv, mark, T, P);
    expect(r.current.map((c) => c.version).sort()).toEqual(['5', '5:he']);
    expect(r.superseded.map((c) => c.version)).toEqual(['4']);
    expect(r.totalUsd).toBeCloseTo(0.06, 9); // 0.02 + 0.03 + 0.01, not the other daf
  });

  it('ignores versions with no cached entry and entries with no stamp', async () => {
    const T = 'Berakhot', P = '5a';
    const kv = makeKV({
      [markKey('argument', '3', T, P)]: { content: '{}' }, // entry exists but no cost stamp (legacy)
    });
    const mark: MarkRowLite = { id: 'argument', label: 'Argument', cache_version: '3', versions: { '3': 1, '2': 1 } };
    const r = await dafMarkCost(kv, mark, T, P);
    expect(r.current).toEqual([]);
    expect(r.superseded).toEqual([]);
    expect(r.totalUsd).toBe(0);
  });
});

describe('dafCostReport', () => {
  it('aggregates current vs superseded totals across marks, sorted by spend', async () => {
    const T = 'Berakhot', P = '5a';
    const kv = makeKV({
      [markKey('rabbi', '5', T, P)]: stamp({ billedUsd: 0.02 }),
      [markKey('rabbi', '4', T, P)]: stamp({ billedUsd: 0.01 }),
      [markKey('argument', '2', T, P)]: stamp({ billedUsd: 0.10 }),
    });
    const marks: MarkRowLite[] = [
      { id: 'rabbi', label: 'Rabbi', cache_version: '5', versions: { '5': 1, '4': 1 } },
      { id: 'argument', label: 'Argument', cache_version: '2', versions: { '2': 1 } },
      { id: 'places', label: 'Places', cache_version: '1', versions: { '1': 1 } }, // no daf entry -> dropped
    ];
    const rep = await dafCostReport(kv, marks, T, P);
    expect(rep.marks.map((m) => m.id)).toEqual(['argument', 'rabbi']); // sorted by totalUsd desc
    expect(rep.totals.currentUsd).toBeCloseTo(0.12, 9); // 0.02 (rabbi v5) + 0.10 (argument v2)
    expect(rep.totals.supersededUsd).toBeCloseTo(0.01, 9); // rabbi v4
    expect(rep.totals.totalUsd).toBeCloseTo(0.13, 9);
  });
});
