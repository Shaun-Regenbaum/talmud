import { describe, expect, it } from 'vitest';
import { type DafIndexEntryMeta, dafRunsFromIndex, type ProducerSpec } from '../src/worker/inspect';

// The index-backed daf-runs path must produce the SAME rows the enumerate-and-
// probe path does, so the two are interchangeable behind the completion
// sentinel. These pin that mapping: per-instance aggregation, the cached/total
// fraction, summed cost, and the staleness verdict from the stamped recipe hash.
const spec = (o: Partial<ProducerSpec> & { id: string }): ProducerSpec => ({
  label: o.id,
  kind: 'llm',
  producer: 'enrichment',
  experimental: false,
  perInstance: false,
  ...o,
});

describe('dafRunsFromIndex — per-instance aggregation', () => {
  it('sums cost/tokens/cold and reports cached/total; fully cached -> cached:true', () => {
    const metas: DafIndexEntryMeta[] = [
      { p: 'pesukim.why-here', i: 'a', c: 0.001, t: 10, ms: 100 },
      { p: 'pesukim.why-here', i: 'b', c: 0.002, t: 20, ms: 200 },
      { p: 'pesukim.why-here', i: 'c', c: 0.003, t: 30, ms: 300 },
    ];
    const [row] = dafRunsFromIndex(metas, [
      spec({ id: 'pesukim.why-here', perInstance: true, instancesTotal: 3 }),
    ]);
    expect(row).toMatchObject({
      cached: true,
      instances: { total: 3, cached: 3 },
      cost: 0.006,
      tokens: 60,
      cold_ms: 600,
      staleness: null,
    });
  });
  it('partial warm -> cached:false, instances cached < total', () => {
    const metas: DafIndexEntryMeta[] = [{ p: 'pesukim.why-here', i: 'a', c: 0.001 }];
    const [row] = dafRunsFromIndex(metas, [
      spec({ id: 'pesukim.why-here', perInstance: true, instancesTotal: 3 }),
    ]);
    expect(row.cached).toBe(false);
    expect(row.instances).toEqual({ total: 3, cached: 1 });
  });
  it('a producer with no index entries reads as a miss', () => {
    const [row] = dafRunsFromIndex(
      [],
      [spec({ id: 'rabbi.location', perInstance: true, instancesTotal: 2 })],
    );
    expect(row).toMatchObject({ cached: false, cost: null, instances: { total: 2, cached: 0 } });
  });
});

describe('dafRunsFromIndex — whole-daf / mark + staleness', () => {
  it('whole-daf enrichment: recipe match -> fresh, mismatch -> stale-recipe', () => {
    const metas: DafIndexEntryMeta[] = [{ p: 'biyun.essay', m: 'deepseek', c: 0.02, rh: 'abc' }];
    const fresh = dafRunsFromIndex(metas, [
      spec({ id: 'biyun.essay', currentRecipe: 'abc', model: 'deepseek' }),
    ])[0];
    expect(fresh).toMatchObject({ cached: true, cost: 0.02, staleness: 'fresh' });
    const stale = dafRunsFromIndex(metas, [spec({ id: 'biyun.essay', currentRecipe: 'xyz' })])[0];
    expect(stale.staleness).toBe('stale-recipe');
  });
  it('mark: cached -> staleness unknown (marks never stamp a recipe)', () => {
    const metas: DafIndexEntryMeta[] = [{ p: 'rabbi', m: 'computed', ms: 0 }];
    const [row] = dafRunsFromIndex(metas, [
      spec({ id: 'rabbi', producer: 'mark', kind: 'computed' }),
    ]);
    expect(row).toMatchObject({ cached: true, staleness: 'unknown', producer: 'mark' });
  });
});
