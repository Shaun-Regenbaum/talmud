import { provenanceInputRefs } from '@corpus/core/run/run-producer';
import { describe, expect, it } from 'vitest';
import { instanceIdOf, keyForEnrichment, keyForMark } from '../src/worker/cache-keys';
import { CODE_ENRICHMENTS, CODE_MARKS } from '../src/worker/code-marks';
import worker from '../src/worker/index';
import type { Bindings } from '../src/worker/types';

// The Inspect dock's provenance/staleness additions to GET /api/run-tree and
// GET /api/daf-runs: nodes backed by a cached entry carry authority (from the
// stored provenance, or derived from the transport for legacy entries), a
// staleness verdict (recipe leg vs the CURRENT def + an input-content-hash leg
// recomputed from ALREADY-CACHED dependency entries), createdAt, and the
// stamped inputs with per-input same/changed/unknown. All additive; cache
// reads only (no LLM, no queue). Harness mirrors run-contract.test.ts.

// --- harness ---------------------------------------------------------------

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

async function getJson(env: Bindings, path: string): Promise<{ status: number; json: unknown }> {
  const res = await worker.fetch(new Request(`https://test.local${path}`), env, makeCtx());
  return { status: res.status, json: await res.json() };
}

// A representative stored RunResult envelope (what writeCachedResult persists).
const BASE = {
  content: '{"x":1}',
  parsed: { x: 1 },
  parse_error: null,
  model: 'openrouter/test/model',
  transport: 'openrouter-gateway',
  attempts: 1,
  usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150, cost: 0.001 },
  elapsed_ms: 1234,
  prompt_chars: 4321,
  resolved: { system_prompt: 'sys', user_prompt: 'usr' },
  cache_hit: false,
};

const ROOT = 'argument-overview.synthesis';
const T = 'Berakhot';
const P = '5a';

const synthDef = CODE_ENRICHMENTS.find((e) => e.id === ROOT);
const flowDef = CODE_ENRICHMENTS.find((e) => e.id === 'argument-overview.flow');
const argDef = CODE_MARKS.find((m) => m.id === 'argument');
const rabbiDef = CODE_MARKS.find((m) => m.id === 'rabbi');
if (!synthDef || !flowDef || !argDef || !rabbiDef) {
  throw new Error('expected argument-overview.synthesis + flow + argument + rabbi in the registry');
}

// Dependency values exactly as resolveInputs exposes them (enrichment dep →
// parsed ?? content; mark dep → parsed.instances ?? content).
const FLOW_PARSED = { edges: [{ from: 0, to: 1, type: 'continues' }] };
const ARG_INSTANCES = [{ title: 'First sugya', startSegIdx: 0, endSegIdx: 2 }];
const RABBI_INSTANCES = [{ name: 'Abaye' }];

async function seedEntries(opts: {
  rootRecipeHash: string;
  inputs: Awaited<ReturnType<typeof provenanceInputRefs>>;
}): Promise<Record<string, string>> {
  const iid = await instanceIdOf({ fields: {} });
  const daf = { tractate: T, page: P };
  return {
    [keyForEnrichment(flowDef!, iid, daf)]: JSON.stringify({
      ...BASE,
      parsed: FLOW_PARSED,
      // legacy entry: no recipe_hash, no provenance — staleness must be 'unknown'
    }),
    [keyForMark(argDef!, T, P, 'en')]: JSON.stringify({
      ...BASE,
      parsed: { instances: ARG_INSTANCES },
    }),
    [keyForMark(rabbiDef!, T, P, 'en')]: JSON.stringify({
      ...BASE,
      parsed: { instances: RABBI_INSTANCES },
      transport: 'computed', // deterministic → authority must derive to 'rule'
    }),
    [keyForEnrichment(synthDef!, iid, daf)]: JSON.stringify({
      ...BASE,
      parsed: { synthesis: 'one paragraph' },
      recipe_hash: opts.rootRecipeHash,
      provenance: {
        authority: 'ai',
        producerId: ROOT,
        recipeHash: opts.rootRecipeHash,
        inputs: opts.inputs,
        model: BASE.model,
        transport: BASE.transport,
        usage: BASE.usage,
        cost: null,
        createdAt: '2026-06-01T00:00:00.000Z',
      },
    }),
  };
}

