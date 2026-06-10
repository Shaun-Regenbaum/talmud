import { describe, expect, it, vi } from 'vitest';
import { instanceIdOf, keyForEnrichment, keyForGemara, keyForMark } from '../src/worker/cache-keys';
import { CODE_ENRICHMENTS, CODE_MARKS } from '../src/worker/code-marks';
import type { Bindings, JobMessage } from '../src/worker/types';

// PROVENANCE STAMPING (stage 4b): every FRESH cache write now carries a
// `provenance` build manifest APPENDED after the legacy envelope fields —
// authority (llm transports → 'ai', computed/graph/lookup → 'rule'), the
// producer id, the SAME recipe_hash already stamped at top level, one
// InputRef per resolved dep/anchor key (content-fingerprinted), and the
// model/transport/usage/cost passthrough. These tests drive a real fresh run
// through the worker's queue consumer (the same path /api/run jobs take) with
// runLLM mocked, then assert (a) the legacy fields are exactly what the old
// bodies wrote — names, order, values — and (b) provenance mirrors them.
// envelope-roundtrip.test.ts separately locks that legacy entries WITHOUT
// provenance still serve unchanged.

vi.mock('@corpus/core/llm/llm', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@corpus/core/llm/llm')>();
  return {
    ...mod,
    runLLM: vi.fn(async () => ({
      content: '{"place":"Pumbedita","basis":"named in the sugya"}',
      reasoning_content: '',
      finish_reason: 'stop',
      usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
      prompt_chars: 555,
      elapsed_ms: 7,
      model: 'openrouter/deepseek/deepseek-chat',
      transport: 'openrouter-gateway',
      attempts: 1,
    })),
  };
});

import { provenanceInputRefs } from '@corpus/core/run/run-producer';
import worker from '../src/worker/index';

// --- harness (same Map-backed KV stub as run-contract.test.ts) -------------

function makeFakeKV(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
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
  return { kv: kv as unknown as KVNamespace, store };
}

function makeEnv(seed: Record<string, string> = {}) {
  const { kv, store } = makeFakeKV(seed);
  const env = { CACHE: kv } as unknown as Bindings;
  return { env, store };
}

function makeCtx(): ExecutionContext {
  return {
    waitUntil: (_p: Promise<unknown>) => {},
    passThroughOnException: () => {},
  } as unknown as ExecutionContext;
}

/** Drive one job through the queue consumer (the real fresh-run path). */
async function runJob(env: Bindings, body: Partial<JobMessage>): Promise<void> {
  const msg = {
    id: 'm1',
    timestamp: new Date(),
    attempts: 1,
    body: { runId: 'prov-test', tractate: 'Berakhot', page: '5a', ...body } as JobMessage,
    ack: () => {},
    retry: () => {},
  };
  await worker.queue(
    { queue: 'enrichment-jobs', messages: [msg] } as unknown as MessageBatch<JobMessage>,
    env,
    makeCtx(),
  );
}

const GEMARA_SLICE = {
  tractate: 'Berakhot',
  page: '5a',
  hebrew: 'טקסט עברי',
  english: 'English text',
  segments_he: ['קטע א', 'קטע ב'],
  segments_en: ['segment one', 'segment two'],
};

function storedResult(overrides: Record<string, unknown>): string {
  return JSON.stringify({
    content: 'raw content',
    parsed: null,
    parse_error: null,
    model: 'seeded',
    transport: 'seeded',
    attempts: 1,
    usage: null,
    elapsed_ms: 0,
    prompt_chars: 0,
    resolved: { system_prompt: '', user_prompt: '' },
    cache_hit: false,
    ...overrides,
  });
}

const rabbiLocation = CODE_ENRICHMENTS.find((e) => e.id === 'rabbi.location');
if (!rabbiLocation) throw new Error('expected rabbi.location in CODE_ENRICHMENTS');
const rabbiGeography = CODE_ENRICHMENTS.find((e) => e.id === 'rabbi.geography');
if (!rabbiGeography) throw new Error('expected rabbi.geography in CODE_ENRICHMENTS');
const rabbiMark = CODE_MARKS.find((m) => m.id === 'rabbi');
if (!rabbiMark) throw new Error('expected the rabbi mark in CODE_MARKS');
const dafBackgroundMark = CODE_MARKS.find((m) => m.id === 'daf-background');
if (!dafBackgroundMark) throw new Error('expected the daf-background mark in CODE_MARKS');
if (dafBackgroundMark.extractor.kind !== 'computed') {
  throw new Error('expected daf-background to be a computed mark');
}

const MARK_INPUT = { fields: { name: 'Abaye' } };

