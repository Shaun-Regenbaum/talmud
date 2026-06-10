import { describe, expect, it, vi } from 'vitest';
import { instanceIdOf, keyForEnrichment, keyForMark } from '../src/worker/cache-keys';
import { CODE_ENRICHMENTS, CODE_MARKS } from '../src/worker/code-marks';
import worker from '../src/worker/index';
import type { Bindings, JobMessage } from '../src/worker/types';

// CHARACTERIZATION: stored-envelope compatibility. The KV cache holds
// RunResult JSON written across many code versions (some entries predate
// recipe_hash, cost, deps_resolved, section_range). The /api/run cache-hit
// path must serve every vintage byte-identically — spread + {cache_hit:true,
// total_ms:0}, no field dropped, renamed, or coerced. These fixtures freeze
// that contract ahead of the refactor.

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
  const send = vi.fn(async (_msg: JobMessage) => {});
  const env = {
    CACHE: kv,
    ENRICHMENT_QUEUE: { send } as unknown as Queue<JobMessage>,
  } as unknown as Bindings;
  return { env, store, send };
}

function makeCtx(): ExecutionContext {
  return {
    waitUntil: (_p: Promise<unknown>) => {},
    passThroughOnException: () => {},
  } as unknown as ExecutionContext;
}

async function postRun(env: Bindings, body: unknown): Promise<{ status: number; json: unknown }> {
  const res = await worker.fetch(
    new Request('https://test.local/api/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env,
    makeCtx(),
  );
  return { status: res.status, json: await res.json() };
}

const argumentMark = CODE_MARKS.find((m) => m.id === 'argument');
if (!argumentMark) throw new Error('expected the argument mark in CODE_MARKS');
const ARG_MARK_KEY = keyForMark(argumentMark, 'Berakhot', '5a', 'en');

const rabbiBio = CODE_ENRICHMENTS.find((e) => e.id === 'rabbi.bio');
if (!rabbiBio) throw new Error('expected rabbi.bio in CODE_ENRICHMENTS');

const argSynthesis = CODE_ENRICHMENTS.find((e) => e.id === 'argument.synthesis');
if (!argSynthesis) throw new Error('expected argument.synthesis in CODE_ENRICHMENTS');

// (a) Minimal legacy envelope — predates recipe_hash / cost / lint fields.
const LEGACY_RESULT = {
  content: '{"instances":[]}',
  parsed: { instances: [] },
  parse_error: null,
  model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  transport: 'workers-ai',
  attempts: 2,
  usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18 },
  elapsed_ms: 999,
  prompt_chars: 222,
  resolved: { system_prompt: 'legacy sys', user_prompt: 'legacy usr' },
  cache_hit: false,
};

// (b) Modern envelope with recipe_hash + a full CostStamp.
const MODERN_RESULT = {
  ...LEGACY_RESULT,
  content: '{"bio":"a bio"}',
  parsed: { bio: 'a bio' },
  model: 'openrouter/deepseek/deepseek-chat',
  transport: 'openrouter-gateway',
  recipe_hash: 'abc123def456',
  cost: {
    billedUsd: 0.0042,
    estimatedUsd: 0.005,
    costInUsd: 0.003,
    costOutUsd: 0.002,
    tokensIn: 1500,
    tokensOut: 600,
    lang: 'en',
    cacheVersion: rabbiBio.cache_version,
    computedAt: 1750000000000,
  },
};

// (c) RunResultEnrichment with the enrichment-only fields.
const SECTION_RESULT = {
  ...LEGACY_RESULT,
  content: '{"synthesis":"..."}',
  parsed: { synthesis: '...' },
  recipe_hash: 'fedcba654321',
  deps_resolved: { 'argument.voices': { voices: [] } },
  anchors_resolved: { rabbi: [{ fields: { name: 'Abaye' } }] },
  section_range: '2-5',
};

const SECTION_INPUT = { startSegIdx: 2, endSegIdx: 5, fields: { title: 'Opening Mishnah' } };