/** The stamped input refs, hashed from the SAME values the seeds carry — so a
 *  recomputation over the cached entries must agree ('same'). */
function stampedInputs() {
  return provenanceInputRefs({
    depends: { 'argument-overview.flow': FLOW_PARSED },
    anchors: { argument: ARG_INSTANCES, rabbi: RABBI_INSTANCES },
  });
}

/** The producer's CURRENT recipe hash, read off the /api/stale probe (the same
 *  enrichmentRecipe + recipeHash the write path uses). */
async function currentRecipeHash(): Promise<string> {
  const { env } = makeEnv();
  const { status, json } = await getJson(env, `/api/stale/${ROOT}/${T}/${P}`);
  expect(status).toBe(200);
  const hash = (json as { current_recipe: string }).current_recipe;
  expect(hash).toMatch(/^[0-9a-f]{12}$/);
  return hash;
}

interface Node {
  id: string;
  kind: string;
  cached: boolean;
  authority?: string | null;
  staleness?: string | null;
  createdAt?: string | null;
  recipeHash?: string | null;
  inputs?: Array<{ sourceKey: string; status: string }>;
  inputsChanged?: string[];
}

async function fetchTree(env: Bindings): Promise<Record<string, Node>> {
  const { status, json } = await getJson(env, `/api/run-tree/${T}/${P}/${ROOT}`);
  expect(status).toBe(200);
  return (json as { nodes: Record<string, Node> }).nodes;
}

// --- /api/run-tree ----------------------------------------------------------

