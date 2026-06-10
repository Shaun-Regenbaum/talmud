import { describe, expect, it } from 'vitest';
import { type CostStamp, type LegacyRunFields, provenanceOf } from '../src/model/provenance.ts';

const cost: CostStamp = {
  billedUsd: 0.0012,
  estimatedUsd: 0.0015,
  costInUsd: 0.0005,
  costOutUsd: 0.001,
  tokensIn: 1200,
  tokensOut: 400,
  lang: 'en',
  cacheVersion: '4',
  computedAt: 1750000000000,
};

describe('provenanceOf', () => {
  it('a modern openrouter entry: ai authority, recipeHash + cost + inputs', () => {
    const stored: LegacyRunFields = {
      model: 'openrouter/deepseek/deepseek-v4-flash',
      transport: 'openrouter-gateway',
      recipe_hash: 'abc123def456',
      usage: { prompt_tokens: 1200, completion_tokens: 400 },
      cost,
      deps_resolved: { 'argument.background': '...', gemara: '...' },
      anchors_resolved: { rabbi: [] },
    };
    const p = provenanceOf(stored, 'argument.synthesis');
    expect(p).toEqual({
      authority: 'ai',
      producerId: 'argument.synthesis',
      recipeHash: 'abc123def456',
      inputs: [
        { sourceKey: 'argument.background' },
        { sourceKey: 'gemara' },
        { sourceKey: 'rabbi' },
      ],
      model: 'openrouter/deepseek/deepseek-v4-flash',
      transport: 'openrouter-gateway',
      usage: { prompt_tokens: 1200, completion_tokens: 400 },
      cost,
      createdAt: new Date(cost.computedAt).toISOString(),
    });
  });

  it('workers-ai transport is ai authority', () => {
    const p = provenanceOf({ model: '@cf/some/model', transport: 'workers-ai' }, 'rabbi');
    expect(p.authority).toBe('ai');
  });

  it.each(['computed', 'graph', 'lookup'])('%s transport is rule authority', (transport) => {
    const p = provenanceOf({ model: transport, transport }, 'rabbi.observations');
    expect(p.authority).toBe('rule');
    expect(p.model).toBe(transport);
  });

  it('an old vintage (no recipe_hash, no cost, no deps) degrades gracefully', () => {
    const p = provenanceOf(
      { model: 'openrouter/deepseek/deepseek-v3', transport: 'openrouter-gateway' },
      'argument',
    );
    expect(p.recipeHash).toBeUndefined();
    expect(p.cost).toBeUndefined();
    expect(p.inputs).toEqual([]);
    expect(p.createdAt).toBe('');
  });

  it('null cost (explicitly unpriced) keeps createdAt empty and passes cost through', () => {
    const p = provenanceOf({ model: 'x', transport: 'openrouter-gateway', cost: null }, 'argument');
    expect(p.cost).toBeNull();
    expect(p.createdAt).toBe('');
  });
});
