import { describe, expect, it } from 'vitest';
import { instanceIdOf, keyForEnrichment } from '../src/worker/cache-keys';
import { type InspectEntry, probeInstances } from '../src/worker/inspect';

// The centerpiece: write a per-instance enrichment to a fake KV under the REAL
// keys the warm path uses, then assert the inspector's enumeration finds them
// (cached + correct cost) — and that the OLD whole-daf single-probe does not.
// This is the guarantee that the waterfall/DAG "reflect the actual state".
describe('inspector round-trip — enumeration finds per-instance entries', () => {
  const def = { id: 'pesukim.why-here', cache_version: '2', scope: 'local' as const };
  const daf = { tractate: 'Berakhot', page: '2a' };
  // The mark's stored instances (parsed.instances) — fields carry the identity.
  const instances = [
    { startSegIdx: 7, endSegIdx: 7, fields: { verseRef: 'Deuteronomy 6:7' } },
    { startSegIdx: 9, endSegIdx: 9, fields: { verseRef: 'Deuteronomy 11:19' } },
  ];
  const realKey = async (inst: unknown) =>
    keyForEnrichment(def, await instanceIdOf(inst), daf, undefined, 'en');
  const keyFor = (iid: string) => keyForEnrichment(def, iid, daf, undefined, 'en');
  const getter = (kv: Map<string, unknown>) => async (k: string) =>
    (kv.get(k) as InspectEntry | undefined) ?? null;

  it('reports 2/2 cached with summed cost when both instances are warmed', async () => {
    const kv = new Map<string, unknown>();
    for (const inst of instances) {
      kv.set(await realKey(inst), {
        elapsed_ms: 1000,
        usage: { total_tokens: 50 },
        cost: { billedUsd: 0.001, estimatedUsd: 0.001 },
      });
    }
    const agg = await probeInstances(getter(kv), keyFor, instances);
    expect(agg.instances).toEqual({ total: 2, cached: 2 });
    expect(agg.cached).toBe(true);
    expect(agg.cost).toBeCloseTo(0.002, 6);
    expect(agg.cold_ms).toBe(2000);
    expect(agg.tokens).toBe(100);
  });

  it('the OLD {fields:{}} single-probe MISSES those same entries (regression contrast)', async () => {
    const kv = new Map<string, unknown>();
    for (const inst of instances) kv.set(await realKey(inst), { elapsed_ms: 1000 });
    const probeKey = keyForEnrichment(
      def,
      await instanceIdOf({ fields: {} }),
      daf,
      undefined,
      'en',
    );
    expect(kv.has(probeKey)).toBe(false);
  });

  it('partial warm -> cached:false, instances 1/2', async () => {
    const kv = new Map<string, unknown>();
    kv.set(await realKey(instances[0]), {
      elapsed_ms: 500,
      cost: { billedUsd: 0.001, estimatedUsd: 0.001 },
    });
    const agg = await probeInstances(getter(kv), keyFor, instances);
    expect(agg.instances).toEqual({ total: 2, cached: 1 });
    expect(agg.cached).toBe(false);
    expect(agg.cost).toBeCloseTo(0.001, 6);
  });
});
