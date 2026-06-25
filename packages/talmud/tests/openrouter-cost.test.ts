import { describe, expect, it } from 'vitest';
import { aggregateActivity, type OrActivityRow } from '../src/worker/openrouter-cost';

// Rows shaped like the real GET /api/v1/activity response (one row per
// day+model+endpoint), trimmed to the fields aggregateActivity reads.
const ROWS: OrActivityRow[] = [
  {
    date: '2026-06-24 00:00:00',
    model_permaslug: 'deepseek/deepseek-v4-pro-20260423',
    usage: 20,
    requests: 100,
    prompt_tokens: 1_000_000,
    completion_tokens: 50_000,
  },
  {
    date: '2026-06-24 00:00:00',
    model_permaslug: 'deepseek/deepseek-v4-flash-20260423',
    usage: 5,
    requests: 400,
    prompt_tokens: 4_000_000,
    completion_tokens: 100_000,
  },
  {
    date: '2026-06-23 00:00:00',
    model_permaslug: 'deepseek/deepseek-v4-pro-20260423',
    usage: 10,
    requests: 60,
    prompt_tokens: 500_000,
    completion_tokens: 30_000,
  },
];

describe('aggregateActivity', () => {
  it('sums billed usage and requests across all rows', () => {
    const agg = aggregateActivity(ROWS);
    expect(agg.costUsd).toBeCloseTo(35, 6);
    expect(agg.requests).toBe(560);
  });

  it('groups by model (dated permaslug) and sorts by cost desc', () => {
    const agg = aggregateActivity(ROWS);
    expect(agg.byModel.map((m) => m.model)).toEqual([
      'deepseek/deepseek-v4-pro-20260423',
      'deepseek/deepseek-v4-flash-20260423',
    ]);
    const pro = agg.byModel[0];
    expect(pro.costUsd).toBeCloseTo(30, 6); // 20 + 10 across two days
    expect(pro.requests).toBe(160);
    expect(pro.tokensIn).toBe(1_500_000);
    expect(pro.tokensOut).toBe(80_000);
  });

  it('rolls per-day totals and reports the window', () => {
    const agg = aggregateActivity(ROWS);
    expect(agg.days).toBe(2);
    expect(agg.windowStart).toBe('2026-06-23');
    expect(agg.windowEnd).toBe('2026-06-24');
    const day24 = agg.byDay.find((d) => d.date === '2026-06-24');
    expect(day24?.costUsd).toBeCloseTo(25, 6); // 20 + 5
  });

  it('falls back to model when permaslug is absent and tolerates missing fields', () => {
    const agg = aggregateActivity([
      { date: '2026-06-24', model: 'openai/gpt-5.5', usage: 1.5, requests: 2 },
      { date: '2026-06-24' }, // empty row contributes nothing
    ]);
    expect(agg.costUsd).toBeCloseTo(1.5, 6);
    expect(agg.byModel[0].model).toBe('openai/gpt-5.5');
  });

  it('is empty-safe', () => {
    const agg = aggregateActivity([]);
    expect(agg.costUsd).toBe(0);
    expect(agg.requests).toBe(0);
    expect(agg.byModel).toEqual([]);
    expect(agg.byDay).toEqual([]);
    expect(agg.days).toBe(0);
  });
});
