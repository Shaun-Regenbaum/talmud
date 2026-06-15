import { describe, expect, it } from 'vitest';
import { aggregateProbes, inspectorCostOf } from '../src/worker/inspect';

// The inspector used to read cost from `usage.cost` — OpenRouter's raw figure,
// which is null on Workers-AI / unpriced models even on a cache hit, so cached
// rows showed "$0". The canonical figure is the stamped CostStamp ledger (the
// same one daf-cost.ts / the budget guard / /usage report). inspectorCostOf
// reads that, falling back to usage.cost only for pre-stamp / OR-only entries.
describe('inspectorCostOf — canonical CostStamp, not usage.cost', () => {
  it('prefers the stamped ledger (billed wins, then estimate)', () => {
    expect(inspectorCostOf({ cost: { billedUsd: 0.5, estimatedUsd: 0.7 } })).toBe(0.5);
    expect(inspectorCostOf({ cost: { billedUsd: null, estimatedUsd: 0.7 } })).toBe(0.7);
  });
  it('falls back to raw usage.cost only when there is no stamp', () => {
    expect(inspectorCostOf({ usage: { cost: 0.3 } })).toBe(0.3);
    expect(inspectorCostOf({ cost: null, usage: { cost: 0.25 } })).toBe(0.25);
  });
  it('is null when neither is present (the cached-but-$0 bug surface)', () => {
    expect(inspectorCostOf({ usage: { total_tokens: 100 } })).toBeNull();
    expect(inspectorCostOf(null)).toBeNull();
    expect(inspectorCostOf(undefined)).toBeNull();
  });
});

describe('aggregateProbes — per-instance row reduction', () => {
  it('sums cost/cold/tokens, reports the fraction, cached only when ALL present', () => {
    const agg = aggregateProbes([
      { cached: true, cost: 0.001, cold_ms: 100, tokens: 10 },
      { cached: true, cost: 0.002, cold_ms: 200, tokens: 20 },
      { cached: false, cost: null, cold_ms: null, tokens: null },
    ]);
    expect(agg.instances).toEqual({ total: 3, cached: 2 });
    expect(agg.cached).toBe(false); // 2/3 — partial, not a green "hit"
    expect(agg.cost).toBeCloseTo(0.003, 6);
    expect(agg.cold_ms).toBe(300);
    expect(agg.tokens).toBe(30);
  });
  it('fully cached -> cached:true; empty -> cached:false with null sums', () => {
    expect(aggregateProbes([{ cached: true, cost: 0.001, cold_ms: 5, tokens: 1 }]).cached).toBe(
      true,
    );
    expect(aggregateProbes([])).toMatchObject({
      cached: false,
      cost: null,
      cold_ms: null,
      tokens: null,
      instances: { total: 0, cached: 0 },
    });
  });
});
