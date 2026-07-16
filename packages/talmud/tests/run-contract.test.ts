import { describe, expect, it, vi } from 'vitest';
import { instanceIdOf, keyForEnrichment, keyForMark } from '../src/worker/cache-keys';
import { CODE_ENRICHMENTS, CODE_MARKS } from '../src/worker/code-marks';
import worker from '../src/worker/index';
import type { Bindings, JobMessage } from '../src/worker/types';

// CHARACTERIZATION: the /api/run + /api/run-status JSON contract, driven
// through the real worker fetch handler with a Map-backed KV stub and a
// spy queue. These lock the response shapes (status codes + bodies) the
// client poller depends on, ahead of the refactor. Volatile fields
// (timestamps embedded in runId / retryAfter) are normalized before
// snapshotting; everything else is byte-exact.

// --- harness -----------------------------------------------------------

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
  // Only the bindings the /api/run + /api/run-status paths touch. ASSETS etc.
  // are never dereferenced on these routes.
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

async function getRunStatus(
  env: Bindings,
  runId: string,
  cacheKey?: string,
): Promise<{ status: number; json: unknown }> {
  const url = `https://test.local/api/run-status/${runId}${
    cacheKey ? `?k=${encodeURIComponent(cacheKey)}` : ''
  }`;
  const res = await worker.fetch(new Request(url), env, makeCtx());
  return { status: res.status, json: await res.json() };
}

/** makeRunId embeds a unix-seconds timestamp as the last `:`-segment;
 *  normalize it so snapshots are deterministic. */
function normalizeRunId(runId: string): string {
  return runId.replace(/:\d{8,}$/, ':TS');
}

// A representative stored RunResult envelope (the shape writeCachedResult
// persists). Field names are part of the contract.
const STORED_MARK_RESULT = {
  content: '{"instances":[]}',
  parsed: { instances: [] },
  parse_error: null,
  model: 'openrouter/test/model',
  transport: 'openrouter-gateway',
  attempts: 1,
  usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
  elapsed_ms: 1234,
  prompt_chars: 4321,
  resolved: { system_prompt: 'sys', user_prompt: 'usr' },
  cache_hit: false,
};

const argumentMark = CODE_MARKS.find((m) => m.id === 'argument');
if (!argumentMark) throw new Error('expected the argument mark in CODE_MARKS');
const ARG_MARK_KEY = keyForMark(argumentMark, 'Berakhot', '5a', 'en');

