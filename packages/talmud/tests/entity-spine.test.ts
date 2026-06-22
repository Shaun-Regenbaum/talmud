import { entityAnchor } from '@corpus/core/model/anchor';
import { describe, expect, it } from 'vitest';
import { instanceIdOf, keyForEnrichment } from '../src/worker/cache-keys';
import { findCodeEnrichment } from '../src/worker/code-marks';
import { talmudSpines } from '../src/worker/spines';

// Entity spines lift the "global" rabbi/place enrichments onto an addressable
// registry WITHOUT changing any cache key. The whole safety of that rests on one
// invariant: an entity anchor's id is byte-identical to the enrichment's cache
// `instance_id`. These tests pin that — and the key shape — so a future change
// that drifts the entity slug away from instanceIdOf fails here, not in prod.

describe('entity spines are registered + resolve', () => {
  it('entity:rabbi and entity:place exist, are entity-kind, one level', () => {
    for (const id of ['entity:rabbi', 'entity:place']) {
      const def = talmudSpines.get(id);
      expect(def, id).toBeDefined();
      expect(def?.kind).toBe('entity');
      expect(def?.levels).toEqual(['id']);
    }
  });

  it('normalizePath slugs the id to the cache instance_id form', () => {
    expect(talmudSpines.ref('entity:rabbi', ['Rav Huna'])).toEqual(['rav_huna']);
    expect(talmudSpines.ref('entity:place', ['Eretz Yisrael'])).toEqual(['eretz_yisrael']);
  });

  it('rejects a path deeper than the single id level', () => {
    expect(() => talmudSpines.ref('entity:rabbi', ['abaye', 'extra'])).toThrow();
  });
});

describe('key-compat invariant — entity id === cache instance_id', () => {
  // Representative rabbis: single-word, multi-word (underscore slug), title form.
  for (const name of ['Abaye', 'Rav Huna', 'Rabbi Yochanan']) {
    it(`${name}: instanceIdOf === entity:rabbi path === entityAnchor id`, async () => {
      const fromMark = await instanceIdOf({ fields: { name } });
      const fromSpine = talmudSpines.ref('entity:rabbi', [name])[0];
      const fromAnchor = entityAnchor('entity:rabbi', fromSpine).span[0];
      expect(fromSpine).toBe(fromMark);
      expect((fromAnchor as { path: string[] }).path[0]).toBe(fromMark);
    });
  }

  it('place names agree the same way', async () => {
    const fromMark = await instanceIdOf({ fields: { name: 'Pumbedita' } });
    expect(talmudSpines.ref('entity:place', ['Pumbedita'])[0]).toBe(fromMark);
  });
});

describe('the global enrichment cache key is unchanged by the lift', () => {
  it('rabbi.bio keys by instance alone (no daf), matching the entity id', async () => {
    const def = findCodeEnrichment('rabbi.bio');
    expect(def, 'rabbi.bio def').not.toBeNull();
    expect((def as { scope: string }).scope).toBe('global');

    const id = await instanceIdOf({ fields: { name: 'Rav Huna' } });
    // global scope => no daf passed; the key is enrich:rabbi.bio:<v>:<id>.
    const key = keyForEnrichment(def!, id);
    expect(key).toBe(
      `enrich:rabbi.bio:${(def as { cache_version: string }).cache_version}:rav_huna`,
    );
    // and the entity anchor addresses exactly that id.
    expect((entityAnchor('entity:rabbi', id).span[0] as { path: string[] }).path[0]).toBe(
      'rav_huna',
    );
  });

  it('places.profile is global + keyed by instance alone too', async () => {
    const def = findCodeEnrichment('places.profile');
    expect(def, 'places.profile def').not.toBeNull();
    expect((def as { scope: string }).scope).toBe('global');
    const id = await instanceIdOf({ fields: { name: 'Sura' } });
    expect(keyForEnrichment(def!, id)).toBe(
      `enrich:places.profile:${(def as { cache_version: string }).cache_version}:sura`,
    );
  });
});
