import { describe, expect, it } from 'vitest';
import { instanceIdOf, keyForEnrichment } from '../src/worker/cache-keys';
import { CODE_ENRICHMENTS } from '../src/worker/code-marks';
import worker from '../src/worker/index';
import type { Bindings } from '../src/worker/types';

// daf-view is the reader's one-shot read: what it lists as `cold` is what the
// reader regenerates. A cached whole-daf enrichment whose parsed output lost
// its shape (the model drifted to its own keys — Chullin 140a's
// argument-overview.synthesis stored {wholeDafOverview}) must count as COLD, so
// the reader re-runs it and the fresh write overwrites the junk. This slipped
// through once because code-defined enrichments keep their schema under
// extractor.output_schema, not at the top level.

function makeEnv(seed: Record<string, string>) {
  const store = new Map(Object.entries(seed));
  const kv = {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => {
      store.set(k, v);
    },
    delete: async (k: string) => {
      store.delete(k);
    },
    list: async () => ({ keys: [], list_complete: true, cursor: '' }),
    getWithMetadata: async () => ({ value: null, metadata: null }),
  };
  return { CACHE: kv as unknown as KVNamespace } as unknown as Bindings;
}

const ENVELOPE = {
  parse_error: null,
  model: 'openrouter/test/model',
  transport: 'openrouter-gateway',
  attempts: 1,
  usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  elapsed_ms: 1,
  prompt_chars: 1,
  resolved: { system_prompt: 'sys', user_prompt: 'usr' },
  cache_hit: false,
};

async function view(env: Bindings) {
  const res = await worker.fetch(new Request('http://x/api/daf-view/Berakhot/5a'), env, {
    waitUntil: () => {},
    passThroughOnException: () => {},
  } as unknown as ExecutionContext);
  return (await res.json()) as { cold: string[]; pieces: Record<string, unknown> };
}

describe('daf-view treats a junk-shaped whole-daf enrichment as cold', () => {
  const overview = CODE_ENRICHMENTS.find((e) => e.id === 'argument-overview.synthesis');
  if (!overview) throw new Error('expected argument-overview.synthesis');

  it('the drifted shape seen on Chullin 140a is cold and not served', async () => {
    const iid = await instanceIdOf({ fields: {} });
    const key = keyForEnrichment(overview, iid, { tractate: 'Berakhot', page: '5a' });
    const junk = {
      ...ENVELOPE,
      content: '{"tractate":"Chullin","daf":"140a","wholeDafOverview":{}}',
      parsed: { tractate: 'Chullin', daf: '140a', wholeDafOverview: {} },
    };
    const v = await view(makeEnv({ [key]: JSON.stringify(junk) }));
    expect(v.cold).toContain('argument-overview.synthesis');
    expect(v.pieces['argument-overview.synthesis']).toBeUndefined();
  });

  it('the real shape is served and not cold', async () => {
    const iid = await instanceIdOf({ fields: {} });
    const key = keyForEnrichment(overview, iid, { tractate: 'Berakhot', page: '5a' });
    const good = { ...ENVELOPE, content: '{"synthesis":"x"}', parsed: { synthesis: 'x' } };
    const v = await view(makeEnv({ [key]: JSON.stringify(good) }));
    expect(v.cold).not.toContain('argument-overview.synthesis');
    expect(v.pieces['argument-overview.synthesis']).toBeTruthy();
  });
});
