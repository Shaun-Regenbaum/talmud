import { isExpandable } from '@corpus/core/telemetry/runtree';
import { describe, expect, it } from 'vitest';
import { chapterRuns, chapterRunTree, type RunsCache, telemetryOf } from '../src/worker/inspect';
import { inputDeps, tanachProducerDefs } from '../src/worker/producers/defs';

/** A StoredArtifact-shaped envelope (the fields telemetryOf reads). */
function envelope(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    content: '{}',
    parsed: {},
    parse_error: null,
    model: 'openrouter/deepseek/deepseek-v4-flash',
    transport: 'ai-gateway',
    attempts: 1,
    usage: { prompt_tokens: 100, completion_tokens: 50 },
    elapsed_ms: 1234,
    prompt_chars: 0,
    resolved: { system_prompt: '', user_prompt: '' },
    cache_hit: false,
    cost: { estimatedUsd: 0.0004, billedUsd: null, tokensIn: 100, tokensOut: 50 },
    ...over,
  });
}

describe('telemetryOf', () => {
  it('a miss (null) is not cached, no telemetry', () => {
    expect(telemetryOf(null)).toEqual({
      cached: false,
      model: null,
      coldMs: null,
      cost: null,
      tokens: null,
    });
  });

  it('an envelope yields model, time, cost, tokens', () => {
    expect(telemetryOf(envelope())).toEqual({
      cached: true,
      model: 'openrouter/deepseek/deepseek-v4-flash',
      coldMs: 1234,
      cost: 0.0004,
      tokens: 150,
    });
  });

  it('a legacy raw payload reads as cached-but-untimed', () => {
    const legacy = JSON.stringify({ book: 'Genesis', chapter: 1, en: 'x', he: 'y' });
    expect(telemetryOf(legacy)).toEqual({
      cached: true,
      model: null,
      coldMs: null,
      cost: null,
      tokens: null,
    });
  });

  it("the synthetic 'legacy-cache' model is normalised to null", () => {
    expect(telemetryOf(envelope({ model: 'legacy-cache' })).model).toBeNull();
  });

  it('falls back to billedUsd when no estimate', () => {
    const t = telemetryOf(
      envelope({ cost: { estimatedUsd: null, billedUsd: 0.002, tokensIn: 1, tokensOut: 2 } }),
    );
    expect(t.cost).toBe(0.002);
    expect(t.tokens).toBe(3);
  });
});

describe('chapterRuns', () => {
  function fakeCache(store: Record<string, string>): RunsCache {
    return {
      get: async (key) => store[key] ?? null,
      list: async ({ prefix }) => ({
        keys: Object.keys(store)
          .filter((k) => k.startsWith(prefix))
          .map((name) => ({ name })),
      }),
    };
  }

  it('shows every chapter piece always (cached or miss) and lists per-instance pieces', async () => {
    const store = {
      'overview:v1:Genesis:22': envelope({
        elapsed_ms: 5000,
        cost: { estimatedUsd: 0.01, billedUsd: null, tokensIn: 200, tokensOut: 100 },
      }),
      'note:v1:Genesis:22:1-19': envelope(),
      'note:v1:Genesis:22:20-24': envelope(),
      'synthesis:v1:Genesis:22:2': envelope(),
      // events / geography / tidbit intentionally absent -> miss rows
      // an unrelated chapter must not leak in:
      'overview:v1:Genesis:23': envelope(),
      'note:v1:Genesis:23:1-5': envelope(),
    };
    const res = await chapterRuns(fakeCache(store), 'Genesis', '22');

    const ids = res.runs.map((r) => `${r.id}${r.instance ? `:${r.instance}` : ''}`);
    // chapter rows first (events/geography/tidbit miss, overview present), then instances
    expect(ids).toEqual([
      'events',
      'overview',
      'geography',
      'tidbit',
      'note:1-19',
      'note:20-24',
      'synthesis:v2',
    ]);

    const events = res.runs.find((r) => r.id === 'events');
    expect(events?.cached).toBe(false);
    const overview = res.runs.find((r) => r.id === 'overview');
    expect(overview?.cached).toBe(true);
    expect(overview?.coldMs).toBe(5000);

    expect(res.totals.count).toBe(7);
    expect(res.totals.cached).toBe(4); // overview + two notes + one synthesis
    // overview 0.01 + three instance envelopes at 0.0004 each
    expect(res.totals.cost).toBeCloseTo(0.01 + 0.0004 * 3, 6);
  });

  it('every row carries a registry-DERIVED `expandable` (false: tanach pieces depend only on sources)', async () => {
    const res = await chapterRuns(fakeCache({}), 'Genesis', '22');
    expect(res.runs.length).toBeGreaterThan(0);
    expect(res.runs.every((r) => r.expandable === false)).toBe(true);
  });

  it('an instance row keeps the raw key tail (for the run-tree fetch) distinct from its display label', async () => {
    const res = await chapterRuns(
      fakeCache({ 'synthesis:v1:Genesis:22:7': envelope() }),
      'Genesis',
      '22',
    );
    const syn = res.runs.find((r) => r.id === 'synthesis' && r.instanceRaw === '7');
    expect(syn?.instance).toBe('v7'); // display
    expect(syn?.instanceRaw).toBe('7'); // addresses synthesis:v1:Genesis:22:7
  });

  it('handles a multi-word book name (space in the key) in the prefix', async () => {
    const store = {
      'overview:v1:I Samuel:3': envelope(),
      'note:v1:I Samuel:3:1-10': envelope(),
    };
    const res = await chapterRuns(fakeCache(store), 'I Samuel', '3');
    expect(res.runs.find((r) => r.id === 'note')?.instance).toBe('1-10');
    expect(res.runs.find((r) => r.id === 'overview')?.cached).toBe(true);
  });
});

