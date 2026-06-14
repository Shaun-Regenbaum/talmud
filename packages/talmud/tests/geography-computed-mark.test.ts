// The `geography` computed mark — assembles its DafGeoModel SERVER-SIDE from
// cached inputs only (the rabbi + places marks + the global rabbi.geography
// enrichment). Seeds a Map-backed KV with those inputs and asserts the instance
// body shape. No LLM, no network — the compute fn can never spin.

import { describe, expect, it } from 'vitest';
import { instanceIdOf, keyForEnrichment, keyForMark } from '../src/worker/cache-keys';
import { CODE_ENRICHMENTS, CODE_MARKS } from '../src/worker/code-marks';
import { computeGeographyModel } from '../src/worker/index';
import type { Bindings } from '../src/worker/types';

const RABBI_DEF = CODE_MARKS.find((m) => m.id === 'rabbi')!;
const PLACES_DEF = CODE_MARKS.find((m) => m.id === 'places')!;
const GEO_ENRICH_DEF = CODE_ENRICHMENTS.find((e) => e.id === 'rabbi.geography')!;

function envWith(seed: Record<string, string>): Bindings {
  const store = new Map(Object.entries(seed));
  const kv = {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => void store.set(k, v),
    delete: async (k: string) => void store.delete(k),
    list: async () => ({ keys: [], list_complete: true, cursor: '' }),
    getWithMetadata: async () => ({ value: null, metadata: null }),
  };
  return { CACHE: kv as unknown as KVNamespace } as unknown as Bindings;
}

// A cached run envelope is `{ parsed }` — readMarkInstances reads parsed.instances,
// readGlobalPieceFirst reads parsed.
const env = (parsed: unknown) => JSON.stringify({ parsed });

