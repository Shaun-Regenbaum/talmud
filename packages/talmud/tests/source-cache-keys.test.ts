import { describe, expect, it } from 'vitest';
import {
  keyForAnalyzeSkeleton,
  keyForBridge,
  keyForCommentaryText,
  keyForCommentaryWorks,
  keyForCtxMatch,
  keyForDafTopics,
  keyForHalachaRefs,
  keyForHebraize,
  keyForHebrewBooks,
  keyForMesorah,
  keyForMishnaBundle,
  keyForPasuk,
  keyForRabbiAcademyRoster,
  keyForRabbiBioBySlug,
  keyForRabbiBioOnDaf,
  keyForRabbiCohort,
  keyForRabbiEnriched,
  keyForRabbiGraph,
  keyForRabbiObs,
  keyForRabbiObsDirty,
  keyForRabbiPlacesIndex,
  keyForRabbiWikiBio,
  keyForRabbiWikidata,
  keyForReferences,
  keyForRegion,
  keyForRishonim,
  keyForSaCommentary,
  keyForSefariaBundle,
  keyForSefariaSegments,
  keyForSpineLinks,
  keyForSpineView,
  keyForSpineViewAcc,
  keyForTalmudParallels,
  keyForTranslate,
  keyForYerushalmi,
  prefixForRabbiObs,
} from '../src/worker/cache-keys';

// These keys address a TTL-bounded but huge KV namespace already populated across
// much of Shas. The string each helper returns is a HARD CONTRACT: change a
// version digit, the separator, or "normalise" the raw tractate/page (e.g. to a
// slug) and every cached daf cold-misses and re-fetches upstream. This test pins
// the exact bytes so any such change is a deliberate, reviewed edit — not a
// silent regression. (Centralising these also fixed warm-cron.ts, which had
// drifted to probing sefaria-bundle:v2 while the reader moved to v5.)
describe('source-cache keys — byte-exact contract', () => {
  const t = 'Berakhot',
    p = '2a';
  it('reproduces every key exactly, raw tractate:page (no slug)', () => {
    expect(keyForHebrewBooks(t, p)).toBe('hb:v2:Berakhot:2a');
    expect(keyForSefariaBundle(t, p)).toBe('sefaria-bundle:v5:Berakhot:2a');
    expect(keyForSefariaSegments(t, p)).toBe('sefaria-seg:v1:Berakhot:2a');
    expect(keyForRishonim(t, p)).toBe('rishonim:v4:Berakhot:2a');
    expect(keyForHalachaRefs(t, p)).toBe('halacha-refs:v3:Berakhot:2a');
    expect(keyForDafTopics(t, p)).toBe('daf-topics:v1:Berakhot:2a');
    expect(keyForMishnaBundle(t, p)).toBe('mishna-bundle:v1:Berakhot:2a');
    expect(keyForYerushalmi(t, p)).toBe('yerushalmi:v1:Berakhot:2a');
    expect(keyForTalmudParallels(t, p)).toBe('talmud-parallels:v1:Berakhot:2a');
    expect(keyForSaCommentary('Mishnah_Berurah_1:1')).toBe('sa-commentary:v1:Mishnah_Berurah_1:1');
  });
  it('keeps a space/upper-case tractate in the key verbatim (the cold-miss trap)', () => {
    expect(keyForSefariaBundle('Bava Kamma', '2a')).toBe('sefaria-bundle:v5:Bava Kamma:2a');
    expect(keyForRishonim('Bava Kamma', '117b')).toBe('rishonim:v4:Bava Kamma:117b');
  });
});

// Per-daf analysis + per-rabbi enrichment keys, centralised out of index.ts where
// each was hand-built at 2-4 sites (the drift hazard). Same byte-exact contract.
describe('analysis + rabbi enrichment keys — byte-exact contract', () => {
  it('per-rabbi keys use the raw normalised slug', () => {
    expect(keyForRabbiEnriched('rabbi_yochanan')).toBe('rabbi-enriched:v1:rabbi_yochanan');
    expect(keyForRabbiWikidata('rabbi_yochanan')).toBe('rabbi-wikidata:v1:rabbi_yochanan');
    expect(keyForRabbiWikiBio('rabbi_yochanan')).toBe('rabbi-wiki-bio:v1:rabbi_yochanan');
  });
  it('per-daf analysis keys use raw tractate:page', () => {
    expect(keyForAnalyzeSkeleton('Bava Kamma', '2a')).toBe('analyze-skel:v2:Bava Kamma:2a');
    expect(keyForRegion('Berakhot', '2a')).toBe('region:v1:Berakhot:2a');
    expect(keyForMesorah('Berakhot', '2a')).toBe('mesorah:v1:Berakhot:2a');
  });
});

