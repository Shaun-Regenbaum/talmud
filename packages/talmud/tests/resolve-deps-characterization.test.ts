import { describe, expect, it, vi } from 'vitest';
import { keyForEnrichment, keyForGemara, keyForMark } from '../src/worker/cache-keys';
import { CODE_ENRICHMENTS, CODE_MARKS } from '../src/worker/code-marks';
import type { Bindings } from '../src/worker/types';

// CHARACTERIZATION of resolveDependencies' observable value shapes (the
// `vars` / `depends` / `anchors` / `sources` a producer's prompt is built
// from), locked ahead of the refactor.
//
// NOTE ON ACCESS: resolveDependencies was not exported; per the agreed
// exception for this characterization PR, the single word `export` was added
// to its declaration in src/worker/index.ts (a no-behavior change). No other
// production code was touched.
//
// runLLM is mocked to THROW: every case below must resolve purely from the
// seeded KV cache (cache-hit enrichment/mark deps, cached gemara slice) or
// from deterministic branches (cycle / not-found). Any accidental model call
// fails the test loudly instead of hitting the network.
vi.mock('@corpus/core/llm/llm', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@corpus/core/llm/llm')>();
  return {
    ...mod,
    runLLM: vi.fn(async () => {
      throw new Error('unexpected runLLM call in resolve-deps characterization test');
    }),
  };
});

import { runLLM } from '@corpus/core/llm/llm';
import { resolveDependencies } from '../src/worker/index';

const runLLMMock = vi.mocked(runLLM);

// --- fixtures -----------------------------------------------------------

const GEMARA_SLICE = {
  tractate: 'Berakhot',
  page: '5a',
  hebrew: 'טקסט עברי',
  english: 'English text',
  segments_he: ['קטע א', 'קטע ב'],
  segments_en: ['segment one', 'segment two'],
};

/** Minimal stored RunResult envelope for seeding producer cache entries. */
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

function makeRc(seed: Record<string, string> = {}) {
  const { kv, store } = makeFakeKV({
    [keyForGemara('Berakhot', '5a')]: JSON.stringify(GEMARA_SLICE),
    ...seed,
  });
  const env = { CACHE: kv } as unknown as Bindings;
  const ctx = {
    waitUntil: (_p: Promise<unknown>) => {},
    passThroughOnException: () => {},
  } as unknown as ExecutionContext;
  return { rc: { env, url: 'https://test.local/internal', ctx, lang: 'en' as const }, store };
}

const rabbiMark = CODE_MARKS.find((m) => m.id === 'rabbi');
if (!rabbiMark) throw new Error('expected the rabbi mark in CODE_MARKS');
const RABBI_MARK_KEY = keyForMark(rabbiMark, 'Berakhot', '5a', 'en');

const rabbiBioFound = CODE_ENRICHMENTS.find((e) => e.id === 'rabbi.bio');
if (!rabbiBioFound) throw new Error('expected rabbi.bio in CODE_ENRICHMENTS');
const rabbiBio = rabbiBioFound;
/** rabbi.bio is scope=global, so its key carries no daf segment. */
function rabbiBioKey(instanceId: string): string {
  return keyForEnrichment(
    rabbiBio,
    instanceId,
    rabbiBio.scope === 'local' ? { tractate: 'Berakhot', page: '5a' } : undefined,
  );
}

