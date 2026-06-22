import { describe, expect, it } from 'vitest';
import type { UsageEntry } from '../src/telemetry/types.ts';
import { addUsageEntry, aggregateUsage, emptyUsage } from '../src/telemetry/usage.ts';

const entry = (over: Partial<UsageEntry>): UsageEntry => ({
  ts: 1,
  ref: 'Genesis 1',
  producer: 'overview',
  model: 'deepseek',
  tokensIn: 100,
  tokensOut: 20,
  costUsd: 0.001,
  costInUsd: 0.0007,
  costOutUsd: 0.0003,
  ...over,
});

describe('aggregateUsage — DERIVED from the entry log, nothing hard-coded', () => {
  it('rolls totals + per-producer / per-model / per-ref + the in/out cost split', () => {
    const s = aggregateUsage([
      entry({ producer: 'overview', model: 'deepseek', ref: 'Genesis 1', costUsd: 0.001 }),
      entry({ producer: 'tidbit', model: 'deepseek', ref: 'Genesis 1', costUsd: 0.002 }),
      entry({ producer: 'overview', model: 'gpt', ref: 'Genesis 2', costUsd: 0.004 }),
    ]);
    expect(s.totals.calls).toBe(3);
    expect(s.totals.tokensIn).toBe(300);
    expect(s.totals.tokensOut).toBe(60);
    expect(s.totals.costUsd).toBeCloseTo(0.007, 6);
    // content-in / content-out split is summed too
    expect(s.totals.costInUsd).toBeCloseTo(0.0021, 6);
    expect(s.totals.costOutUsd).toBeCloseTo(0.0009, 6);
    // breakdowns are derived from the entries' fields
    expect(s.byProducer.overview.calls).toBe(2);
    expect(s.byProducer.overview.costUsd).toBeCloseTo(0.005, 6);
    expect(s.byProducer.tidbit.calls).toBe(1);
    expect(s.byModel.deepseek.calls).toBe(2);
    expect(s.byModel.gpt.calls).toBe(1);
    // the per-ref (per-chapter) dimension tanach lacked
    expect(s.byRef['Genesis 1'].calls).toBe(2);
    expect(s.byRef['Genesis 2'].calls).toBe(1);
  });

  it('changes when the input changes (not memoised / hard-coded)', () => {
    const a = aggregateUsage([entry({ costUsd: 0.001 })]);
    const b = aggregateUsage([
      entry({ costUsd: 0.001 }),
      entry({ producer: 'tidbit', costUsd: 0.5 }),
    ]);
    expect(b.totals.costUsd).toBeGreaterThan(a.totals.costUsd);
    expect(Object.keys(b.byProducer).sort()).toEqual(['overview', 'tidbit']);
  });

  it('incremental addUsageEntry equals the batch aggregate', () => {
    const entries = [entry({ producer: 'a' }), entry({ producer: 'b' }), entry({ producer: 'a' })];
    const batch = aggregateUsage(entries);
    const incremental = entries.reduce((s, e) => addUsageEntry(s, e), emptyUsage());
    expect(incremental).toEqual(batch);
  });

  it('tolerates missing cost / split fields (cold or pre-split entries)', () => {
    const s = aggregateUsage([
      entry({ costUsd: null, costInUsd: undefined, costOutUsd: undefined }),
    ]);
    expect(s.totals.costUsd).toBe(0);
    expect(s.totals.costInUsd).toBe(0);
    expect(s.totals.calls).toBe(1);
  });

  it('empty log → zeroed summary with empty buckets', () => {
    const s = aggregateUsage([]);
    expect(s.totals.calls).toBe(0);
    expect(s.byProducer).toEqual({});
    expect(s.byRef).toEqual({});
  });
});
