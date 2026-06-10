/**
 * Store-vs-legacy key parity over the REAL registry — the load-bearing proof
 * for the migration: for EVERY code-defined mark and enrichment, the new
 * ArtifactStore (talmudLegacyKeyScheme over the projected Producer) derives a
 * key byte-equal to the legacy derivation (keyForMark / keyForEnrichment),
 * with the same fixtures as producer-key-golden.test.ts: Berakhot 5a, the
 * named 'abaye' instance, the whole-daf hash instance, en + he, and the
 * qualified `.qa` case. If this is green, adopting the store cannot cold-miss
 * a single production KV entry.
 */

import { producerFromEnrichment, producerFromMark } from '@corpus/core/model/compat';
import { ArtifactStore, type KVStore } from '@corpus/core/store/artifact-store';
import { talmudLegacyKeyScheme } from '@corpus/core/store/key-schemes';
import { describe, expect, it } from 'vitest';
import {
  instanceIdOf,
  keyForEnrichment,
  keyForMark,
  qualifierHash,
} from '../src/worker/cache-keys';
import { CODE_ENRICHMENTS, CODE_MARKS } from '../src/worker/code-marks';

const DAF = { tractate: 'Berakhot', page: '5a' } as const;
const UNIT = { work: DAF.tractate, unit: DAF.page };
const NAMED_INSTANCE = { fields: { name: 'Abaye' } };
const WHOLE_DAF_INSTANCE = { fields: {} };

const noopKV: KVStore = {
  get: async () => null,
  put: async () => {},
  delete: async () => {},
};
const store = new ArtifactStore(noopKV, talmudLegacyKeyScheme());

describe('ArtifactStore.keyFor parity with the legacy derivation (Berakhot 5a)', () => {
  it('every CODE_MARKS def, en + he (with the production he-collapse rule)', () => {
    // Parity target is the PRODUCTION derivation (cacheKeyForRunBody), not a
    // bare keyForMark(lang): a lang='he' request keys onto ':he' only when the
    // def declares system_prompt_he, else it collapses to the English key.
    // The store implements this via hasHePrompt derived from the producer's
    // recipe, so passing the full projected Producer must reproduce it.
    expect(CODE_MARKS.length).toBeGreaterThan(0);
    let heCollapsed = 0;
    let heKept = 0;
    for (const def of CODE_MARKS) {
      const producer = producerFromMark(def);
      const ext = def.extractor as { system_prompt_he?: string };
      for (const lang of ['en', 'he'] as const) {
        const resolved = lang === 'he' && ext.system_prompt_he ? 'he' : 'en';
        if (lang === 'he') resolved === 'he' ? heKept++ : heCollapsed++;
        expect(store.keyFor(producer, { unit: UNIT, lang }), `${def.id} lang=${lang}`).toBe(
          keyForMark(def, DAF.tractate, DAF.page, resolved),
        );
      }
    }
    // The registry exercises BOTH branches of the rule (otherwise this test
    // proves less than it claims).
    expect(heCollapsed).toBeGreaterThan(0);
    expect(heKept).toBeGreaterThan(0);
  });

  it('every CODE_ENRICHMENTS def, named + whole-daf instance, en + he', async () => {
    expect(CODE_ENRICHMENTS.length).toBeGreaterThan(0);
    const namedId = await instanceIdOf(NAMED_INSTANCE);
    const wholeDafId = await instanceIdOf(WHOLE_DAF_INSTANCE);
    expect(namedId).toBe('abaye');
    for (const def of CODE_ENRICHMENTS) {
      const producer = producerFromEnrichment(def);
      // The legacy call sites (cacheKeyForRunBody / runEnrichmentOnce) pass the
      // daf ONLY for scope='local'; the store passes addr.unit always and the
      // scheme applies it per scope — parity proves the two agree.
      const dafForKey = def.scope === 'local' ? DAF : undefined;
      for (const instanceId of [namedId, wholeDafId]) {
        for (const lang of ['en', 'he'] as const) {
          expect(
            store.keyFor(producer, { instanceId, unit: UNIT, lang }),
            `${def.id} inst=${instanceId} lang=${lang}`,
          ).toBe(keyForEnrichment(def, instanceId, dafForKey, undefined, lang));
        }
      }
    }
  });

  it('the qualified .qa case (user question through qualifierHash)', async () => {
    const qa = CODE_ENRICHMENTS.find((e) => e.id.endsWith('.qa'));
    expect(qa, 'expected at least one .qa enrichment in the registry').toBeTruthy();
    if (!qa) return;
    const namedId = await instanceIdOf(NAMED_INSTANCE);
    const qHash = await qualifierHash('What is the halacha?');
    const producer = producerFromEnrichment(qa);
    expect(store.keyFor(producer, { instanceId: namedId, unit: UNIT, qualifier: qHash })).toBe(
      keyForEnrichment(qa, namedId, qa.scope === 'local' ? DAF : undefined, qHash, 'en'),
    );
  });
});
