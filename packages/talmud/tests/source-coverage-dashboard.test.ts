import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as cacheKeys from '../src/worker/cache-keys';

/**
 * Drift guard: keep the "Source material per daf" coverage dashboard
 * (src/worker/cache-stats.ts → computeCacheStats) in sync with the canonical
 * source-key registry (src/worker/cache-keys.ts).
 *
 * The dashboard hand-builds its source rows and hardcodes each prefix
 * literal (e.g. `countPrefix(cache, 'halacha-refs:v3:')`). cache-keys.ts holds
 * the same prefixes independently (`keyForHalachaRefs` → `halacha-refs:v3:…`).
 * Nothing links the two, so a NEW per-daf source — or a version BUMP on an
 * existing one — can silently land in cache-keys.ts while the dashboard keeps
 * counting the old prefix (or nothing). That is the exact drift that once made
 * warm-cron probe `sefaria-bundle:v2` while the reader had moved to v5.
 *
 * This test forces a decision for EVERY exported key helper:
 *   - 'dashboard'   → surfaced as a row in computeCacheStats. We derive its
 *                     prefix by calling the helper and assert that exact prefix
 *                     string appears in cache-stats.ts. A version bump in
 *                     cache-keys.ts therefore fails here until cache-stats.ts is
 *                     bumped to match.
 *   - 'not-source'  → legitimately absent from the source panel (derived
 *                     artifact, reverse index, per-ref/per-rabbi cache, the raw
 *                     intermediate fetch behind a surfaced source, or a producer
 *                     key). The `note` records WHY.
 *
 * Adding a `keyFor*`/`prefixFor*` export without classifying it fails the
 * exhaustiveness check below — the developer must then decide whether it belongs
 * on the dashboard.
 */

type Role = 'dashboard' | 'not-source';
interface Classification {
  role: Role;
  /** Why a 'not-source' key is excluded, or a label for a 'dashboard' source.
   *  Notes starting with "CANDIDATE:" flag real per-daf source content that is
   *  not yet surfaced but could be added as a dashboard row. */
  note: string;
}

// Every `keyFor*` / `prefixFor*` exported from cache-keys.ts, classified. Keep
// this exhaustive — the test fails if an export is missing or stale.
const CLASSIFICATION: Record<string, Classification> = {
  // --- Surfaced on the dashboard (computeCacheStats `sources`) ---------------
  keyForHebrewBooks: { role: 'dashboard', note: 'HB daf page text' },
  keyForGemara: { role: 'dashboard', note: 'Sefaria aligned daf text (gemara context)' },
  keyForCommentaries: { role: 'dashboard', note: 'Sefaria Rashi + Tosafot (commentaries context)' },
  keyForRishonim: { role: 'dashboard', note: 'Sefaria Rishonim' },
  keyForMishnaBundle: { role: 'dashboard', note: 'Sefaria Mishnah' },
  keyForYerushalmi: { role: 'dashboard', note: 'Sefaria Yerushalmi parallels' },
  keyForHalachaRefs: { role: 'dashboard', note: 'Sefaria halacha refs' },
  keyForDafTopics: { role: 'dashboard', note: 'Sefaria topics' },
  keyForDafyomi: {
    role: 'dashboard',
    note: 'dafyomi.co.il corpus (per-daf, sub-types fanned out)',
  },

  // --- Raw intermediate fetches behind a surfaced source --------------------
  keyForSefariaBundle: {
    role: 'not-source',
    note: 'raw Sefaria page bundle — rolled into the gemara row',
  },
  keyForSefariaSegments: {
    role: 'not-source',
    note: 'raw Sefaria segments — rolled into the gemara row',
  },

  // --- Per-daf source content NOT yet surfaced (candidates to add) ----------
  keyForTalmudParallels: {
    role: 'not-source',
    note: 'CANDIDATE: Mesorat HaShas Talmud↔Talmud parallels (Sefaria) — per-daf, not surfaced',
  },
  keyForCommentaryWorks: {
    role: 'not-source',
    note: 'CANDIDATE: per-daf commentary-spine works list (Sefaria) — not surfaced',
  },
  keyForMesorah: {
    role: 'not-source',
    note: 'CANDIDATE: per-daf rabbi-transmission mesorah (Sefaria) — not surfaced',
  },

  // --- Per-ref caches (not keyed per daf) -----------------------------------
  keyForSaCommentary: { role: 'not-source', note: 'per-ref Shulchan Aruch commentary text' },
  keyForCommentaryText: { role: 'not-source', note: 'per-ref commentary text' },
  keyForPasuk: { role: 'not-source', note: 'per-ref Tanach verse text' },

  // --- Derived artifacts / views (not raw fetched source) -------------------
  keyForAnalyzeSkeleton: { role: 'not-source', note: 'derived section skeleton (analyze)' },
  keyForRegion: { role: 'not-source', note: 'derived geographic classification' },
  keyForReferences: { role: 'not-source', note: 'derived cross-references' },
  keyForBridge: { role: 'not-source', note: 'derived cross-daf continuity flag' },
  keyForCrossFlow: { role: 'not-source', note: 'derived cross-daf section flow' },
  keyForSpineLinks: { role: 'not-source', note: 'derived whole-tractate link graph' },
  keyForSpineView: { role: 'not-source', note: 'derived whole-tractate spine view shelf' },
  keyForSpineViewAcc: { role: 'not-source', note: 'internal spine-view accumulator' },
  keyForCodeSources: { role: 'not-source', note: 'reverse code-ref → sources index' },
  keyForCtxMatch: { role: 'not-source', note: 'derived AI context placement' },
  keyForTranslate: { role: 'not-source', note: 'derived per-word translation' },
  keyForHebraize: { role: 'not-source', note: 'derived hebraised string' },

  // --- daf → pieces reverse index (the inspector read side) -----------------
  keyForDafIndex: { role: 'not-source', note: 'daf → pieces reverse index entry' },
  prefixForDafIndex: { role: 'not-source', note: 'daf → pieces reverse index prefix' },
  keyForDafIndexDone: { role: 'not-source', note: 'daf-index completion sentinel' },

  // --- Rabbi enrichment shelves (reported in the dashboard "Rabbis" section) -
  keyForRabbiEnriched: { role: 'not-source', note: 'per-rabbi enrichment shelf' },
  keyForRabbiWikidata: { role: 'not-source', note: 'per-rabbi Wikidata shelf' },
  keyForRabbiWikiBio: { role: 'not-source', note: 'per-rabbi Wikipedia bio shelf' },
  keyForRabbiBioBySlug: { role: 'not-source', note: 'per-rabbi global bio enrichment' },
  keyForRabbiBioOnDaf: { role: 'not-source', note: 'per-rabbi per-daf bio synthesis' },
  keyForRabbiGraph: { role: 'not-source', note: 'rabbi aggregate blob' },
  keyForRabbiCohort: { role: 'not-source', note: 'rabbi aggregate blob' },
  keyForRabbiPlacesIndex: { role: 'not-source', note: 'rabbi aggregate blob' },
  keyForRabbiAcademyRoster: { role: 'not-source', note: 'rabbi aggregate blob' },
  keyForRabbiObs: { role: 'not-source', note: 'rabbi-observations slice' },
  keyForRabbiObsDirty: { role: 'not-source', note: 'rabbi-observations dirty marker' },
  prefixForRabbiObs: { role: 'not-source', note: 'rabbi-observations list prefix' },

  // --- Producer keys re-exported from @corpus/core --------------------------
  keyForMark: { role: 'not-source', note: 'corpus-agnostic producer key (core)' },
  keyForEnrichment: { role: 'not-source', note: 'corpus-agnostic producer key (core)' },
};

