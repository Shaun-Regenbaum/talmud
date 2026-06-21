import { describe, expect, it } from 'vitest';
import { chapterRuns, type RunsCache, telemetryOf } from '../src/worker/inspect';

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

  it('shows the two chapter pieces always (cached or miss) and lists per-instance pieces', async () => {
    const store = {
      'overview:v1:Genesis:22': envelope({
        elapsed_ms: 5000,
        cost: { estimatedUsd: 0.01, billedUsd: null, tokensIn: 200, tokensOut: 100 },
      }),
      'note:v1:Genesis:22:1-19': envelope(),
      'note:v1:Genesis:22:20-24': envelope(),
      'synthesis:v1:Genesis:22:2': envelope(),
      // events is intentionally absent -> a miss row
      // an unrelated chapter must not leak in:
      'overview:v1:Genesis:23': envelope(),
      'note:v1:Genesis:23:1-5': envelope(),
    };
    const res = await chapterRuns(fakeCache(store), 'Genesis', '22');

    const ids = res.runs.map((r) => `${r.id}${r.instance ? `:${r.instance}` : ''}`);
    // two chapter rows first (events missing, overview present), then the instances
    expect(ids).toEqual(['events', 'overview', 'note:1-19', 'note:20-24', 'synthesis:v2']);

    const events = res.runs.find((r) => r.id === 'events');
    expect(events?.cached).toBe(false);
    const overview = res.runs.find((r) => r.id === 'overview');
    expect(overview?.cached).toBe(true);
    expect(overview?.coldMs).toBe(5000);

    expect(res.totals.count).toBe(5);
    expect(res.totals.cached).toBe(4); // all but the missing events
    // overview 0.01 + three instance envelopes at 0.0004 each
    expect(res.totals.cost).toBeCloseTo(0.01 + 0.0004 * 3, 6);
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