describe('geography computed mark — computeGeographyModel', () => {
  it('builds a model from the seeded rabbi + places marks (registry identity)', async () => {
    const t = 'Berakhot';
    const p = '2a';
    const seed: Record<string, string> = {
      // Rav Huna is in the registry (places: ['Sura'], region: bavel) — placed
      // by the deterministic identity, no rabbi.geography enrichment needed.
      [keyForMark(RABBI_DEF, t, p, 'en')]: env({
        instances: [{ fields: { name: 'Rav Huna', nameHe: 'רב הונא', slug: 'rav-huna' } }],
      }),
      // On-daf place mentions — Sura twice, plus an alias that maps to Tzipori.
      [keyForMark(PLACES_DEF, t, p, 'en')]: env({
        instances: [
          { fields: { name: 'Sura' } },
          { fields: { name: 'Sura' } },
          { fields: { name: 'Sepphoris' } },
        ],
      }),
    };

    const out = await computeGeographyModel(envWith(seed), t, p);
    expect(out.instances).toHaveLength(1);
    const model = out.instances[0].fields.model as {
      empty: boolean;
      bavelCount: number;
      dots: Array<{ city: { name: string }; rabbis: { name: string }[]; mentions: number }>;
    };
    expect(model.empty).toBe(false);
    // Rav Huna lands on Sura (registry); Sura is mentioned twice.
    const sura = model.dots.find((d) => d.city.name === 'Sura');
    expect(sura?.rabbis.map((r) => r.name)).toEqual(['Rav Huna']);
    expect(sura?.mentions).toBe(2);
    // The "Sepphoris" mention maps to the canonical Tzipori dot.
    expect(model.dots.some((d) => d.city.name === 'Tzipori')).toBe(true);
    expect(model.bavelCount).toBe(1);
  });

  it('merges the cached rabbi.geography enrichment for a non-registry rabbi', async () => {
    const t = 'Berakhot';
    const p = '3a';
    // A made-up rabbi NOT in rabbi-places (so identity gives no city); the
    // cached rabbi.geography enrichment supplies the study place.
    const markInput = { name: 'Rav Geofake', nameHe: '' };
    const seed: Record<string, string> = {
      [keyForMark(RABBI_DEF, t, p, 'en')]: env({
        instances: [{ fields: { name: 'Rav Geofake', nameHe: '' } }],
      }),
      [keyForMark(PLACES_DEF, t, p, 'en')]: env({ instances: [] }),
      [keyForEnrichment(GEO_ENRICH_DEF, await instanceIdOf(markInput))]: env({
        primaryStudyPlaces: [{ place: 'Tiberias' }],
        notablePlaces: [],
        movements: [{ from: 'Bavel', to: 'Eretz Yisrael' }],
      }),
    };

    const out = await computeGeographyModel(envWith(seed), t, p);
    const model = out.instances[0].fields.model as {
      empty: boolean;
      israelCount: number;
      dots: Array<{ city: { name: string }; rabbis: { name: string }[] }>;
      moverRows: Array<{ name: string; direction: string }>;
    };
    expect(model.empty).toBe(false);
    const tiberias = model.dots.find((d) => d.city.name === 'Tiberias');
    expect(tiberias?.rabbis.map((r) => r.name)).toEqual(['Rav Geofake']);
    expect(model.israelCount).toBe(1);
    // The Bavel→Eretz Yisrael movement is derived into a migration row.
    expect(model.moverRows).toEqual([
      { name: 'Rav Geofake', slug: null, direction: 'bavel->israel' },
    ]);
  });

  it('buckets an ungrounded rabbi by its instance generation (no place, no enrichment)', async () => {
    const t = 'Berakhot';
    const p = '8a';
    // A made-up rabbi NOT in rabbi-places (no identity place/region) and NO
    // cached rabbi.geography — only an instance `generation`. The generation
    // fallback buckets him into a region instead of dropping him off the map.
    const seed: Record<string, string> = {
      [keyForMark(RABBI_DEF, t, p, 'en')]: env({
        instances: [
          { fields: { name: 'Rav Bavelfake', nameHe: '', generation: 'amora-bavel-3' } },
          { fields: { name: 'Rabbi Eyfake', nameHe: '', generation: 'amora-ey-2' } },
          // unknown generation, not in registry → stays dropped.
          { fields: { name: 'Anonfake', nameHe: '', generation: 'unknown' } },
        ],
      }),
      [keyForMark(PLACES_DEF, t, p, 'en')]: env({ instances: [] }),
    };
    const out = await computeGeographyModel(envWith(seed), t, p);
    const model = out.instances[0].fields.model as {
      empty: boolean;
      unspecifiedBavel: Array<{ name: string }>;
      unspecifiedIsrael: Array<{ name: string }>;
      dots: unknown[];
    };
    expect(model.empty).toBe(false);
    expect(model.dots).toEqual([]);
    expect(model.unspecifiedBavel.map((r) => r.name)).toEqual(['Rav Bavelfake']);
    expect(model.unspecifiedIsrael.map((r) => r.name)).toEqual(['Rabbi Eyfake']);
  });

  it('a daf of only unknown-generation, non-registry rabbis is genuinely empty', async () => {
    const t = 'Berakhot';
    const p = '9a';
    const seed: Record<string, string> = {
      [keyForMark(RABBI_DEF, t, p, 'en')]: env({
        instances: [{ fields: { name: 'Anonfake', nameHe: '', generation: 'unknown' } }],
      }),
      [keyForMark(PLACES_DEF, t, p, 'en')]: env({ instances: [] }),
    };
    const out = await computeGeographyModel(envWith(seed), t, p);
    const model = out.instances[0].fields.model as { empty: boolean };
    expect(model.empty).toBe(true);
  });

  it('returns an empty model when nothing is cached', async () => {
    const out = await computeGeographyModel(envWith({}), 'Berakhot', '4a');
    const model = out.instances[0].fields.model as { empty: boolean };
    expect(model.empty).toBe(true);
  });

  // FINDING 2 (homonym): identity must come from the grounded SLUG (direct
  // dataset join), NOT a name re-resolution (first-wins, homonym-blind). The
  // registry has two "Rabbi Shimon b. Lakish": rabbi-shimon-b-lakish (placed at
  // Tiberias — the one name-resolution always returns) and
  // rabbi-shimon-b-lakish-2 (no places). A daf grounded to slug -2 must NOT be
  // placed at Tiberias (which is bearer #1's place); a name re-resolve would.
  it('places the SLUG-stamped homonym, not the first same-name bearer', async () => {
    const t = 'Berakhot';
    const p = '5a';
    const seed: Record<string, string> = {
      [keyForMark(RABBI_DEF, t, p, 'en')]: env({
        instances: [
          {
            fields: {
              // Bare name (no distinguishing nameHe) → name re-resolution lands
              // on bearer #1 (rabbi-shimon-b-lakish, placed at Tiberias). The
              // grounded slug points at bearer #2 — the slug-join must win.
              name: 'Rabbi Shimon b. Lakish',
              nameHe: '',
              // Grounded to bearer #2 (the place-less homonym).
              slug: 'rabbi-shimon-b-lakish-2',
            },
          },
        ],
      }),
      // A real place mention so the model isn't trivially empty.
      [keyForMark(PLACES_DEF, t, p, 'en')]: env({
        instances: [{ fields: { name: 'Sura' } }],
      }),
    };

    const out = await computeGeographyModel(envWith(seed), t, p);
    const model = out.instances[0].fields.model as {
      dots: Array<{ city: { name: string }; rabbis: { name: string }[] }>;
    };
    // Bearer #2 has no registry place → must NOT be planted on Tiberias.
    const tiberias = model.dots.find((d) => d.city.name === 'Tiberias');
    expect(tiberias?.rabbis.map((r) => r.name) ?? []).not.toContain('Rabbi Shimon b. Lakish');
    // (Sanity: the name-resolution path WOULD have placed him at Tiberias.)
  });

  // FINDING 1 (cold-daf not-ready): the geography mark declares deps on the
  // rabbi + places marks, but on a cold daf the client enables all marks
  // concurrently. If geography wins the race, a dep mark's CACHE ENTRY is absent
  // (vs. an entry with empty instances = a genuinely rabbi-less daf). An absent
  // dep ⇒ the model is not-ready and must be served `transient` (not pinned to
  // the EN key — a no-LLM computed mark would never recompute an empty model).
  it('marks the model transient when a declared dep ENTRY is absent (cold race)', async () => {
    const t = 'Berakhot';
    const p = '6a';
    // places is seeded (entry present), rabbi is NOT (entry absent) → not ready.
    const seed: Record<string, string> = {
      [keyForMark(PLACES_DEF, t, p, 'en')]: env({ instances: [{ fields: { name: 'Sura' } }] }),
    };
    const out = await computeGeographyModel(envWith(seed), t, p);
    expect(out.transient).toBe(true);
    // It still renders SOMETHING from what's cached (place mention present).
    expect(out.instances).toHaveLength(1);
  });

  it('caches normally (non-transient) when both dep entries exist, even if empty', async () => {
    const t = 'Berakhot';
    const p = '7a';
    // Both entries present; rabbi has empty instances = a genuinely rabbi-less
    // daf, NOT a race. This is a real result and must be cached normally.
    const seed: Record<string, string> = {
      [keyForMark(RABBI_DEF, t, p, 'en')]: env({ instances: [] }),
      [keyForMark(PLACES_DEF, t, p, 'en')]: env({ instances: [{ fields: { name: 'Sura' } }] }),
    };
    const out = await computeGeographyModel(envWith(seed), t, p);
    expect(out.transient).toBeUndefined();
  });
});