/** All `keyFor*` / `prefixFor*` exports, auto-discovered so new ones surface. */
const exportedKeyHelpers = Object.keys(cacheKeys)
  .filter((name) => name.startsWith('keyFor') || name.startsWith('prefixFor'))
  .sort();

/** A key's listing prefix = everything up to and including its `vN` segment,
 *  plus a trailing colon — matching how computeCacheStats calls countPrefix. */
function prefixOf(key: string): string {
  const segs = key.split(':');
  const vIdx = segs.findIndex((s) => /^v\d+$/.test(s));
  if (vIdx < 0) throw new Error(`no version segment in key "${key}"`);
  return `${segs.slice(0, vIdx + 1).join(':')}:`;
}

const cacheStatsSrc = readFileSync(
  fileURLToPath(new URL('../src/worker/cache-stats.ts', import.meta.url)),
  'utf8',
);

describe('source coverage dashboard ↔ cache-keys drift guard', () => {
  it('classifies every exported key helper (no unclassified additions)', () => {
    const unclassified = exportedKeyHelpers.filter((n) => !(n in CLASSIFICATION));
    expect(
      unclassified,
      `New source-key helper(s) added to cache-keys.ts but not classified in this test. ` +
        `Decide whether each belongs on the coverage dashboard (cache-stats.ts) and add it to ` +
        `CLASSIFICATION as 'dashboard' or 'not-source': ${unclassified.join(', ')}`,
    ).toEqual([]);
  });

  it('has no stale classification entries (every classified helper still exists)', () => {
    const stale = Object.keys(CLASSIFICATION).filter((n) => !exportedKeyHelpers.includes(n));
    expect(
      stale,
      `Classified helper(s) no longer exported from cache-keys.ts: ${stale.join(', ')}`,
    ).toEqual([]);
  });

  it('counts every dashboard source by the exact prefix cache-keys.ts produces', () => {
    const missing: string[] = [];
    for (const name of exportedKeyHelpers) {
      if (CLASSIFICATION[name]?.role !== 'dashboard') continue;
      const fn = (cacheKeys as Record<string, unknown>)[name] as (t: string, p: string) => string;
      const prefix = prefixOf(fn('ZzT', 'ZzP'));
      // Match the QUOTED literal cache-stats.ts passes to countPrefix/sampleAligned,
      // so a prefix that is a substring of a longer counted prefix (e.g.
      // `commentaries:v1:` inside `ctx:commentaries:v1:`) can't give a false pass.
      if (!cacheStatsSrc.includes(`'${prefix}'`)) missing.push(`${name} → "${prefix}"`);
    }
    expect(
      missing,
      `The coverage dashboard (cache-stats.ts) does not count these dashboard sources at the ` +
        `prefix cache-keys.ts currently produces (a new source or an un-mirrored version bump). ` +
        `Add/update the matching countPrefix() + SourceRow in computeCacheStats: ${missing.join('; ')}`,
    ).toEqual([]);
  });
});