// Commentary-spine + bridge caches. Commentary/refs use raw tractate:page; the
// bridge SLUG-normalises (lowercase, then any run not in [a-z0-9.-] -> '_') — a
// distinct shape that must be preserved exactly, since the cached entries used it.
describe('commentary-spine + bridge keys — byte-exact contract', () => {
  it('commentary/refs use raw tractate:page; commentary-text uses the raw sourceRef', () => {
    expect(keyForCommentaryWorks('Berakhot', '2a')).toBe('commentaries:v1:Berakhot:2a');
    expect(keyForReferences('Berakhot', '2a')).toBe('refs:v1:Berakhot:2a');
    expect(keyForCommentaryText('Rashi on Berakhot 2a:1')).toBe(
      'commentary-tx:v1:Rashi on Berakhot 2a:1',
    );
  });
  it('the bridge key slug-normalises tractate AND page (lowercase, non-alnum -> _)', () => {
    expect(keyForBridge('Berakhot', '2a')).toBe('bridge:v1:berakhot:2a');
    expect(keyForBridge('Bava Kamma', '117b')).toBe('bridge:v1:bava_kamma:117b');
  });
});

// The last batch: single-site content caches + the rabbi family, centralised
// out of index.ts. Raw interpolation (no slug normalisation) — byte-exact.
describe('content + rabbi caches — byte-exact contract', () => {
  it('content keys: pasuk / ctx-match / translate / hebraize', () => {
    expect(keyForPasuk('Genesis 1:1')).toBe('pasuk:v4:Genesis 1:1');
    expect(keyForCtxMatch('Berakhot', '2a', 'abc123')).toBe('ctx-match:v2:Berakhot:2a:abc123');
    // translate: ctxHash already carries its own leading separator.
    expect(keyForTranslate('Berakhot', '2a', 'שלום', ':deadbeef')).toBe(
      'translate:v3:Berakhot:2a:שלום:deadbeef',
    );
    expect(keyForHebraize('ff00aa')).toBe('hebraize:v2:ff00aa');
  });
  it('rabbi-bio: the slug-only and per-daf shapes (incl. the i= include segment)', () => {
    expect(keyForRabbiBioBySlug('abaye')).toBe('rabbi-bio:v1:abaye');
    expect(keyForRabbiBioOnDaf('Berakhot', '2a', 'abaye')).toBe('rabbi-bio:v1:Berakhot:2a:abaye');
    expect(keyForRabbiBioOnDaf('Berakhot', '2a', 'abaye', '')).toBe(
      'rabbi-bio:v1:Berakhot:2a:abaye',
    );
    expect(keyForRabbiBioOnDaf('Berakhot', '2a', 'abaye', 'mesorah,region')).toBe(
      'rabbi-bio:v1:i=mesorah,region:Berakhot:2a:abaye',
    );
  });
  it('rabbi aggregate blobs: fixed keys, no params', () => {
    expect(keyForRabbiGraph()).toBe('rabbi-graph:v1');
    expect(keyForRabbiCohort()).toBe('rabbi-cohort:v1');
    expect(keyForRabbiPlacesIndex()).toBe('rabbi-places-index:v1');
    expect(keyForRabbiAcademyRoster()).toBe('rabbi-academy-roster:v1');
  });
  it('rabbi-observations: per-(rabbi,daf) slice, dirty marker, and list prefix', () => {
    expect(keyForRabbiObs('abaye', 'berakhot:2a')).toBe('rabbi-obs:v1:abaye:berakhot:2a');
    expect(keyForRabbiObsDirty('abaye')).toBe('rabbi-obs-dirty:v1:abaye');
    expect(prefixForRabbiObs('abaye')).toBe('rabbi-obs:v1:abaye:');
  });
  it('spine tractate shelves: slug-normalised, tractate-only', () => {
    expect(keyForSpineLinks('Berakhot')).toBe('spine-links:v1:berakhot');
    expect(keyForSpineView('Berakhot')).toBe('spine-view:v1:berakhot');
    expect(keyForSpineView('Bava Kamma')).toBe('spine-view:v1:bava_kamma');
    expect(keyForSpineViewAcc('Bava Kamma')).toBe('spine-view-acc:v1:bava_kamma');
  });
});
