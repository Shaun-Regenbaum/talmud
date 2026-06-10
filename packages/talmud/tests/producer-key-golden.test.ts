import { describe, expect, it } from 'vitest';
import {
  instanceIdOf,
  keyForEnrichment,
  keyForMark,
  qualifierHash,
} from '../src/worker/cache-keys';
import { CODE_ENRICHMENTS, CODE_MARKS } from '../src/worker/code-marks';
import { cacheKeyForRunBody } from '../src/worker/index';
import type { Bindings } from '../src/worker/types';

// CHARACTERIZATION GOLDEN: the literal KV cache key for EVERY code-registry
// producer, computed for a fixed daf + fixed instances, in both languages.
// A refactor of the key derivation (or of any def's id / cache_version /
// scope / Hebrew-prompt presence) shows up as a snapshot diff = the exact
// blast radius of unreachable cache entries. Review such a diff deliberately;
// never just `vitest -u` it away.

const DAF = { tractate: 'Berakhot', page: '5a' } as const;

/** Named instance — exercises the fields.name → slug branch of instanceIdOf. */
const NAMED_INSTANCE = { fields: { name: 'Abaye' } };
/** Whole-daf instance — no usable label, no stable anchor fields, so
 *  instanceIdOf falls through to sha256(JSON.stringify(markInput)).slice(12).
 *  This snapshot locks that hash fallback byte-for-byte. */
const WHOLE_DAF_INSTANCE = { fields: {} };

describe('producer cache-key golden (Berakhot 5a)', () => {
  it('every CODE_MARKS + CODE_ENRICHMENTS key is stable', async () => {
    const lines: string[] = [];

    // --- Marks: en key, plus he resolved THE WAY PRODUCTION DOES.
    // Mirrors cacheKeyForRunBody in src/worker/index.ts: a lang='he' request
    // only gets the ':he' namespace when the mark's extractor declares a
    // system_prompt_he; otherwise the he request keys onto the en entry.
    for (const def of [...CODE_MARKS].sort((a, b) => a.id.localeCompare(b.id))) {
      const ext = def.extractor as { system_prompt_he?: string };
      const heResolved: 'en' | 'he' = ext.system_prompt_he ? 'he' : 'en';
      lines.push(
        `${def.id}@${def.cache_version} mark lang=en  ${keyForMark(def, DAF.tractate, DAF.page, 'en')}`,
      );
      lines.push(
        `${def.id}@${def.cache_version} mark lang=he->${heResolved} ${keyForMark(def, DAF.tractate, DAF.page, heResolved)}`,
      );
    }

    // --- Enrichments: named + whole-daf instance, en + he, daf applied per
    // def.scope exactly as production does (cacheKeyForRunBody /
    // runEnrichmentOnce both pass the daf ONLY for scope='local'; 'global'
    // omits it, and a 'spine' def would throw inside keyForEnrichment — none
    // exist in the code registry today, which this would surface loudly).
    const namedId = await instanceIdOf(NAMED_INSTANCE);
    const wholeDafId = await instanceIdOf(WHOLE_DAF_INSTANCE);
    for (const def of [...CODE_ENRICHMENTS].sort((a, b) => a.id.localeCompare(b.id))) {
      const dafForKey = def.scope === 'local' ? DAF : undefined;
      for (const [instLabel, instanceId] of [
        ['named', namedId],
        ['daf', wholeDafId],
      ] as const) {
        for (const lang of ['en', 'he'] as const) {
          lines.push(
            `${def.id}@${def.cache_version} enrich inst=${instLabel} lang=${lang} ${keyForEnrichment(def, instanceId, dafForKey, undefined, lang)}`,
          );
        }
      }
    }

    // --- One representative QUALIFIED key: a `.qa` enrichment keyed by a
    // user question through qualifierHash (normalize → sha256 → 12 hex).
    const qa = CODE_ENRICHMENTS.find((e) => e.id.endsWith('.qa'));
    expect(qa, 'expected at least one .qa enrichment in the registry').toBeTruthy();
    if (qa) {
      const qHash = await qualifierHash('What is the halacha?');
      const dafForKey = qa.scope === 'local' ? DAF : undefined;
      lines.push(
        `${qa.id}@${qa.cache_version} enrich inst=named lang=en q="What is the halacha?" ${keyForEnrichment(qa, namedId, dafForKey, qHash, 'en')}`,
      );
    }

    lines.sort();
    expect(lines).toMatchSnapshot();
  });

  it('the fixed instance ids backing the golden keys are themselves stable', async () => {
    // If instanceIdOf changes, the golden snapshot above changes too — this
    // just makes the cause obvious in the failure output.
    expect(await instanceIdOf(NAMED_INSTANCE)).toBe('abaye');
    expect(await instanceIdOf(WHOLE_DAF_INSTANCE)).toMatch(/^[0-9a-f]{12}$/);
  });

  it('the REAL production derivation (cacheKeyForRunBody) agrees with every golden key', async () => {
    // The golden lines above replicate cacheKeyForRunBody's lang rule so they
    // can run registry-wide without an env. This block closes the gap Codex
    // flagged: it drives the actual production function (empty KV → code-def
    // fallback, the same defs) and asserts byte-parity, so a refactor cannot
    // change production key derivation while the golden stays green.
    const env = { CACHE: { get: async () => null } } as unknown as Bindings;

    for (const def of CODE_MARKS) {
      const ext = def.extractor as { system_prompt_he?: string };
      for (const lang of ['en', 'he'] as const) {
        const { key, defKind } = await cacheKeyForRunBody(env, {
          runId: 'parity',
          mark_id: def.id,
          tractate: DAF.tractate,
          page: DAF.page,
          lang,
        });
        const resolved = lang === 'he' && ext.system_prompt_he ? 'he' : 'en';
        expect(defKind).toBe('mark');
        expect(key, `${def.id} lang=${lang}`).toBe(
          keyForMark(def, DAF.tractate, DAF.page, resolved),
        );
      }
    }

    const namedId = await instanceIdOf(NAMED_INSTANCE);
    for (const def of CODE_ENRICHMENTS) {
      const dafForKey = def.scope === 'local' ? DAF : undefined;
      for (const lang of ['en', 'he'] as const) {
        const { key, defKind } = await cacheKeyForRunBody(env, {
          runId: 'parity',
          enrichment_id: def.id,
          tractate: DAF.tractate,
          page: DAF.page,
          mark_input: NAMED_INSTANCE,
          lang,
        });
        expect(defKind).toBe('enrichment');
        expect(key, `${def.id} lang=${lang}`).toBe(
          keyForEnrichment(def, namedId, dafForKey, undefined, lang),
        );
      }
    }

    // Qualified key parity (user_question → qualifierHash) for the same .qa
    // enrichment the golden snapshot records.
    const qa = CODE_ENRICHMENTS.find((e) => e.id.endsWith('.qa'));
    if (qa) {
      const { key } = await cacheKeyForRunBody(env, {
        runId: 'parity',
        enrichment_id: qa.id,
        tractate: DAF.tractate,
        page: DAF.page,
        mark_input: NAMED_INSTANCE,
        user_question: 'What is the halacha?',
      });
      const qHash = await qualifierHash('What is the halacha?');
      expect(key).toBe(
        keyForEnrichment(qa, namedId, qa.scope === 'local' ? DAF : undefined, qHash, 'en'),
      );
    }
  });
});