describe('POST /api/run — contract', () => {
  it('a. cache hit: serves the stored envelope byte-identically + {cache_hit, total_ms}', async () => {
    const { env, send } = makeEnv({ [ARG_MARK_KEY]: JSON.stringify(STORED_MARK_RESULT) });
    const { status, json } = await postRun(env, {
      mark_id: 'argument',
      tractate: 'Berakhot',
      page: '5a',
    });
    expect(status).toBe(200);
    // Every stored field passes through unchanged; only cache_hit + total_ms
    // are injected on the hot path.
    expect(json).toEqual({
      status: 'ok',
      result: { ...STORED_MARK_RESULT, cache_hit: true, total_ms: 0 },
    });
    expect(send).not.toHaveBeenCalled();
    expect(json).toMatchSnapshot();
  });

  it('b. cold miss: 202 pending + runId + cacheKey, one queue send', async () => {
    const { env, send } = makeEnv();
    const { status, json } = await postRun(env, {
      mark_id: 'argument',
      tractate: 'Berakhot',
      page: '5a',
    });
    expect(status).toBe(202);
    const body = json as { status: string; runId: string; cacheKey?: string };
    expect(body.status).toBe('pending');
    expect(body.cacheKey).toBe(ARG_MARK_KEY);
    // runId shape: id:tractate:page:instanceHash:noq:lang:cached:unixSeconds
    // (sanitized to [a-zA-Z0-9._:-]).
    expect(body.runId).toMatch(/^argument:Berakhot:5a:[0-9a-f]{12}:noq:en:cached:\d+$/);
    expect(send).toHaveBeenCalledTimes(1);
    const sent = send.mock.calls[0][0];
    expect(sent.runId).toBe(body.runId);
    expect({ ...body, runId: normalizeRunId(body.runId) }).toMatchSnapshot();
    expect({ ...sent, runId: normalizeRunId(sent.runId) }).toMatchSnapshot('queued JobMessage');
  });

  it('c. SWR: previous-version hit serves stale:true + refreshing:true and enqueues', async () => {
    const rabbiBio = CODE_ENRICHMENTS.find((e) => e.id === 'rabbi.bio');
    if (!rabbiBio) throw new Error('expected rabbi.bio in CODE_ENRICHMENTS');
    expect(Number(rabbiBio.cache_version)).toBeGreaterThan(1); // SWR needs a decrementable version
    const markInput = { fields: { name: 'Abaye' } };
    const iid = await instanceIdOf(markInput);
    const currentKey = keyForEnrichment(
      rabbiBio,
      iid,
      rabbiBio.scope === 'local' ? { tractate: 'Berakhot', page: '5a' } : undefined,
    );
    const prevKey = currentKey.replace(
      `:rabbi.bio:${rabbiBio.cache_version}:`,
      `:rabbi.bio:${Number(rabbiBio.cache_version) - 1}:`,
    );
    const staleResult = { ...STORED_MARK_RESULT, content: 'stale bio', parsed: { bio: 'old' } };
    const { env, send } = makeEnv({ [prevKey]: JSON.stringify(staleResult) });
    const { status, json } = await postRun(env, {
      enrichment_id: 'rabbi.bio',
      tractate: 'Berakhot',
      page: '5a',
      mark_input: markInput,
    });
    expect(status).toBe(200);
    expect(json).toEqual({
      status: 'ok',
      result: { ...staleResult, cache_hit: true, total_ms: 0, stale: true, refreshing: true },
    });
    expect(send).toHaveBeenCalledTimes(1); // the background recompute
    // Pin the queued recompute job too: it must target the SAME producer +
    // daf + instance the request named (a malformed refresh job would warm
    // the wrong key while the response still claimed refreshing:true).
    const queued = send.mock.calls[0][0];
    // The instance segment is the instanceIdOf slug ('abaye' — named instance),
    // not a hash; the cold-miss test covers the hash fallback.
    expect(queued.runId).toMatch(/^rabbi\.bio:Berakhot:5a:abaye:noq:en:cached:\d+$/);
    expect({ ...queued, runId: normalizeRunId(queued.runId) }).toMatchSnapshot(
      'queued SWR recompute JobMessage',
    );
  });

  it('c2. SWR with budget paused: serves stale but refreshing:false, no enqueue', async () => {
    const rabbiBio = CODE_ENRICHMENTS.find((e) => e.id === 'rabbi.bio');
    if (!rabbiBio) throw new Error('expected rabbi.bio in CODE_ENRICHMENTS');
    const iid = await instanceIdOf({ fields: { name: 'Abaye' } });
    const currentKey = keyForEnrichment(rabbiBio, iid);
    const prevKey = currentKey.replace(
      `:rabbi.bio:${rabbiBio.cache_version}:`,
      `:rabbi.bio:${Number(rabbiBio.cache_version) - 1}:`,
    );
    const pause = { until: Date.now() + 3_600_000, reason: 'test pause', spentUsd: 300 };
    const { env, send } = makeEnv({
      [prevKey]: JSON.stringify(STORED_MARK_RESULT),
      'budget:v1:pause:all': JSON.stringify(pause),
    });
    const { status, json } = await postRun(env, {
      enrichment_id: 'rabbi.bio',
      tractate: 'Berakhot',
      page: '5a',
      mark_input: { fields: { name: 'Abaye' } },
    });
    expect(status).toBe(200);
    expect(json).toEqual({
      status: 'ok',
      result: {
        ...STORED_MARK_RESULT,
        cache_hit: true,
        total_ms: 0,
        stale: true,
        refreshing: false,
      },
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('d. experimental gate: cold miss on the chart mark (untrusted) is skipped, not enqueued', async () => {
    const { env, send } = makeEnv();
    const { status, json } = await postRun(env, {
      mark_id: 'chart',
      tractate: 'Berakhot',
      page: '5a',
    });
    expect(status).toBe(200);
    expect(json).toEqual({
      status: 'skipped',
      reason: 'experimental',
      experimental: true,
      warmed: false,
    });
    expect(send).not.toHaveBeenCalled();
    expect(json).toMatchSnapshot();
  });

  it('e. budget paused: 429 with paused/scope/retryAfter, nothing enqueued', async () => {
    const pause = { until: Date.now() + 3_600_000, reason: 'daily spend test', spentUsd: 300 };
    const { env, send } = makeEnv({ 'budget:v1:pause:all': JSON.stringify(pause) });
    const { status, json } = await postRun(env, {
      mark_id: 'argument',
      tractate: 'Berakhot',
      page: '5a',
    });
    expect(status).toBe(429);
    const body = json as { retryAfter: number } & Record<string, unknown>;
    // retryAfter is derived from the latch's `until` at response time.
    expect(body.retryAfter).toBeGreaterThan(3590);
    expect(body.retryAfter).toBeLessThanOrEqual(3600);
    expect(send).not.toHaveBeenCalled();
    expect({ ...body, retryAfter: 'NORMALIZED' }).toMatchSnapshot();
  });

  it('rejects a body without tractate/page or without any producer id', async () => {
    const { env } = makeEnv();
    const noDaf = await postRun(env, { mark_id: 'argument' });
    expect(noDaf.status).toBe(400);
    expect(noDaf.json).toEqual({ error: 'tractate and page required' });
    const noId = await postRun(env, { tractate: 'Berakhot', page: '5a' });
    expect(noId.status).toBe(400);
    expect(noId.json).toEqual({ error: 'mark_id, enrichment_id, or ad_hoc required' });
  });

  it('rejects the privileged knobs without studio auth (ad_hoc / model_override)', async () => {
    const { env } = makeEnv();
    const adHoc = await postRun(env, {
      tractate: 'Berakhot',
      page: '5a',
      ad_hoc: { system_prompt: 'x' },
    });
    expect(adHoc.status).toBe(403);
    expect(adHoc.json).toEqual({ error: 'ad_hoc runs require studio auth' });
    const override = await postRun(env, {
      mark_id: 'argument',
      tractate: 'Berakhot',
      page: '5a',
      model_override: 'openrouter/x/y',
    });
    expect(override.status).toBe(403);
    expect(override.json).toEqual({ error: 'model_override requires studio auth' });
  });
});

// The whole-daf cache-key collapse, exercised through the route wiring. The
// collapse LOGIC is pinned by whole-daf-enrichment.test.ts; both real leaks
// (#426, #534) regressed through plumbing that bypassed correct logic, so these
// drive the /api/run handler itself: a whole-daf enrichment must key on the
// canonical {fields:{}} instance for its hot-path check, its runId, its
// polling cacheKey, and the enqueued job — no matter what mark_input arrives.
// Route-side failure is cheap but user-visible (every bare run misses the hot
// path, takes a queue round-trip, and polls a ?k= key that is never written —
// the stuck-load-bar symptom, invisible to the KV leak sentinel); consumer-side
// failure re-bills the identical piece per caller (~20x/daf).
describe('POST /api/run — whole-daf collapse (leak regression)', () => {
  const flowDef = CODE_ENRICHMENTS.find((e) => e.id === 'argument-overview.flow');
  if (!flowDef) throw new Error('expected argument-overview.flow in CODE_ENRICHMENTS');
  // Pinned byte-for-byte (with whole-daf-enrichment.test.ts): the canonical
  // whole-daf instance hash and the instanceIdOf(undefined) hash a bare body
  // would leak under — the exact fingerprint of the 41-key residue incident.
  const CANON = 'f35cd02cd97b';
  const NULL_HASH = '74234e98afe7';
  const FLOW_KEY = keyForEnrichment(flowDef, CANON, { tractate: 'Berakhot', page: '5a' });

  it('bare body (no mark_input): enqueues {fields:{}} and returns the canonical cacheKey', async () => {
    const { env, send } = makeEnv();
    const { status, json } = await postRun(env, {
      enrichment_id: 'argument-overview.flow',
      tractate: 'Berakhot',
      page: '5a',
    });
    expect(status).toBe(202);
    const body = json as { status: string; runId: string; cacheKey?: string };
    expect(body.cacheKey).toBe(FLOW_KEY);
    expect(body.cacheKey).not.toContain(NULL_HASH);
    // The runId's instance segment must be the canonical hash too — run-status
    // polling and the postmortem ring buffer parse it.
    expect(body.runId).toMatch(
      /^argument-overview\.flow:Berakhot:5a:f35cd02cd97b:noq:en:cached:\d+$/,
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].mark_input).toEqual({ fields: {} });
  });

  it('bare body against a warmed canonical key: hot-path hit, nothing enqueued', async () => {
    // THE #535 regression: before the route collapse, this exact request keyed
    // on instanceIdOf(undefined), missed the warmed entry, and enqueued anyway.
    const stored = { ...STORED_MARK_RESULT, parsed: { connections: [] } };
    const { env, send } = makeEnv({ [FLOW_KEY]: JSON.stringify(stored) });
    const { status, json } = await postRun(env, {
      enrichment_id: 'argument-overview.flow',
      tractate: 'Berakhot',
      page: '5a',
    });
    expect(status).toBe(200);
    expect(json).toEqual({
      status: 'ok',
      result: { ...stored, cache_hit: true, total_ms: 0 },
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('a caller-derived section mark_input is collapsed, not fanned out (#426/#534 class)', async () => {
    const { env, send } = makeEnv();
    const { status, json } = await postRun(env, {
      enrichment_id: 'argument-overview.flow',
      tractate: 'Berakhot',
      page: '5a',
      mark_input: { startSegIdx: 2, endSegIdx: 5, fields: { title: 'Some section title' } },
    });
    expect(status).toBe(202);
    expect((json as { cacheKey?: string }).cacheKey).toBe(FLOW_KEY);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].mark_input).toEqual({ fields: {} });
  });

  it('control: a per-section enrichment keeps its mark_input verbatim', async () => {
    const sectionInput = { startSegIdx: 2, endSegIdx: 5, fields: { title: 'Some section title' } };
    const { env, send } = makeEnv();
    const { status } = await postRun(env, {
      enrichment_id: 'argument.synthesis',
      tractate: 'Berakhot',
      page: '5a',
      mark_input: sectionInput,
    });
    expect(status).toBe(202);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].mark_input).toEqual(sectionInput);
  });
});

describe('GET /api/run-status/:runId — contract', () => {
  it('serves the job record verbatim when job:{runId} exists', async () => {
    const record = { status: 'ok', result: { kind: 'mark', content: 'x', total_ms: 42 } };
    const { env } = makeEnv({ 'job:my-run-1': JSON.stringify(record) });
    const { status, json } = await getRunStatus(env, 'my-run-1');
    expect(status).toBe(200);
    expect(json).toEqual(record);
  });

  it('falls back to ?k=<canonical key> when the job record is missing', async () => {
    const { env } = makeEnv({ [ARG_MARK_KEY]: JSON.stringify(STORED_MARK_RESULT) });
    const { status, json } = await getRunStatus(env, 'gone-run', ARG_MARK_KEY);
    expect(status).toBe(200);
    expect(json).toEqual({
      status: 'ok',
      result: { ...STORED_MARK_RESULT, cache_hit: true, total_ms: 0 },
    });
  });

  it('returns 202 pending when neither the job record nor the cache key exist', async () => {
    const { env } = makeEnv();
    const { status, json } = await getRunStatus(env, 'never-ran', 'mark:nope:1:berakhot:5a');
    expect(status).toBe(202);
    expect(json).toEqual({ status: 'pending' });
  });
});
