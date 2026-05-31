import { describe, it, expect } from 'vitest';
import { recipeHash } from '../src/worker/cache-keys';

// A producer's "recipe" is what determines its output: the extractor
// (prompt/schema/model) + render for marks. recipeHash captures exactly that so
// content-hash freshness can replace manual cache_version bumps. These lock the
// field-set contract: generation inputs move the hash; everything else doesn't.

const baseMark = () => ({
  id: 'rabbi',
  label: 'Rabbis',
  extractor: {
    kind: 'llm' as const,
    system_prompt: 'Identify rabbi names.',
    user_prompt_template: 'Daf: {{gemara}}',
    output_schema: { type: 'object', properties: { names: { type: 'array' } } },
    model: 'openrouter/x',
  },
  render: { kind: 'inline', style: 'underline' },
  dependencies: ['gemara'],
  checks: ['no-empty'],
  cache_version: '2',
  def_hash: 'rabbi-v2',
  status: 'promoted',
  source: 'code',
  updated_at: '2026-01-01',
});

describe('recipeHash — content hash of a producer recipe', () => {
  it('is deterministic for the same def', async () => {
    expect(await recipeHash(baseMark())).toBe(await recipeHash(baseMark()));
  });

  it('is insensitive to field ORDER within the extractor/render', async () => {
    const a = baseMark();
    const b = baseMark();
    // Re-author the extractor with keys in a different order.
    b.extractor = {
      model: 'openrouter/x',
      output_schema: { properties: { names: { type: 'array' } }, type: 'object' },
      user_prompt_template: 'Daf: {{gemara}}',
      system_prompt: 'Identify rabbi names.',
      kind: 'llm',
    };
    expect(await recipeHash(b)).toBe(await recipeHash(a));
  });

  it('MOVES when the prompt changes', async () => {
    const m = baseMark();
    m.extractor.system_prompt = 'Identify EVERY rabbi name.';
    expect(await recipeHash(m)).not.toBe(await recipeHash(baseMark()));
  });

  it('MOVES when the output schema changes', async () => {
    const m = baseMark();
    m.extractor.output_schema = { type: 'object', properties: { names: { type: 'array' }, count: { type: 'number' } } };
    expect(await recipeHash(m)).not.toBe(await recipeHash(baseMark()));
  });

  it('MOVES when the model changes', async () => {
    const m = baseMark();
    m.extractor.model = 'openrouter/y';
    expect(await recipeHash(m)).not.toBe(await recipeHash(baseMark()));
  });

  it('MOVES when a mark render config changes', async () => {
    const m = baseMark();
    m.render = { kind: 'inline', style: 'highlight' };
    expect(await recipeHash(m)).not.toBe(await recipeHash(baseMark()));
  });

  it('does NOT move for checks / dependencies / version / bookkeeping changes', async () => {
    const base = await recipeHash(baseMark());
    const checks = baseMark(); checks.checks = ['no-empty', 'in-range'];
    const deps = baseMark(); deps.dependencies = ['gemara', 'commentaries'];
    const ver = baseMark(); ver.cache_version = '9'; ver.def_hash = 'rabbi-v9'; ver.updated_at = '2030-01-01';
    expect(await recipeHash(checks)).toBe(base);
    expect(await recipeHash(deps)).toBe(base);
    expect(await recipeHash(ver)).toBe(base);
  });

  it('an enrichment (no render) hashes its extractor alone, and render absence != render present', async () => {
    const enrich = { id: 'rabbi.bio', extractor: { kind: 'llm', system_prompt: 'Write a bio.' } };
    expect(await recipeHash(enrich)).toBe(await recipeHash({ ...enrich }));
    // Adding a render field to the same extractor must change the hash (marks vs enrichments differ).
    expect(await recipeHash({ ...enrich, render: { kind: 'chip' } })).not.toBe(await recipeHash(enrich));
  });
});
