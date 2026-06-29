import { costSplitUsd, costUsd, normalizeUsage } from '@corpus/core/llm/pricing';
import { describe, expect, it } from 'vitest';

// deepseek-v4-flash is list-priced in MODEL_PRESETS (input 0.14, output 0.28
// per 1M tokens). These tests pin the input-vs-output dollar split that the
// cost ledger + per-entry cost stamp rely on to answer "where did the money go".
const FLASH = 'openrouter/deepseek/deepseek-v4-flash';

describe('costSplitUsd', () => {
  it('splits a priced call into input-side and output-side dollars', () => {
    const { costInUsd, costOutUsd } = costSplitUsd(FLASH, {
      prompt_tokens: 1_000_000,
      completion_tokens: 1_000_000,
    });
    expect(costInUsd).toBeCloseTo(0.14, 6);
    expect(costOutUsd).toBeCloseTo(0.28, 6);
  });

  it('the split sums to the total list-price estimate', () => {
    const usage = { prompt_tokens: 250_000, completion_tokens: 80_000 };
    const { costInUsd, costOutUsd } = costSplitUsd(FLASH, usage);
    const total = costUsd(FLASH, usage);
    expect(total).not.toBeNull();
    expect((costInUsd ?? 0) + (costOutUsd ?? 0)).toBeCloseTo(total as number, 9);
  });

  it('splits a priced Workers AI (@cf) model — @cf spend is no longer invisible', () => {
    // kimi-k2.5 = $0.60 / $3.00 per 1M; recorded in MODEL_PRESETS so /usage + the
    // budget guard see Workers AI spend instead of $0.
    const { costInUsd, costOutUsd } = costSplitUsd('@cf/moonshotai/kimi-k2.5', {
      prompt_tokens: 1000,
      completion_tokens: 1000,
    });
    expect(costInUsd).toBeCloseTo(0.0006, 9);
    expect(costOutUsd).toBeCloseTo(0.003, 9);
  });

  it('returns null for both sides on a model with no list price', () => {
    expect(
      costSplitUsd('@cf/meta/llama-3.1-8b-instruct-fp8', {
        prompt_tokens: 1000,
        completion_tokens: 1000,
      }),
    ).toEqual({ costInUsd: null, costOutUsd: null });
  });

  it('handles the input_tokens/output_tokens shape too (deterministic short-circuits)', () => {
    const { costInUsd, costOutUsd } = costSplitUsd(FLASH, {
      input_tokens: 1_000_000,
      output_tokens: 0,
    });
    expect(costInUsd).toBeCloseTo(0.14, 6);
    expect(costOutUsd).toBe(0);
  });

  it('zero usage costs zero on a priced model (not null)', () => {
    expect(costSplitUsd(FLASH, { prompt_tokens: 0, completion_tokens: 0 })).toEqual({
      costInUsd: 0,
      costOutUsd: 0,
    });
  });
});

describe('normalizeUsage (shape tolerance)', () => {
  it('reads OpenAI-shaped usage', () => {
    expect(normalizeUsage({ prompt_tokens: 5, completion_tokens: 7 })).toEqual({
      input: 5,
      output: 7,
    });
  });
  it('reads input_tokens/output_tokens-shaped usage', () => {
    expect(normalizeUsage({ input_tokens: 5, output_tokens: 7 })).toEqual({ input: 5, output: 7 });
  });
  it('treats absent usage as zero', () => {
    expect(normalizeUsage(null)).toEqual({ input: 0, output: 0 });
  });
});