describe('resolveDependencies — characterization', () => {
  it('(i) no dependencies declared: injects the full gemara var set by default', async () => {
    const { rc } = makeRc();
    const out = await resolveDependencies(
      rc,
      undefined,
      'Berakhot',
      '5a',
      undefined,
      false,
      new Set(),
    );
    expect(out.vars).toEqual({
      tractate: 'Berakhot',
      page: '5a',
      hebrew: 'טקסט עברי',
      english: 'English text',
      gemara_he: 'טקסט עברי',
      gemara_en: 'English text',
      segments_he: ['קטע א', 'קטע ב'],
      segments_en: ['segment one', 'segment two'],
      gemara: 'טקסט עברי\n\n---\n\nEnglish text',
    });
    expect(out.depends).toEqual({});
    expect(out.anchors).toEqual({});
    // The gemara text is also recorded as an inspector source.
    const gemara = out.vars.gemara as string;
    expect(out.sources.gemara).toEqual({ chars: gemara.length, content: gemara });
    expect(runLLMMock).not.toHaveBeenCalled();
  });

  it('(i b) an EMPTY dependencies array behaves identically to undefined', async () => {
    const { rc } = makeRc();
    const out = await resolveDependencies(rc, [], 'Berakhot', '5a', undefined, false, new Set());
    const expectedNoDeps = await resolveDependencies(
      rc,
      undefined,
      'Berakhot',
      '5a',
      undefined,
      false,
      new Set(),
    );
    expect(out.vars).toEqual(expectedNoDeps.vars);
    expect(out.depends).toEqual({});
    expect(out.anchors).toEqual({});
    expect(out.sources).toEqual(expectedNoDeps.sources);
    expect(runLLMMock).not.toHaveBeenCalled();
  });

  it('(ii) {enrichment:id} dep: out.depends[id] = parsed ?? content (cache-hit, no LLM)', async () => {
    const { rc } = makeRc({
      [rabbiBioKey('abaye')]: storedResult({ parsed: { bio: 'the bio of Abaye' } }),
      [rabbiBioKey('rava')]: storedResult({ parsed: null, content: 'plain prose fallback' }),
    });
    // parsed wins when present…
    const withParsed = await resolveDependencies(
      rc,
      [{ enrichment: 'rabbi.bio' }],
      'Berakhot',
      '5a',
      { fields: { name: 'Abaye' } },
      false,
      new Set(),
    );
    expect(withParsed.depends['rabbi.bio']).toEqual({ bio: 'the bio of Abaye' });
    // …and the raw content string is the fallback when parsed is null.
    const withContent = await resolveDependencies(
      rc,
      [{ enrichment: 'rabbi.bio' }],
      'Berakhot',
      '5a',
      { fields: { name: 'Rava' } },
      false,
      new Set(),
    );
    expect(withContent.depends['rabbi.bio']).toBe('plain prose fallback');
    expect(runLLMMock).not.toHaveBeenCalled();
  });

  it('(iii) {mark:id} dep: out.anchors[id] = parsed.instances ?? content', async () => {
    const instances = [{ fields: { name: 'Abaye' } }, { fields: { name: 'Rava' } }];
    const { rc, store } = makeRc({
      [RABBI_MARK_KEY]: storedResult({ parsed: { instances } }),
    });
    const out = await resolveDependencies(
      rc,
      [{ mark: 'rabbi' }],
      'Berakhot',
      '5a',
      undefined,
      false,
      new Set(),
    );
    expect(out.anchors.rabbi).toEqual(instances);
    // A cached mark whose parsed output has no `instances` falls back to the
    // raw content string.
    store.set(RABBI_MARK_KEY, storedResult({ parsed: {}, content: 'no instances here' }));
    const fallback = await resolveDependencies(
      rc,
      [{ mark: 'rabbi' }],
      'Berakhot',
      '5a',
      undefined,
      false,
      new Set(),
    );
    expect(fallback.anchors.rabbi).toBe('no instances here');
    expect(runLLMMock).not.toHaveBeenCalled();
  });

  it('(iv) unknown dep ids resolve to the exact {error: "not found"} value', async () => {
    const { rc } = makeRc();
    const out = await resolveDependencies(
      rc,
      [{ enrichment: 'no-such-enrichment' }, { mark: 'no-such-mark' }],
      'Berakhot',
      '5a',
      undefined,
      false,
      new Set(),
    );
    expect(out.depends['no-such-enrichment']).toEqual({ error: 'not found' });
    expect(out.anchors['no-such-mark']).toEqual({ error: 'not found' });
  });

  it('(v) cycle: exact error message format `cycle detected (a → b → a)`', async () => {
    const { rc } = makeRc();
    // parentChain models the ancestors already being resolved; depending back
    // on one of them is the cycle. The chain renders in insertion order.
    const out = await resolveDependencies(
      rc,
      [{ enrichment: 'a' }],
      'Berakhot',
      '5a',
      undefined,
      false,
      new Set(['a', 'b']),
    );
    expect(out.depends.a).toEqual({ error: 'cycle detected (a → b → a)' });
  });

  it('(vi) sourcesOnly: collects the transitive source closure WITHOUT running any model', async () => {
    // rabbi.bio is NOT cache-seeded here — a normal resolution would have to
    // generate it (and would hit the throwing runLLM mock). sourcesOnly must
    // instead recurse into its dependency closure (rabbi.bio declares none, so
    // the default gemara branch applies) and only gather source texts.
    const { rc } = makeRc();
    const out = await resolveDependencies(
      rc,
      [{ enrichment: 'rabbi.bio' }],
      'Berakhot',
      '5a',
      { fields: { name: 'Abaye' } },
      false,
      new Set(),
      true, // sourcesOnly
    );
    expect(runLLMMock).not.toHaveBeenCalled();
    expect(out.depends).toEqual({}); // nothing generated
    expect(out.anchors).toEqual({});
    expect(Object.keys(out.sources)).toEqual(['gemara']); // the transitive closure
    expect(out.sources.gemara.content).toBe('טקסט עברי\n\n---\n\nEnglish text');
  });

  it('(vi b) sourcesOnly recurses through NESTED enrichment deps without running any model', async () => {
    // rabbi.geography.evidence declares ['gemara', { enrichment: 'rabbi.geography' }],
    // and rabbi.geography declares no dependencies (default gemara branch). So
    // sourcesOnly must recurse evidence → geography → default-gemara — two
    // levels deep — gathering only source texts, never generating either
    // enrichment (nothing is cache-seeded; a generation attempt would hit the
    // throwing runLLM mock).
    const evidence = CODE_ENRICHMENTS.find((e) => e.id === 'rabbi.geography.evidence');
    if (!evidence) throw new Error('expected rabbi.geography.evidence in CODE_ENRICHMENTS');
    expect(evidence.dependencies).toEqual(['gemara', { enrichment: 'rabbi.geography' }]);
    const { rc } = makeRc();
    const out = await resolveDependencies(
      rc,
      evidence.dependencies,
      'Berakhot',
      '5a',
      { fields: { name: 'Abaye' } },
      false,
      new Set(),
      true, // sourcesOnly
    );
    expect(runLLMMock).not.toHaveBeenCalled();
    expect(out.depends).toEqual({});
    expect(out.anchors).toEqual({});
    expect(Object.keys(out.sources)).toEqual(['gemara']); // deduped transitive closure
    expect(out.sources.gemara.content).toBe('טקסט עברי\n\n---\n\nEnglish text');
  });

  it('(vii) fanOut dep: runs the enrichment per mark instance and exposes an ARRAY', async () => {
    const instances = [{ fields: { name: 'Abaye' } }, { fields: { name: 'Rava' } }];
    const { rc } = makeRc({
      [RABBI_MARK_KEY]: storedResult({ parsed: { instances } }),
      [rabbiBioKey('abaye')]: storedResult({ parsed: { bio: 'bio of Abaye' } }),
      [rabbiBioKey('rava')]: storedResult({ parsed: null, content: 'bio of Rava (raw)' }),
    });
    const out = await resolveDependencies(
      rc,
      [{ enrichment: 'rabbi.bio', fanOut: true }],
      'Berakhot',
      '5a',
      undefined,
      false,
      new Set(),
    );
    expect(Array.isArray(out.depends['rabbi.bio'])).toBe(true);
    // Per instance: parsed ?? content, in mark-instance order, nulls filtered.
    expect(out.depends['rabbi.bio']).toEqual([{ bio: 'bio of Abaye' }, 'bio of Rava (raw)']);
    expect(runLLMMock).not.toHaveBeenCalled();
  });
});
