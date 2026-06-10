/**
 * The unified producer registry (src/worker/producer-registry.ts) must be
 * BEHAVIOR-IDENTICAL to the two private loaders it replaced in index.ts:
 *
 *   - loadMarkDef:       readMark (flat KV def → rich synthesis) → findCodeMark
 *   - loadEnrichmentDef: readEnrichment (verbatim) → findCodeEnrichment →
 *                        adaptCodeEnrichment
 *
 * The old implementations are copied INLINE below as golden references (they
 * no longer exist in index.ts), and the new loaders — which route through the
 * Producer projection — are compared strict-equal against them over the whole
 * code registry plus KV-seeded defs in both flat shapes:
 *
 *   mark-defs:v2:{id}         { id, label, description?, extractor:'llm',
 *                               system_prompt?, user_prompt_template?,
 *                               fields_schema?, dependencies?, experimental?,
 *                               cache_version, source:'kv', updated_at }
 *   enrichment-defs:v2:{id}   { id, label, description?, mark, scope,
 *                               dependencies?, system_prompt,
 *                               user_prompt_template, system_prompt_he?,
 *                               user_prompt_template_he?, model?,
 *                               output_schema?, thinking_off?,
 *                               reasoning_effort?, cache_version,
 *                               source:'kv', updated_at }
 *   *-defs:v2:_index          JSON string[] of ids (powers listing only;
 *                               per-id reads go straight to the entry key)
 */

import { producerFromEnrichment, rawDependenciesOf } from '@corpus/core/model/compat';
import { producerNodesFrom } from '@corpus/core/registry/depGraph';
import { describe, expect, it } from 'vitest';
import { keyForEnrichment, keyForMark } from '../src/worker/cache-keys';
import { CODE_ENRICHMENTS, CODE_MARKS, findCodeMark } from '../src/worker/code-marks';
import {
  listProducers,
  loadEnrichmentDef,
  loadMarkDef,
  loadProducer,
  loadProducerOfShape,
  richEnrichmentFromKvDef,
} from '../src/worker/producer-registry';
import type {
  EnrichmentDefinition as KvEnrichmentDefinition,
  MarkDefinition as KvMarkDefinition,
  RegistryEnv,
} from '../src/worker/studio-registry';
import type {
  EnrichmentDefinition as SchemaEnrichmentDefinition,
  MarkDefinition as SchemaMarkDefinition,
} from '../src/worker/studio-schema';

// --- harness ---------------------------------------------------------------

function makeEnv(seed: Record<string, string> = {}): RegistryEnv {
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
  return { CACHE: kv as unknown as KVNamespace };
}

const EMPTY = makeEnv();

// --- golden references: the OLD index.ts loader bodies, verbatim ------------

/** Old index.ts adaptCodeEnrichment, copied byte-for-byte (incl. its own-key
 *  materialization of absent optionals and the null for extractors that are
 *  neither 'llm' nor 'computed'). */
function oldAdaptCodeEnrichment(code: SchemaEnrichmentDefinition): KvEnrichmentDefinition | null {
  if (code.extractor.kind !== 'llm' && code.extractor.kind !== 'computed') return null;
  const llm = code.extractor.kind === 'llm' ? code.extractor : null;
  return {
    id: code.id,
    label: code.label,
    description: code.description,
    mark: code.target_mark,
    scope: code.scope,
    dependencies: code.dependencies,
    passes: code.passes,
    system_prompt: llm?.system_prompt ?? '',
    user_prompt_template: llm?.user_prompt_template ?? '',
    system_prompt_he: llm?.system_prompt_he,
    user_prompt_template_he: llm?.user_prompt_template_he,
    model: llm?.model,
    output_schema: llm?.output_schema,
    thinking_off: llm?.thinking_off,
    reasoning_effort: llm?.reasoning_effort,
    cache_version: code.cache_version,
    source: 'code',
    updated_at: code.updated_at,
  };
}

/** Old index.ts loadMarkDef KV branch, copied byte-for-byte: the flat→rich
 *  synthesis (phrase anchor, the inline underline render literal, draft
 *  status, the 'kv' def_hash sentinel). */
function oldKvMarkSynthesis(kv: KvMarkDefinition): SchemaMarkDefinition {
  return {
    id: kv.id,
    label: kv.label,
    description: kv.description,
    anchor: 'phrase',
    render: { kind: 'inline', style: 'underline', color: '#0066CC' },
    extractor: {
      kind: 'llm',
      system_prompt: kv.system_prompt ?? '',
      user_prompt_template: kv.user_prompt_template ?? '',
    },
    dependencies: kv.dependencies,
    status: 'draft',
    def_hash: 'kv',
    cache_version: kv.cache_version,
    source: 'kv',
    updated_at: kv.updated_at,
  };
}

