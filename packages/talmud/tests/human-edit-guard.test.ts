import { describe, expect, it } from 'vitest';
import { keyForMark } from '../src/worker/cache-keys';
import { CODE_MARKS } from '../src/worker/code-marks';
import worker from '../src/worker/index';
import type { Bindings, JobMessage } from '../src/worker/types';

// HUMAN-EDIT GUARD, LIVE AT THE WRITE CHOKEPOINT: every run-path cache write
// goes through ArtifactStore.put (writeCachedResult), which refuses to
// overwrite a human-authored entry (provenance.authority === 'human') with
// rule/AI output. This drives a REAL fresh run through the worker's queue
// consumer (bypass_cache so the run skips the cache-hit early-return and
// actually attempts the write) over a seeded human entry, and asserts:
//   (a) the human entry survives byte-identically (the write was refused);
//   (b) the refusal is SILENT — the fresh result is still computed and
//       returned via the job record, it just isn't persisted (mirroring the
//       SWR never-clobber rule).
// The control case proves the guard blocks ONLY human entries: an ordinary
// AI/rule entry is overwritten by the same bypass run as always.

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
    body: { runId: 'guard-test', tractate: 'Berakhot', page: '5a', ...body } as JobMessage,
    ack: () => {},
    retry: () => {},
  };
  await worker.queue(
    { queue: 'enrichment-jobs', messages: [msg] } as unknown as MessageBatch<JobMessage>,
    env,
    makeCtx(),
  );
}

// daf-background is a COMPUTED mark: the fresh run needs no LLM mock and no
// seeded sources, so the only KV write under test is the producer's own.
const dafBackgroundMark = CODE_MARKS.find((m) => m.id === 'daf-background');
if (!dafBackgroundMark) throw new Error('expected daf-background in CODE_MARKS');
const KEY = keyForMark(dafBackgroundMark, 'Berakhot', '5a', 'en');

/** A stored envelope authored by a (future) human-edit path. The guard keys
 *  off provenance.authority === 'human' and nothing else. */
const HUMAN_ENTRY = JSON.stringify({
  content: 'hand-written background',
  parsed: { instances: [{ fields: { note: 'human-edited' } }] },
  parse_error: null,
  model: 'human',
  transport: 'human-edit',
  attempts: 0,
  usage: null,
  elapsed_ms: 0,
  prompt_chars: 0,
  resolved: { system_prompt: '', user_prompt: '' },
  cache_hit: false,
  provenance: {
    authority: 'human',
    producerId: 'daf-background',
    inputs: [],
    createdAt: '2026-06-01T00:00:00.000Z',
  },
});

describe('human-edit guard on the live run write path', () => {
  it('a fresh run over a human-authored entry is refused silently: the entry survives, the result still returns', async () => {
    const { env, store } = makeEnv({ [KEY]: HUMAN_ENTRY });

    await runJob(env, { mark_id: 'daf-background', bypass_cache: true });

    // (a) the human entry survives BYTE-identically — the run's write-through
    // was refused at ArtifactStore.put.
    expect(store.get(KEY)).toBe(HUMAN_ENTRY);

    // (b) silent refusal: the fresh result was still computed and served to
    // the caller via the job record — only the persistence was skipped.
    const jobRaw = store.get('job:guard-test');
    expect(jobRaw).toBeTruthy();
    const job = JSON.parse(jobRaw as string);
    expect(job.status).toBe('ok');
    expect(job.result.kind).toBe('mark');
    expect(job.result.transport).toBe('computed');
    expect(job.result.parsed).toEqual({ instances: [{ fields: {} }] });
    expect(job.result.provenance.authority).toBe('rule');
  });

  it('control: the same run overwrites an ordinary AI/rule entry as always', async () => {
    const aiEntry = JSON.stringify({
      ...JSON.parse(HUMAN_ENTRY),
      content: 'stale machine output',
      provenance: undefined,
      transport: 'computed',
      model: 'computed:old',
    });
    const { env, store } = makeEnv({ [KEY]: aiEntry });

    await runJob(env, { mark_id: 'daf-background', bypass_cache: true });

    const raw = store.get(KEY);
    expect(raw).toBeTruthy();
    expect(raw).not.toBe(aiEntry);
    const stored = JSON.parse(raw as string);
    expect(stored.parsed).toEqual({ instances: [{ fields: {} }] });
    expect(stored.provenance.authority).toBe('rule');
  });
});