describe('provenance stamping on fresh cache writes', () => {
  it('an LLM enrichment write keeps the legacy envelope byte-shape and appends a matching provenance manifest', async () => {
    const iid = await instanceIdOf(MARK_INPUT);
    const geoKey = keyForEnrichment(
      rabbiGeography,
      iid,
      rabbiGeography.scope === 'local' ? { tractate: 'Berakhot', page: '5a' } : undefined,
    );
    const rabbiInstances = [{ excerpt: 'אביי', fields: { name: 'Abaye', nameHe: 'אביי' } }];
    const { env, store } = makeEnv({
      [keyForGemara('Berakhot', '5a')]: JSON.stringify(GEMARA_SLICE),
      [geoKey]: storedResult({ parsed: { region: 'bavel' } }),
      [keyForMark(rabbiMark, 'Berakhot', '5a', 'en')]: storedResult({
        parsed: { instances: rabbiInstances },
      }),
    });

    await runJob(env, {
      enrichment_id: 'rabbi.location',
      mark_input: MARK_INPUT,
    });

    const locKey = keyForEnrichment(rabbiLocation, iid, { tractate: 'Berakhot', page: '5a' });
    const raw = store.get(locKey);
    expect(raw).toBeTruthy();
    const stored = JSON.parse(raw as string);

    // (a) legacy fields — exactly the names (and order: JSON.parse preserves
    // insertion order) the old runEnrichmentOnce wrote, nothing dropped or
    // renamed; `provenance` is appended LAST.
    expect(Object.keys(stored)).toEqual([
      'content',
      'parsed',
      'parse_error',
      'model',
      'transport',
      'attempts',
      'usage',
      'elapsed_ms',
      'prompt_chars',
      'resolved',
      'cache_hit',
      'recipe_hash',
      'cost',
      'deps_resolved',
      'anchors_resolved',
      'provenance',
    ]);
    expect(stored.content).toBe('{"place":"Pumbedita","basis":"named in the sugya"}');
    expect(stored.model).toBe('openrouter/deepseek/deepseek-chat');
    expect(stored.transport).toBe('openrouter-gateway');
    expect(stored.recipe_hash).toMatch(/^[0-9a-f]{12}$/);
    expect(stored.deps_resolved).toEqual({ 'rabbi.geography': { region: 'bavel' } });
    expect(stored.anchors_resolved).toEqual({ rabbi: rabbiInstances });

    // (b) the provenance manifest mirrors the legacy fields — never a second
    // hash, never a divergent cost — and classifies the gateway transport 'ai'.
    const prov = stored.provenance;
    expect(prov.authority).toBe('ai');
    expect(prov.producerId).toBe('rabbi.location');
    expect(prov.recipeHash).toBe(stored.recipe_hash);
    expect(prov.model).toBe(stored.model);
    expect(prov.transport).toBe(stored.transport);
    expect(prov.usage).toEqual(stored.usage);
    expect(prov.cost).toEqual(stored.cost);
    expect(Number.isNaN(Date.parse(prov.createdAt))).toBe(false);

    // (c) inputs enumerate the resolved dep keys (depends first, then anchors,
    // id-sorted), each with a stable content fingerprint.
    expect(prov.inputs.map((r: { sourceKey: string }) => r.sourceKey)).toEqual([
      'rabbi.geography',
      'rabbi',
    ]);
    for (const r of prov.inputs as { contentHash: string }[]) {
      expect(r.contentHash).toMatch(/^[0-9a-f]{12}$/);
    }
    expect(prov.inputs).toEqual(
      await provenanceInputRefs({
        depends: stored.deps_resolved,
        anchors: stored.anchors_resolved,
      }),
    );
  });

  it('a computed (no-LLM) mark write is stamped authority "rule" with no recipeHash and no inputs', async () => {
    const { env, store } = makeEnv();
    await runJob(env, { mark_id: 'daf-background' });

    const key = keyForMark(dafBackgroundMark, 'Berakhot', '5a', 'en');
    const raw = store.get(key);
    expect(raw).toBeTruthy();
    const stored = JSON.parse(raw as string);

    // Legacy computed-mark envelope unchanged, provenance appended last.
    expect(Object.keys(stored)).toEqual([
      'content',
      'parsed',
      'parse_error',
      'model',
      'transport',
      'attempts',
      'usage',
      'elapsed_ms',
      'prompt_chars',
      'resolved',
      'cache_hit',
      'provenance',
    ]);
    expect(stored.model).toBe('computed:whole-daf-instance');
    expect(stored.transport).toBe('computed');
    expect(stored.parsed).toEqual({ instances: [{ fields: {} }] });

    const prov = stored.provenance;
    expect(prov.authority).toBe('rule');
    expect(prov.producerId).toBe('daf-background');
    expect(prov.recipeHash).toBeUndefined(); // marks never stamped recipe_hash
    expect(prov.inputs).toEqual([]); // computed branch resolves no deps
    expect(prov.transport).toBe('computed');
  });
});