// --- (a) empty KV: the new loaders equal the old ones for every code def ----

describe('empty KV — code-def parity with the old loaders', () => {
  it('loadMarkDef returns the code def verbatim for every code mark', async () => {
    for (const def of CODE_MARKS) {
      // Old loader with empty KV = findCodeMark(id) = the def itself.
      expect(await loadMarkDef(EMPTY, def.id)).toStrictEqual(def);
    }
  });

  it('loadEnrichmentDef returns oldAdaptCodeEnrichment(def) for every code enrichment', async () => {
    for (const def of CODE_ENRICHMENTS) {
      expect(await loadEnrichmentDef(EMPTY, def.id)).toStrictEqual(oldAdaptCodeEnrichment(def));
    }
  });

  it('loadProducerOfShape projects every code def into the right producer flavor', async () => {
    for (const def of CODE_MARKS) {
      const p = await loadProducerOfShape(EMPTY, def.id, 'mark');
      expect(p).not.toBeNull();
      expect(p!.key_shape).toBe('mark');
      expect(p!.cacheVersion).toBe(def.cache_version);
    }
    for (const def of CODE_ENRICHMENTS) {
      const p = await loadProducerOfShape(EMPTY, def.id, 'enrich');
      expect(p).not.toBeNull();
      expect(p!.key_shape).toBe('enrich');
      expect(p!.cacheVersion).toBe(def.cache_version);
    }
  });

  it('the shape-pinned lookup misses across flavors; the unified one resolves both', async () => {
    const markId = CODE_MARKS[0].id;
    const enrichId = CODE_ENRICHMENTS[0].id;
    expect(await loadProducerOfShape(EMPTY, markId, 'enrich')).toBeNull();
    expect(await loadProducerOfShape(EMPTY, enrichId, 'mark')).toBeNull();
    expect((await loadProducer(EMPTY, markId))?.key_shape).toBe('mark');
    expect((await loadProducer(EMPTY, enrichId))?.key_shape).toBe('enrich');
    expect(await loadProducer(EMPTY, 'no.such.producer')).toBeNull();
  });
});

// --- (b) a KV-seeded FLAT mark def overrides code ----------------------------