describe('tanachProducerDefs — the run-tree IS derived from the registry', () => {
  it('every producer depends only on SOURCES, so isExpandable is false for all', () => {
    const defs = tanachProducerDefs();
    const producerIds = new Set(defs.map((d) => d.id));
    for (const d of defs) {
      for (const dep of d.dependencies ?? []) {
        // no dependency points at another producer — they are all source inputs
        expect(producerIds.has(dep as string)).toBe(false);
      }
      expect(isExpandable(defs, d.id)).toBe(false);
    }
  });

  it('the projection keeps PRODUCER inputs, not just sources (so producer edges survive)', () => {
    // The latent bug guard: a source-only projection would drop {producer} inputs,
    // pinning isExpandable false forever. inputDeps must surface both.
    expect(inputDeps({ inputs: [{ source: 'verse-text' }, { producer: 'overview' }] })).toEqual([
      'verse-text',
      'overview',
    ]);
  });

  it('isExpandable is COMPUTED, not hard-coded: a producer→producer dep flips it true', () => {
    // Synthesize a registry where `note` consumes `overview` (an enrichment).
    const defs = tanachProducerDefs().map((d) =>
      d.id === 'note'
        ? { ...d, dependencies: [...(d.dependencies ?? []), { enrichment: 'overview' }] }
        : d,
    );
    expect(isExpandable(defs, 'note')).toBe(true); // reaches a producer now
    expect(isExpandable(defs, 'overview')).toBe(false); // still only sources
  });
});

describe('chapterRunTree — the per-piece DAG, derived by core buildRunTree', () => {
  function fakeCache(store: Record<string, string>): RunsCache {
    return {
      get: async (key) => store[key] ?? null,
      list: async ({ prefix }) => ({
        keys: Object.keys(store)
          .filter((k) => k.startsWith(prefix))
          .map((name) => ({ name })),
      }),
    };
  }

  it('unknown producer id -> null', async () => {
    expect(await chapterRunTree(fakeCache({}), 'Genesis', '22', 'nope', null, 'en')).toBeNull();
  });

  it('translate (selection-keyed, no chapter key) -> null, not a misleading cold graph', async () => {
    expect(
      await chapterRunTree(fakeCache({}), 'Genesis', '22', 'translate', null, 'en'),
    ).toBeNull();
  });

  it("synthesis's tree is root + its registry source inputs (verse-text, commentaries)", async () => {
    const tree = await chapterRunTree(
      fakeCache({ 'synthesis:v1:Genesis:22:2': envelope() }),
      'Genesis',
      '22',
      'synthesis',
      '2',
      'en',
    );
    expect(tree?.root).toBe('synthesis');
    expect(tree?.tractate).toBe('Genesis');
    expect(tree?.page).toBe('22');
    // edges point root -> each source input declared on the producer
    const children = (tree?.edges ?? [])
      .filter(([from]) => from === 'synthesis')
      .map(([, to]) => to);
    expect(children.sort()).toEqual(['commentaries', 'verse-text']);
    // the sources are leaf nodes typed as sources, the root as llm
    expect(tree?.nodes['verse-text'].kind).toBe('source');
    expect(tree?.nodes.commentaries.kind).toBe('source');
    expect(tree?.nodes.synthesis.kind).toBe('llm');
  });

  it('the root node carries the cached envelope telemetry (cached, model, cost, authority)', async () => {
    const tree = await chapterRunTree(
      fakeCache({
        'overview:v1:Genesis:22': envelope({ elapsed_ms: 4321, transport: 'openrouter-gateway' }),
      }),
      'Genesis',
      '22',
      'overview',
      null,
      'en',
    );
    const root = tree?.nodes.overview;
    expect(root?.cached).toBe(true);
    expect(root?.cold_ms).toBe(4321);
    expect(root?.model).toBe('openrouter/deepseek/deepseek-v4-flash');
    expect(root?.cost).toBe(0.0004);
    expect(root?.authority).toBe('ai'); // openrouter-gateway transport -> ai
  });

  it('a cold piece reports the root not cached, sources still available', async () => {
    const tree = await chapterRunTree(fakeCache({}), 'Genesis', '22', 'overview', null, 'en');
    expect(tree?.nodes.overview.cached).toBe(false);
    expect(tree?.nodes['chapter-verses'].cached).toBe(true); // sources are fetched/assembled
  });
});
