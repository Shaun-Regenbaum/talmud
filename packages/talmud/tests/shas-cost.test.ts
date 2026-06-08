import { describe, it, expect } from 'vitest';
import { estimateShasCost, workersAiGrossUp, type ShasCostInput } from '../src/lib/shasCost';

// A once-per-amud producer (`argument`) and a per-section fan-out producer
// (`argument-move.commentaries`) over a tiny 100-amud "shas".
function baseInput(overrides: Partial<ShasCostInput> = {}): ShasCostInput {
  return {
    amudim: 100,
    byMark: {
      // $0.01/call, fully covered (100 of 100 amudim).
      argument: { costUsd: 1, pricedCalls: 100 },
    },
    byEnrichment: {
      // $0.005/call, fans out ~1.5x per amud (150 entries), full coverage.
      'argument-move.commentaries': { costUsd: 0.75, pricedCalls: 150 },
    },
    marks: [{ id: 'argument', count: 100 }],
    enrichments: [{ id: 'argument-move.commentaries', count: 150 }],
    ...overrides,
  };
}

describe('estimateShasCost', () => {
  it('treats a once-per-amud mark as instancesPerAmud = 1', () => {
    const est = estimateShasCost(baseInput());
    const arg = est.byProducer.find((p) => p.id === 'argument')!;
    expect(arg.instancesPerAmud).toBe(1);
    expect(arg.unitUsd).toBeCloseTo(0.01);
    expect(arg.fullShasUsd).toBeCloseTo(1); // 0.01 * 1 * 100
    expect(arg.incurredUsd).toBeCloseTo(1); // fully covered -> nothing remaining
    expect(arg.remainingUsd).toBeCloseTo(0);
  });

  it('recovers fan-out multiplicity from coverage > amudim', () => {
    const est = estimateShasCost(baseInput());
    const com = est.byProducer.find((p) => p.id === 'argument-move.commentaries')!;
    expect(com.instancesPerAmud).toBeCloseTo(1.5); // 150 / 100
    expect(com.unitUsd).toBeCloseTo(0.005);
    expect(com.fullShasUsd).toBeCloseTo(0.75); // 0.005 * 1.5 * 100
  });

  it('counts the lightly-warmed long tail at full price, not ~$0', () => {
    // A producer warmed on only 2 of 100 amudim still owes a full pass.
    const input = baseInput({
      byEnrichment: { 'biyun.essay': { costUsd: 0.06, pricedCalls: 2 } }, // $0.03/call
      enrichments: [{ id: 'biyun.essay', count: 2 }],
    });
    const est = estimateShasCost(input);
    const biyun = est.byProducer.find((p) => p.id === 'biyun.essay')!;
    expect(biyun.instancesPerAmud).toBe(1); // 2/100 -> clamped up
    expect(biyun.fullShasUsd).toBeCloseTo(3); // 0.03 * 1 * 100
    expect(biyun.incurredUsd).toBeCloseTo(0.06);
    expect(biyun.remainingUsd).toBeCloseTo(2.94); // almost all of it is still owed
  });

  it('still owes a partially-warmed fan-out producer (no $0-remaining bug)', () => {
    // Fan-out producer warmed on only 60 of 100 amudim. With count (60) below
    // the frontier (100, set by the fully-covered `argument` mark) it must NOT
    // collapse to fullShasUsd === incurredUsd -> remaining must be positive.
    const input = baseInput({
      byEnrichment: { 'argument-move.commentaries': { costUsd: 0.3, pricedCalls: 60 } }, // $0.005/call
      enrichments: [{ id: 'argument-move.commentaries', count: 60 }],
    });
    const est = estimateShasCost(input);
    const com = est.byProducer.find((p) => p.id === 'argument-move.commentaries')!;
    expect(com.fullShasUsd).toBeGreaterThan(com.incurredUsd);
    expect(com.remainingUsd).toBeGreaterThan(0);
    expect(com.fullShasUsd).toBeCloseTo(0.5); // 0.005 * 1 * 100 (multiplicity floored to 1 while under-warmed)
  });

  it('uses target_mark coverage to complete a proven fan-out', () => {
    // 100-amud corpus, argument-move mark warmed on 50 amudim; its per-move
    // enrichment has 150 entries -> provably fan-out (150 > frontier 100),
    // multiplicity 150/50 = 3, so a full pass is 3 * 100 = 300 calls and it is
    // only half done.
    const input = baseInput({
      byEnrichment: { 'argument-move.commentaries': { costUsd: 1.5, pricedCalls: 150 } }, // $0.01/call
      marks: [{ id: 'argument', count: 100 }, { id: 'argument-move', count: 50 }],
      enrichments: [{ id: 'argument-move.commentaries', count: 150, target_mark: 'argument-move' }],
    });
    const com = estimateShasCost(input).byProducer.find((p) => p.id === 'argument-move.commentaries')!;
    expect(com.instancesPerAmud).toBeCloseTo(3); // 150 / min(50, frontier 100)
    expect(com.fullShasUsd).toBeCloseTo(3); // 0.01 * 3 * 100
    expect(com.incurredUsd).toBeCloseTo(1.5); // 0.01 * 150
    expect(com.remainingUsd).toBeCloseTo(1.5); // half warmed -> half remaining
  });

  it('ignores a sparse target_mark when count is within the frontier (no blowup)', () => {
    // The argument-overview.flow pathology: warmed broadly (80 of 100) but its
    // nominal target mark is barely warmed (5). Since count <= frontier it must
    // read as once-per-amud, NOT 80/5 = 16x.
    const input = baseInput({
      byEnrichment: { 'argument-overview.flow': { costUsd: 0.8, pricedCalls: 80 } }, // $0.01/call
      marks: [{ id: 'argument', count: 100 }, { id: 'argument-overview', count: 5 }],
      enrichments: [{ id: 'argument-overview.flow', count: 80, target_mark: 'argument-overview' }],
    });
    const flow = estimateShasCost(input).byProducer.find((p) => p.id === 'argument-overview.flow')!;
    expect(flow.instancesPerAmud).toBe(1);
    expect(flow.fullShasUsd).toBeCloseTo(1); // 0.01 * 1 * 100
    expect(flow.remainingUsd).toBeCloseTo(0.2); // 20 of 100 amudim still owed
  });

  it('keeps mark and enrichment coverage separate even if ids collide', () => {
    const input = baseInput({
      byMark: { foo: { costUsd: 1, pricedCalls: 100 } },
      byEnrichment: { foo: { costUsd: 1, pricedCalls: 100 } },
      marks: [{ id: 'foo', count: 100 }],
      enrichments: [{ id: 'foo', count: 250 }], // would clobber the mark if keyed by id alone
    });
    const est = estimateShasCost(input);
    const mark = est.byProducer.find((p) => p.kind === 'mark' && p.id === 'foo')!;
    const enr = est.byProducer.find((p) => p.kind === 'enrichment' && p.id === 'foo')!;
    expect(mark.coverageCount).toBe(100);
    expect(enr.coverageCount).toBe(250);
  });

  it('skips producers with no priced calls (e.g. Workers-AI)', () => {
    const input = baseInput({
      byMark: {
        argument: { costUsd: 1, pricedCalls: 100 },
        places: { costUsd: 0, pricedCalls: 0 }, // unpriced -> excluded from rows
      },
      marks: [{ id: 'argument', count: 100 }, { id: 'places', count: 100 }],
    });
    const est = estimateShasCost(input);
    expect(est.byProducer.some((p) => p.id === 'places')).toBe(false);
  });

  it('sorts producers by full-shas cost descending and sums to priced totals', () => {
    const est = estimateShasCost(baseInput());
    const costs = est.byProducer.map((p) => p.fullShasUsd);
    expect(costs).toEqual([...costs].sort((a, b) => b - a));
    const sum = est.byProducer.reduce((s, p) => s + p.fullShasUsd, 0);
    expect(est.priced.fullShasUsd).toBeCloseTo(sum);
    expect(est.priced.fullShasUsd).toBeCloseTo(1.75); // 1 + 0.75
  });

  it('applies the Workers-AI gross-up and derives per-amud cost', () => {
    const est = estimateShasCost(
      baseInput({
        gatewayByModel: [
          { provider: 'openrouter', costUsd: 80 },
          { provider: 'workers-ai', costUsd: 20 }, // 20% unpriced -> gross-up 100/80 = 1.25
        ],
      }),
    );
    expect(est.workersAiGrossUp).toBeCloseTo(1.25);
    expect(est.grossed.fullShasUsd).toBeCloseTo(1.75 * 1.25);
    expect(est.grossed.perAmudUsd).toBeCloseTo((1.75 * 1.25) / 100);
  });

  it('marks the estimate unavailable when there is no coverage total', () => {
    expect(estimateShasCost(baseInput({ amudim: 0 })).available).toBe(false);
  });
});

describe('workersAiGrossUp', () => {
  it('is 1 when there is no gateway data or no Workers-AI spend', () => {
    expect(workersAiGrossUp(undefined)).toBe(1);
    expect(workersAiGrossUp([{ provider: 'openrouter', costUsd: 50 }])).toBe(1);
  });

  it('is total / priced when Workers-AI has spend', () => {
    expect(
      workersAiGrossUp([
        { provider: 'openrouter', costUsd: 300 },
        { provider: 'workers-ai', costUsd: 68 },
      ]),
    ).toBeCloseTo(368 / 300);
  });
});
