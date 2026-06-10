/**
 * ArtifactStore behavior over an in-memory KV: envelope round-trip (legacy and
 * model-era), the human-edit guard matrix, SWR reads across a version bump,
 * alias reads, generalized staleness, and the corrupted-JSON read contract
 * (null, mirroring the worker's readCachedResult).
 */

import { describe, expect, it } from 'vitest';
import { recipeHash } from '../src/cache/keys.ts';
import type { Authority, Provenance } from '../src/model/provenance.ts';
import { ArtifactStore, type KVStore } from '../src/store/artifact-store.ts';
import { authorityOf, type StoredArtifact } from '../src/store/envelope.ts';
import type { ArtifactAddress } from '../src/store/key-schemes.ts';
import { talmudLegacyKeyScheme, templateKeyScheme } from '../src/store/key-schemes.ts';

function memoryKV(initial: Record<string, string> = {}): { kv: KVStore; raw: Map<string, string> } {
  const raw = new Map(Object.entries(initial));
  return {
    raw,
    kv: {
      get: async (k) => raw.get(k) ?? null,
      put: async (k, v) => {
        raw.set(k, v);
      },
      delete: async (k) => {
        raw.delete(k);
      },
    },
  };
}

/** A legacy envelope — exactly the fields every stored vintage carries. */
const LEGACY: StoredArtifact = {
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

function provenance(authority: Authority, extra: Partial<Provenance> = {}): Provenance {
  return { authority, producerId: 'test.producer', inputs: [], createdAt: '', ...extra };
}

/** A model-era envelope: every optional field populated, incl. the additive ones. */
const MODERN: StoredArtifact = {
  ...LEGACY,
  reasoning: 'thought about it',
  transport: 'openrouter-gateway',
  lint_issues: [],
  check_issues: [{ check: 'anchor-verbatim', severity: 'soft' }],
  recipe_hash: 'abc123def456',
  cost: {
    billedUsd: 0.0042,
    estimatedUsd: 0.005,
    costInUsd: 0.003,
    costOutUsd: 0.002,
    tokensIn: 1500,
    tokensOut: 600,
    lang: 'en',
    cacheVersion: '5',
    computedAt: 1750000000000,
  },
  deps_resolved: { 'argument.voices': { voices: [] } },
  anchors_resolved: { rabbi: [{ fields: { name: 'Abaye' } }] },
  section_range: '2-5',
  provenance: provenance('ai', { recipeHash: 'abc123def456', model: 'deepseek' }),
  anchors: [{ spine: 'bavli', span: [{ path: ['Berakhot', '5a', 3] }], precision: 'segment' }],
};

function store(initial: Record<string, string> = {}) {
  const { kv, raw } = memoryKV(initial);
  return { store: new ArtifactStore(kv, talmudLegacyKeyScheme()), raw };
}

describe('put/get round-trip', () => {
  it('a modern envelope (provenance + anchors included) survives intact', async () => {
    const { store: s } = store();
    expect(await s.put('k', MODERN)).toEqual({ ok: true });
    expect(await s.get('k')).toEqual(MODERN);
  });

  it('a legacy envelope (no provenance) reads fine and derives authority', async () => {
    const { store: s } = store({ legacy: JSON.stringify(LEGACY) });
    const hit = await s.get('legacy');
    expect(hit).toEqual(LEGACY);
    // workers-ai is an LLM transport → 'ai'; a computed transport → 'rule'.
    expect(authorityOf(hit as StoredArtifact)).toBe('ai');
    expect(authorityOf({ ...LEGACY, transport: 'computed' })).toBe('rule');
    expect(authorityOf(MODERN)).toBe('ai');
    expect(authorityOf({ ...LEGACY, provenance: provenance('human') })).toBe('human');
  });

  it('get on a miss returns null', async () => {
    const { store: s } = store();
    expect(await s.get('nope')).toBeNull();
  });

  it('get on corrupted JSON returns null (mirrors readCachedResult)', async () => {
    const { store: s } = store({ bad: '{not json' });
    expect(await s.get('bad')).toBeNull();
  });
});

describe('human-edit guard', () => {
  const HUMAN = { ...LEGACY, provenance: provenance('human') };
  const RULE = { ...LEGACY, provenance: provenance('rule') };
  const AI = { ...LEGACY, provenance: provenance('ai') };

  async function attempt(
    existing: StoredArtifact | null,
    incoming: StoredArtifact,
    opts?: { force?: boolean },
  ) {
    const { store: s, raw } = store(existing ? { k: JSON.stringify(existing) } : {});
    const result = await s.put('k', incoming, opts);
    return { result, stored: raw.get('k') ?? null };
  }

  it('AI over human is refused (entry untouched)', async () => {
    const { result, stored } = await attempt(HUMAN, AI);
    expect(result).toEqual({ ok: false, reason: 'human-locked' });
    expect(stored).toBe(JSON.stringify(HUMAN));
  });

  it('rule over human is refused', async () => {
    const { result } = await attempt(HUMAN, RULE);
    expect(result).toEqual({ ok: false, reason: 'human-locked' });
  });

  it('legacy (no provenance) over human is refused', async () => {
    const { result } = await attempt(HUMAN, LEGACY);
    expect(result).toEqual({ ok: false, reason: 'human-locked' });
  });

  it('human over human writes', async () => {
    const edited = { ...HUMAN, content: 'edited again' };
    const { result, stored } = await attempt(HUMAN, edited);
    expect(result).toEqual({ ok: true });
    expect(stored).toBe(JSON.stringify(edited));
  });

  it('force + human writes', async () => {
    const { result } = await attempt(HUMAN, { ...HUMAN, content: 'forced' }, { force: true });
    expect(result).toEqual({ ok: true });
  });

  it('force + AI is STILL refused (force cannot launder authority)', async () => {
    const { result, stored } = await attempt(HUMAN, AI, { force: true });
    expect(result).toEqual({ ok: false, reason: 'human-locked' });
    expect(stored).toBe(JSON.stringify(HUMAN));
  });

  it('AI over AI writes', async () => {
    const next = { ...AI, content: 'regenerated' };
    const { result, stored } = await attempt(AI, next);
    expect(result).toEqual({ ok: true });
    expect(stored).toBe(JSON.stringify(next));
  });

  it('write to empty writes', async () => {
    const { result, stored } = await attempt(null, AI);
    expect(result).toEqual({ ok: true });
    expect(stored).toBe(JSON.stringify(AI));
  });

  it('AI over human even when the existing entry is human BUT the new one carries no provenance', async () => {
    // (Same as the legacy case above, kept explicit: absence of provenance is
    // not-human, so it cannot replace a human edit.)
    const { result } = await attempt(HUMAN, { ...LEGACY, provenance: undefined });
    expect(result).toEqual({ ok: false, reason: 'human-locked' });
  });
});

describe('getSWR', () => {
  const BIO = { id: 'rabbi.bio', cacheVersion: '5', scope: 'global', key_shape: 'enrich' } as const;
  const ADDR = { instanceId: 'abaye' };
  const CANONICAL = 'enrich:rabbi.bio:5:abaye';
  const PREVIOUS = 'enrich:rabbi.bio:4:abaye';

  it('canonical hit → stale:false, served from the canonical key', async () => {
    const { store: s } = store({ [CANONICAL]: JSON.stringify(MODERN) });
    expect(await s.getSWR(BIO, ADDR)).toEqual({
      canonicalKey: CANONICAL,
      servedKey: CANONICAL,
      value: MODERN,
      stale: false,
    });
  });

  it('canonical miss, previous-version hit → stale:true, canonicalKey still the refresh target', async () => {
    // canonicalKey is what a refresh job/write-through targets; servedKey is
    // only where the bytes came from. Returning the previous key as THE key
    // would point the refresh at the dying version.
    const { store: s } = store({ [PREVIOUS]: JSON.stringify(LEGACY) });
    expect(await s.getSWR(BIO, ADDR)).toEqual({
      canonicalKey: CANONICAL,
      servedKey: PREVIOUS,
      value: LEGACY,
      stale: true,
    });
  });

  it('both miss → null, canonical keys, stale:false', async () => {
    const { store: s } = store();
    expect(await s.getSWR(BIO, ADDR)).toEqual({
      canonicalKey: CANONICAL,
      servedKey: CANONICAL,
      value: null,
      stale: false,
    });
  });

  it('version 1 has no previous key → plain miss', async () => {
    const { store: s } = store();
    const v1 = { ...BIO, cacheVersion: '1' };
    expect(await s.getSWR(v1, ADDR)).toEqual({
      canonicalKey: 'enrich:rabbi.bio:1:abaye',
      servedKey: 'enrich:rabbi.bio:1:abaye',
      value: null,
      stale: false,
    });
  });

  it('accept guards the CANONICAL read (section_range-style mismatch falls through)', async () => {
    // Production's section_range guard: a cached section enrichment whose
    // stored range no longer matches the requested instance must not be
    // served. With the canonical entry rejected and no previous entry, the
    // read is a miss.
    const mismatched = { ...MODERN, section_range: '0-3' };
    const { store: s } = store({ [CANONICAL]: JSON.stringify(mismatched) });
    const result = await s.getSWR(BIO, ADDR, {
      accept: (v) => v.section_range === '4-7',
    });
    expect(result).toEqual({
      canonicalKey: CANONICAL,
      servedKey: CANONICAL,
      value: null,
      stale: false,
    });
  });

  it('accept guards the PREVIOUS read too (no wrong-section stale serves)', async () => {
    const mismatchedPrev = { ...LEGACY, section_range: '0-3' };
    const matchingPrev = { ...LEGACY, section_range: '4-7' };
    const { store: s } = store({ [PREVIOUS]: JSON.stringify(mismatchedPrev) });
    expect(
      (await s.getSWR(BIO, ADDR, { accept: (v) => v.section_range === '4-7' })).value,
    ).toBeNull();
    const { store: s2 } = store({ [PREVIOUS]: JSON.stringify(matchingPrev) });
    expect(await s2.getSWR(BIO, ADDR, { accept: (v) => v.section_range === '4-7' })).toEqual({
      canonicalKey: CANONICAL,
      servedKey: PREVIOUS,
      value: matchingPrev,
      stale: true,
    });
  });
});

describe('getWithAliases', () => {
  type A = ArtifactAddress & Record<string, unknown>;
  const scheme = templateKeyScheme({
    events: {
      key: (a: A) => `events:v2:${a.unit?.work}:${a.unit?.unit}`,
      legacy: (a: A) => [`events:v1:${a.unit?.work}:${a.unit?.unit}`],
    },
  });
  const EVENTS = { id: 'events', cacheVersion: '2', scope: 'local', key_shape: 'enrich' } as const;
  const ADDR = { unit: { work: 'Genesis', unit: '1' } };

  it('canonical hit wins (aliases never read)', async () => {
    const { kv, raw } = memoryKV({
      'events:v2:Genesis:1': JSON.stringify(MODERN),
      'events:v1:Genesis:1': JSON.stringify(LEGACY),
    });
    const s = new ArtifactStore(kv, scheme);
    expect(await s.getWithAliases(EVENTS, ADDR)).toEqual({
      key: 'events:v2:Genesis:1',
      value: MODERN,
    });
    expect(raw.size).toBe(2);
  });

  it('canonical miss → alias hit, but the returned key stays CANONICAL', async () => {
    const { kv } = memoryKV({ 'events:v1:Genesis:1': JSON.stringify(LEGACY) });
    const s = new ArtifactStore(kv, scheme);
    expect(await s.getWithAliases(EVENTS, ADDR)).toEqual({
      key: 'events:v2:Genesis:1',
      value: LEGACY,
    });
  });

  it('writes go to the canonical key only — no store-side alias writes', async () => {
    const { kv, raw } = memoryKV();
    const s = new ArtifactStore(kv, scheme);
    const key = s.keyFor(EVENTS, ADDR);
    expect(key).toBe('events:v2:Genesis:1');
    await s.put(key, LEGACY);
    expect([...raw.keys()]).toEqual(['events:v2:Genesis:1']);
  });

  it('both miss → null under the canonical key', async () => {
    const { kv } = memoryKV();
    const s = new ArtifactStore(kv, scheme);
    expect(await s.getWithAliases(EVENTS, ADDR)).toEqual({
      key: 'events:v2:Genesis:1',
      value: null,
    });
  });
});

describe('staleness', () => {
  const RECIPE = { extractor: { kind: 'llm', system_prompt: 'do the thing' } };

  it('fresh: stored hash equals the current recipe hash', async () => {
    const { store: s } = store();
    const hash = await recipeHash(RECIPE);
    expect(await s.staleness({ ...LEGACY, recipe_hash: hash }, { recipe: RECIPE })).toBe('fresh');
    expect(await s.staleness({ ...LEGACY, recipe_hash: hash }, { recipeHash: hash })).toBe('fresh');
  });

  it('stale-recipe: stored hash differs from the current one', async () => {
    const { store: s } = store();
    expect(await s.staleness({ ...LEGACY, recipe_hash: 'older0hash00' }, { recipe: RECIPE })).toBe(
      'stale-recipe',
    );
  });

  it('unknown: no stored hash anywhere (pre-stamp entry)', async () => {
    const { store: s } = store();
    expect(await s.staleness(LEGACY, { recipe: RECIPE })).toBe('unknown');
  });

  it('falls back to provenance.recipeHash when the top-level stamp is absent', async () => {
    const { store: s } = store();
    const hash = await recipeHash(RECIPE);
    const stored = { ...LEGACY, provenance: provenance('ai', { recipeHash: hash }) };
    expect(await s.staleness(stored, { recipe: RECIPE })).toBe('fresh');
  });

  it('stale-inputs: a matched input contentHash differs', async () => {
    const { store: s } = store();
    const stored: StoredArtifact = {
      ...LEGACY,
      recipe_hash: 'samehash0000',
      provenance: provenance('ai', {
        inputs: [
          { sourceKey: 'ctx:gemara:v1:berakhot:5a', contentHash: 'aaa' },
          { artifactId: 'mark:argument:4:berakhot:5a', contentHash: 'bbb' },
        ],
      }),
    };
    expect(
      await s.staleness(stored, { recipeHash: 'samehash0000' }, [
        { artifactId: 'mark:argument:4:berakhot:5a', contentHash: 'CHANGED' },
      ]),
    ).toBe('stale-inputs');
    expect(
      await s.staleness(stored, { recipeHash: 'samehash0000' }, [
        { sourceKey: 'ctx:gemara:v1:berakhot:5a', contentHash: 'CHANGED' },
      ]),
    ).toBe('stale-inputs');
  });

  it('fresh with matching inputs (and tolerant of hash-less / unmatched ones)', async () => {
    const { store: s } = store();
    const stored: StoredArtifact = {
      ...LEGACY,
      recipe_hash: 'samehash0000',
      provenance: provenance('ai', {
        inputs: [{ sourceKey: 'ctx:gemara:v1:berakhot:5a', contentHash: 'aaa' }],
      }),
    };
    expect(
      await s.staleness(stored, { recipeHash: 'samehash0000' }, [
        { sourceKey: 'ctx:gemara:v1:berakhot:5a', contentHash: 'aaa' },
        { sourceKey: 'ctx:gemara:v1:berakhot:5a' }, // no current hash → not comparable
        { sourceKey: 'never-stored', contentHash: 'zzz' }, // no stored counterpart
      ]),
    ).toBe('fresh');
  });

  it('recipe mismatch wins over input comparison (checked first)', async () => {
    const { store: s } = store();
    const stored: StoredArtifact = {
      ...LEGACY,
      recipe_hash: 'old0hash0000',
      provenance: provenance('ai', { inputs: [{ sourceKey: 'k', contentHash: 'aaa' }] }),
    };
    expect(
      await s.staleness(stored, { recipeHash: 'new0hash0000' }, [
        { sourceKey: 'k', contentHash: 'CHANGED' },
      ]),
    ).toBe('stale-recipe');
  });
});

describe('evict', () => {
  it('deletes the entry', async () => {
    const { store: s, raw } = store({ k: JSON.stringify(LEGACY) });
    await s.evict('k');
    expect(raw.has('k')).toBe(false);
    expect(await s.get('k')).toBeNull();
  });
});