describe('stored RunResult envelope round-trip via /api/run', () => {
  it('(a) minimal legacy envelope: every field passes through, none added beyond cache_hit/total_ms', async () => {
    const { env } = makeEnv({ [ARG_MARK_KEY]: JSON.stringify(LEGACY_RESULT) });
    const { status, json } = await postRun(env, {
      mark_id: 'argument',
      tractate: 'Berakhot',
      page: '5a',
    });
    expect(status).toBe(200);
    expect(json).toEqual({
      status: 'ok',
      result: { ...LEGACY_RESULT, cache_hit: true, total_ms: 0 },
    });
  });

  it('(b) recipe_hash + cost stamp survive the round-trip untouched', async () => {
    const iid = await instanceIdOf({ fields: { name: 'Abaye' } });
    const key = keyForEnrichment(
      rabbiBio,
      iid,
      rabbiBio.scope === 'local' ? { tractate: 'Berakhot', page: '5a' } : undefined,
    );
    const { env } = makeEnv({ [key]: JSON.stringify(MODERN_RESULT) });
    const { status, json } = await postRun(env, {
      enrichment_id: 'rabbi.bio',
      tractate: 'Berakhot',
      page: '5a',
      mark_input: { fields: { name: 'Abaye' } },
    });
    expect(status).toBe(200);
    expect(json).toEqual({
      status: 'ok',
      result: { ...MODERN_RESULT, cache_hit: true, total_ms: 0 },
    });
  });

  it('(c) enrichment envelope (deps_resolved/anchors_resolved/section_range) served when the range matches', async () => {
    const iid = await instanceIdOf(SECTION_INPUT);
    expect(iid).toBe('opening_mishnah'); // title-derived — the volatility the guard exists for
    const key = keyForEnrichment(argSynthesis, iid, { tractate: 'Berakhot', page: '5a' });
    const { env, send } = makeEnv({ [key]: JSON.stringify(SECTION_RESULT) });
    const { status, json } = await postRun(env, {
      enrichment_id: 'argument.synthesis',
      tractate: 'Berakhot',
      page: '5a',
      mark_input: SECTION_INPUT,
    });
    expect(status).toBe(200);
    expect(json).toEqual({
      status: 'ok',
      result: { ...SECTION_RESULT, cache_hit: true, total_ms: 0 },
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('section_range MISMATCH: the hot path refuses the hit and falls through to 202 pending', async () => {
    const iid = await instanceIdOf(SECTION_INPUT);
    const key = keyForEnrichment(argSynthesis, iid, { tractate: 'Berakhot', page: '5a' });
    // Same title-derived key, but the stored entry was computed for a
    // DIFFERENT segment range (a re-extraction moved the title).
    const stale = { ...SECTION_RESULT, section_range: '0-1' };
    const { env, send } = makeEnv({ [key]: JSON.stringify(stale) });
    const { status, json } = await postRun(env, {
      enrichment_id: 'argument.synthesis',
      tractate: 'Berakhot',
      page: '5a',
      mark_input: SECTION_INPUT, // requests 2-5
    });
    expect(status).toBe(202);
    expect((json as { status: string }).status).toBe('pending');
    expect(send).toHaveBeenCalledTimes(1); // recompute enqueued instead of serving stale
  });

  it('legacy section entry with NO section_range stamp is also refused (recomputes)', async () => {
    // NOTE: characterizes current behavior — entries written before the stamp
    // existed never match `hit.section_range === sectionRange`, so they are
    // permanently bypassed (and re-paid once) rather than served.
    const iid = await instanceIdOf(SECTION_INPUT);
    const key = keyForEnrichment(argSynthesis, iid, { tractate: 'Berakhot', page: '5a' });
    const { section_range: _drop, ...unstamped } = SECTION_RESULT;
    const { env, send } = makeEnv({ [key]: JSON.stringify(unstamped) });
    const { status } = await postRun(env, {
      enrichment_id: 'argument.synthesis',
      tractate: 'Berakhot',
      page: '5a',
      mark_input: SECTION_INPUT,
    });
    expect(status).toBe(202);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('a NON-section enrichment is served without any range guard (mark_input range irrelevant)', async () => {
    // rabbi.bio targets the rabbi mark (not `argument`), so sectionRangeOf is
    // null and the hot path serves even though the entry carries no stamp and
    // the request carries a segment range.
    const input = { startSegIdx: 9, endSegIdx: 12, fields: { name: 'Rava' } };
    const iid = await instanceIdOf(input);
    const key = keyForEnrichment(
      rabbiBio,
      iid,
      rabbiBio.scope === 'local' ? { tractate: 'Berakhot', page: '5a' } : undefined,
    );
    const { env, send } = makeEnv({ [key]: JSON.stringify(MODERN_RESULT) });
    const { status, json } = await postRun(env, {
      enrichment_id: 'rabbi.bio',
      tractate: 'Berakhot',
      page: '5a',
      mark_input: input,
    });
    expect(status).toBe(200);
    expect((json as { result: { cache_hit: boolean } }).result.cache_hit).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });
});