describe('KV mark def overrides code', () => {
  // 'rabbi' exists in CODE_MARKS — the KV entry must shadow it.
  const flat: KvMarkDefinition = {
    id: 'rabbi',
    label: 'Rabbi (KV override)',
    description: 'authored in the dev UI',
    extractor: 'llm',
    system_prompt: 'SYSTEM',
    user_prompt_template: 'USER {{gemara}}',
    dependencies: ['gemara'],
    cache_version: '99',
    source: 'kv',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
  const env = makeEnv({
    'mark-defs:v2:rabbi': JSON.stringify(flat),
    'mark-defs:v2:_index': JSON.stringify(['rabbi']),
  });
  // What KV actually hands back (JSON round-trip, like production reads).
  const kvRead = JSON.parse(JSON.stringify(flat)) as KvMarkDefinition;

  it('loadMarkDef returns EXACTLY the old flat→rich synthesis', async () => {
    const def = await loadMarkDef(env, 'rabbi');
    expect(def).toStrictEqual(oldKvMarkSynthesis(kvRead));
    expect(def!.anchor).toBe('phrase');
    expect(def!.render).toEqual({ kind: 'inline', style: 'underline', color: '#0066CC' });
    expect(def!.status).toBe('draft');
    expect(def!.def_hash).toBe('kv');
    expect(def!.source).toBe('kv');
  });

  it('the KV cache_version flows into the projected producer and key derivation', async () => {
    const p = await loadProducerOfShape(env, 'rabbi', 'mark');
    expect(p!.cacheVersion).toBe('99');
    expect(p!.source).toBe('kv');
    expect(p!.status).toBe('draft');
    expect(p!.legacy?.def_hash).toBe('kv');
    expect(p!.legacy?.anchorKind).toBe('phrase');

    const oldKey = keyForMark(oldKvMarkSynthesis(kvRead), 'Berakhot', '5a', 'en');
    const newKey = keyForMark((await loadMarkDef(env, 'rabbi'))!, 'Berakhot', '5a', 'en');
    expect(newKey).toBe(oldKey);
    expect(newKey).toContain(':99:');
    // ...and differs from the code def's key (the override is effective).
    expect(newKey).not.toBe(keyForMark(findCodeMark('rabbi')!, 'Berakhot', '5a', 'en'));
  });
});

// --- (c) a KV-seeded FLAT enrichment def overrides code ----------------------

describe('KV enrichment def overrides code', () => {
  // 'rabbi.bio' exists in CODE_ENRICHMENTS — the KV entry must shadow it.
  const flat: KvEnrichmentDefinition = {
    id: 'rabbi.bio',
    label: 'Bio (KV override)',
    mark: 'rabbi',
    scope: 'local',
    dependencies: ['gemara', { mark: 'rabbi' }, { enrichment: 'rabbi.relationships' }],
    system_prompt: 'SYS',
    user_prompt_template: 'USR {{mark_input}}',
    system_prompt_he: 'SYS-HE',
    user_prompt_template_he: 'USR-HE',
    model: 'openrouter/deepseek/deepseek-chat' as KvEnrichmentDefinition['model'],
    output_schema: { type: 'object', properties: { bio: { type: 'string' } } },
    thinking_off: true,
    reasoning_effort: 'low',
    cache_version: '77',
    source: 'kv',
    updated_at: '2026-01-02T00:00:00.000Z',
  };
  const env = makeEnv({
    'enrichment-defs:v2:rabbi.bio': JSON.stringify(flat),
    'enrichment-defs:v2:_index': JSON.stringify(['rabbi.bio']),
  });
  const kvRead = JSON.parse(JSON.stringify(flat)) as KvEnrichmentDefinition;

  it('loadEnrichmentDef returns the stored KV def VERBATIM (old behavior)', async () => {
    expect(await loadEnrichmentDef(env, 'rabbi.bio')).toStrictEqual(kvRead);
  });

  it('a KV def carrying RICH-SCHEMA-COLLIDING stray fields still returns verbatim', async () => {
    // A hand-authored or legacy KV entry could carry fields whose names
    // collide with the intermediate rich schema (mode/target_mark/extractor/
    // status/def_hash). The loader returns the stored object untouched — a
    // reconstruction through the synthesis inverse would overwrite or strip
    // these. (Codex-flagged hazard; identity by construction is the fix.)
    const withCollisions = {
      ...flat,
      id: 'odd.kv',
      mode: 'aggregate',
      target_mark: 'NOT-THE-MARK',
      extractor: { kind: 'weird' },
      status: 'promoted',
      def_hash: 'hand-set',
      some_future_field: 42,
    };
    const env3 = makeEnv({
      'enrichment-defs:v2:odd.kv': JSON.stringify(withCollisions),
      'enrichment-defs:v2:_index': JSON.stringify(['odd.kv']),
    });
    expect(await loadEnrichmentDef(env3, 'odd.kv')).toStrictEqual(
      JSON.parse(JSON.stringify(withCollisions)),
    );
  });

  it('a minimal KV def (no optionals) also round-trips verbatim', async () => {
    const minimal: KvEnrichmentDefinition = {
      id: 'scratch.note',
      label: 'Scratch',
      mark: 'daf',
      scope: 'global',
      system_prompt: 'S',
      user_prompt_template: 'U',
      cache_version: '1',
      source: 'kv',
      updated_at: '2026-01-03T00:00:00.000Z',
    };
    const env2 = makeEnv({
      'enrichment-defs:v2:scratch.note': JSON.stringify(minimal),
      'enrichment-defs:v2:_index': JSON.stringify(['scratch.note']),
    });
    expect(await loadEnrichmentDef(env2, 'scratch.note')).toStrictEqual(
      JSON.parse(JSON.stringify(minimal)),
    );
  });

  it('the KV cache_version flows into the projected producer and key derivation', async () => {
    const p = await loadProducerOfShape(env, 'rabbi.bio', 'enrich');
    expect(p!.cacheVersion).toBe('77');
    expect(p!.scope).toBe('local');
    expect(p!.source).toBe('kv');
    expect(p!.status).toBe('draft');
    expect(p!.legacy?.def_hash).toBe('kv');
    expect(p!.anchoring.target).toBe('rabbi');

    const daf = { tractate: 'Berakhot', page: '5a' };
    const oldKey = keyForEnrichment(kvRead, 'Abaye', daf, undefined, 'en');
    const newKey = keyForEnrichment((await loadEnrichmentDef(env, 'rabbi.bio'))!, 'Abaye', daf);
    expect(newKey).toBe(oldKey);
    expect(newKey).toContain(':77:');
    const codeDef = CODE_ENRICHMENTS.find((d) => d.id === 'rabbi.bio')!;
    expect(newKey).not.toBe(
      keyForEnrichment(
        oldAdaptCodeEnrichment(codeDef)!,
        'Abaye',
        codeDef.scope === 'local' ? daf : undefined,
      ),
    );
  });
});

// --- (d) the no-collision invariant the unified lookup relies on -------------

describe('mark and enrichment ids never collide', () => {
  it('no id appears in both code registries', () => {
    const markIds = new Set(CODE_MARKS.map((d) => d.id));
    for (const e of CODE_ENRICHMENTS) {
      expect(markIds.has(e.id), `id '${e.id}' exists as BOTH a mark and an enrichment`).toBe(false);
    }
  });

  it('every code enrichment id is dotted; no code mark id is', () => {
    // The structural reason collisions cannot happen: enrichment ids are
    // namespaced under their mark ('rabbi.bio'); mark ids are bare slugs.
    // (KV-authored defs share one id grammar, so this is a convention, not a
    // hard guarantee — the unified loadProducer still prefers marks first,
    // matching the order documented in producer-registry.ts.)
    for (const e of CODE_ENRICHMENTS) expect(e.id).toContain('.');
    for (const m of CODE_MARKS) expect(m.id).not.toContain('.');
  });
});

// --- listProducers ------------------------------------------------------------

describe('listProducers', () => {
  it('empty KV: projects exactly [...CODE_MARKS, ...CODE_ENRICHMENTS], in order', async () => {
    const producers = await listProducers(EMPTY);
    expect(producers.map((p) => p.id)).toEqual(
      [...CODE_MARKS, ...CODE_ENRICHMENTS].map((d) => d.id),
    );
  });

  it('dep-graph parity: producerNodesFrom over projected producers === over the code defs', async () => {
    const producers = await listProducers(EMPTY);
    const viaProducers = producerNodesFrom(
      producers.map((p) => ({ id: p.id, dependencies: rawDependenciesOf(p) })),
    );
    const viaDefs = producerNodesFrom([...CODE_MARKS, ...CODE_ENRICHMENTS]);
    expect(viaProducers).toEqual(viaDefs);
  });

  it('KV wins on id collision with code; KV-only ids appear too', async () => {
    const kvMark: KvMarkDefinition = {
      id: 'rabbi',
      label: 'Rabbi (KV)',
      extractor: 'llm',
      system_prompt: 'S',
      user_prompt_template: 'U',
      cache_version: '42',
      source: 'kv',
      updated_at: '2026-01-01T00:00:00.000Z',
    };
    const kvEnrich: KvEnrichmentDefinition = {
      id: 'custom.experiment',
      label: 'Custom',
      mark: 'daf',
      scope: 'local',
      system_prompt: 'S',
      user_prompt_template: 'U',
      cache_version: '1',
      source: 'kv',
      updated_at: '2026-01-01T00:00:00.000Z',
    };
    const env = makeEnv({
      'mark-defs:v2:rabbi': JSON.stringify(kvMark),
      'mark-defs:v2:_index': JSON.stringify(['rabbi']),
      'enrichment-defs:v2:custom.experiment': JSON.stringify(kvEnrich),
      'enrichment-defs:v2:_index': JSON.stringify(['custom.experiment']),
    });
    const producers = await listProducers(env);
    const rabbi = producers.filter((p) => p.id === 'rabbi');
    expect(rabbi).toHaveLength(1);
    expect(rabbi[0].cacheVersion).toBe('42');
    expect(rabbi[0].source).toBe('kv');
    expect(producers.some((p) => p.id === 'custom.experiment')).toBe(true);
    // Everything from the code registry (minus the shadowed id) is still there.
    const ids = new Set(producers.map((p) => p.id));
    for (const d of [...CODE_MARKS, ...CODE_ENRICHMENTS]) expect(ids.has(d.id)).toBe(true);
    // KV enrichment defs project to enrich-shaped producers.
    const custom = producers.find((p) => p.id === 'custom.experiment')!;
    expect(custom.key_shape).toBe('enrich');
    expect(custom).toEqual(
      producerFromEnrichment(richEnrichmentFromKvDef(JSON.parse(JSON.stringify(kvEnrich)))),
    );
  });
});
