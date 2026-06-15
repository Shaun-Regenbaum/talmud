import { describe, expect, it } from 'vitest';
import { instanceIdOf, keyForDafIndex, prefixForDafIndex } from '../src/worker/cache-keys';
import {
  dafIndexMetaOf,
  recordEnrichmentDafIndex,
  recordMarkDafIndex,
} from '../src/worker/daf-index';

// New `dafidx:v1:` namespace — the daf is the PREFIX (content keys carry it as a
// SUFFIX, so they can't be listed by daf). Pin the bytes: this is a fresh
// contract a reader will `list()` against, so a separator/order change is a
// deliberate, reviewed edit, not a silent regression.
describe('daf-index key contract', () => {
  it('byte-exact key + prefix', () => {
    expect(keyForDafIndex('Berakhot', '2a', 'pesukim.why-here', 'deuteronomy_6_7', 'en')).toBe(
      'dafidx:v1:berakhot:2a:pesukim.why-here:deuteronomy_6_7:en',
    );
    expect(keyForDafIndex('Bava Kamma', '117b', 'rabbi', '-', 'he')).toBe(
      'dafidx:v1:bava_kamma:117b:rabbi:-:he',
    );
    expect(prefixForDafIndex('Berakhot', '2a')).toBe('dafidx:v1:berakhot:2a:');
  });
  it('every entry for a daf falls under that daf prefix (so one list() finds them all)', () => {
    const k = keyForDafIndex('Berakhot', '2a', 'aggadata.interpretation', 'abc123', 'en');
    expect(k.startsWith(prefixForDafIndex('Berakhot', '2a'))).toBe(true);
    // a different daf does NOT
    expect(k.startsWith(prefixForDafIndex('Shabbat', '2a'))).toBe(false);
  });
});

describe('dafIndexMetaOf — compact metadata (< KV 1024b cap)', () => {
  it('keeps present fields, drops nulls + the mark "-" instance sentinel', () => {
    expect(
      dafIndexMetaOf({
        producerId: 'pesukim.why-here',
        kind: 'enrichment',
        lang: 'en',
        instanceId: 'deuteronomy_6_7',
        model: 'deepseek',
        cost: 0.0012,
        tokens: 50,
        coldMs: 1000,
        recipeHash: 'abc',
        at: 123,
      }),
    ).toEqual({
      p: 'pesukim.why-here',
      k: 'enrichment',
      l: 'en',
      i: 'deuteronomy_6_7',
      m: 'deepseek',
      c: 0.0012,
      t: 50,
      ms: 1000,
      rh: 'abc',
      at: 123,
    });
    // computed mark: no cost/tokens, '-' instance dropped
    expect(
      dafIndexMetaOf({
        producerId: 'rabbi',
        kind: 'mark',
        lang: 'he',
        instanceId: '-',
        cost: null,
        tokens: null,
        coldMs: null,
        recipeHash: null,
        at: null,
      }),
    ).toEqual({ p: 'rabbi', k: 'mark', l: 'he' });
  });
});

describe('record*DafIndex — writes to KV (empty value, telemetry in metadata)', () => {
  const makeFake = () => {
    const store = new Map<string, { value: string; metadata: unknown }>();
    return {
      store,
      put: async (key: string, value: string, opts?: { metadata?: unknown }) => {
        store.set(key, { value, metadata: opts?.metadata });
      },
    };
  };

  it('mark: one entry per (daf, mark, lang)', async () => {
    const kv = makeFake();
    await recordMarkDafIndex(kv, 'pesukim', 'Berakhot', '2a', 'en', {
      model: 'computed',
      elapsed_ms: 5,
      recipe_hash: 'rh1',
      cost: { billedUsd: null, estimatedUsd: null },
      usage: {},
    });
    const e = kv.store.get(keyForDafIndex('Berakhot', '2a', 'pesukim', '-', 'en'));
    expect(e?.value).toBe('');
    expect(e?.metadata).toMatchObject({
      p: 'pesukim',
      k: 'mark',
      l: 'en',
      m: 'computed',
      ms: 5,
      rh: 'rh1',
    });
  });

  it('enrichment: key uses instanceIdOf(markInput), cost from the stamp', async () => {
    const kv = makeFake();
    const inst = { fields: { verseRef: 'Deuteronomy 6:7' } };
    await recordEnrichmentDafIndex(kv, 'pesukim.why-here', 'Berakhot', '2a', inst, 'en', {
      model: 'deepseek',
      elapsed_ms: 1000,
      recipe_hash: 'rh2',
      cost: { billedUsd: 0.0012, estimatedUsd: 0.0012, computedAt: 999 },
      usage: { total_tokens: 50 },
    });
    const iid = await instanceIdOf(inst);
    const e = kv.store.get(keyForDafIndex('Berakhot', '2a', 'pesukim.why-here', iid, 'en'));
    expect(e?.value).toBe('');
    expect(e?.metadata).toMatchObject({
      p: 'pesukim.why-here',
      k: 'enrichment',
      i: iid,
      c: 0.0012,
      t: 50,
      at: 999,
    });
  });
});