describe('GET /api/run-tree — provenance + staleness fields', () => {
  it('fresh root: authority/createdAt from provenance, staleness fresh, all inputs same', async () => {
    const current = await currentRecipeHash();
    const { env } = makeEnv(
      await seedEntries({ rootRecipeHash: current, inputs: await stampedInputs() }),
    );
    const nodes = await fetchTree(env);

    const root = nodes[ROOT];
    expect(root.cached).toBe(true);
    expect(root.authority).toBe('ai');
    expect(root.createdAt).toBe('2026-06-01T00:00:00.000Z');
    expect(root.recipeHash).toBe(current);
    expect(root.staleness).toBe('fresh');
    expect(root.inputs).toEqual([
      { sourceKey: 'argument-overview.flow', status: 'same' },
      { sourceKey: 'argument', status: 'same' },
      { sourceKey: 'rabbi', status: 'same' },
    ]);
    expect(root.inputsChanged).toEqual([]);

    // mark nodes: authority derived from the stored transport (legacy entries
    // carry no provenance); staleness 'unknown' — marks never stamp recipe_hash
    expect(nodes.argument.authority).toBe('ai');
    expect(nodes.argument.staleness).toBe('unknown');
    expect(nodes.argument.createdAt).toBeNull();
    expect(nodes.rabbi.authority).toBe('rule'); // transport 'computed'

    // legacy enrichment entry without a recipe stamp → 'unknown'
    expect(nodes['argument-overview.flow'].staleness).toBe('unknown');
    expect(nodes['argument-overview.flow'].authority).toBe('ai');

    // source leaves carry none of the new fields
    expect(nodes.gemara.kind).toBe('source');
    expect(nodes.gemara.authority).toBeUndefined();
    expect(nodes.gemara.staleness).toBeUndefined();
  });

  it('a changed dependency flips the root to stale-inputs and names it', async () => {
    const current = await currentRecipeHash();
    const seeds = await seedEntries({ rootRecipeHash: current, inputs: await stampedInputs() });
    // Re-extract drifted: the argument mark's cached instances moved.
    seeds[keyForMark(argDef!, T, P, 'en')] = JSON.stringify({
      ...BASE,
      parsed: { instances: [{ title: 'Re-extracted sugya', startSegIdx: 0, endSegIdx: 5 }] },
    });
    const { env } = makeEnv(seeds);
    const nodes = await fetchTree(env);
    expect(nodes[ROOT].staleness).toBe('stale-inputs');
    expect(nodes[ROOT].inputsChanged).toEqual(['argument']);
    expect(nodes[ROOT].inputs).toContainEqual({ sourceKey: 'argument', status: 'changed' });
    expect(nodes[ROOT].inputs).toContainEqual({ sourceKey: 'rabbi', status: 'same' });
  });

  it('an uncached dependency reports unknown (and does not flip staleness)', async () => {
    const current = await currentRecipeHash();
    const iid = await instanceIdOf({ fields: {} });
    const seeds = await seedEntries({ rootRecipeHash: current, inputs: await stampedInputs() });
    delete seeds[keyForEnrichment(flowDef!, iid, { tractate: T, page: P })];
    const { env } = makeEnv(seeds);
    const nodes = await fetchTree(env);
    expect(nodes[ROOT].inputs).toContainEqual({
      sourceKey: 'argument-overview.flow',
      status: 'unknown',
    });
    expect(nodes[ROOT].staleness).toBe('fresh');
    expect(nodes['argument-overview.flow'].cached).toBe(false);
    expect(nodes['argument-overview.flow'].authority).toBeNull();
    expect(nodes['argument-overview.flow'].staleness).toBeNull();
  });

  it('a recipe edit wins over input checks: stale-recipe', async () => {
    const { env } = makeEnv(
      await seedEntries({ rootRecipeHash: 'deadbeefdeadbeef', inputs: await stampedInputs() }),
    );
    const nodes = await fetchTree(env);
    expect(nodes[ROOT].staleness).toBe('stale-recipe');
    expect(nodes[ROOT].recipeHash).toBe('deadbeefdeadbeef');
  });

  it('native provenance.authority wins over the transport derivation', async () => {
    const current = await currentRecipeHash();
    const seeds = await seedEntries({ rootRecipeHash: current, inputs: [] });
    const iid = await instanceIdOf({ fields: {} });
    const key = keyForEnrichment(synthDef!, iid, { tractate: T, page: P });
    const entry = JSON.parse(seeds[key]);
    entry.provenance.authority = 'human';
    seeds[key] = JSON.stringify(entry);
    const { env } = makeEnv(seeds);
    const nodes = await fetchTree(env);
    expect(nodes[ROOT].authority).toBe('human');
  });
});

// --- /api/daf-runs ----------------------------------------------------------

describe('GET /api/daf-runs — additive authority + recipe-leg staleness', () => {
  it('cached rows carry a verdict; uncached rows carry nulls', async () => {
    const current = await currentRecipeHash();
    const { env } = makeEnv(
      await seedEntries({ rootRecipeHash: current, inputs: await stampedInputs() }),
    );
    const { status, json } = await getJson(env, `/api/daf-runs/${T}/${P}`);
    expect(status).toBe(200);
    const runs = (json as { runs: Array<Node & { id: string }> }).runs;
    const byId = new Map(runs.map((r) => [r.id, r]));

    const root = byId.get(ROOT);
    expect(root?.authority).toBe('ai');
    expect(root?.staleness).toBe('fresh');

    // cached mark: authority derived, staleness 'unknown' (no recipe stamp)
    expect(byId.get('argument')?.authority).toBe('ai');
    expect(byId.get('argument')?.staleness).toBe('unknown');
    expect(byId.get('rabbi')?.authority).toBe('rule');

    // an uncached row: both null
    const uncached = runs.find((r) => !r.cached);
    expect(uncached?.authority).toBeNull();
    expect(uncached?.staleness).toBeNull();
  });
});
