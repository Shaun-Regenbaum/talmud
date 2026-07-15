/**
 * Talmud SOURCE cache keys — the app-specific half of the KV key surface
 * (Sefaria bundles, HebrewBooks scans, Rishonim, halacha refs, dafyomi.co.il
 * corpus, rabbi enrichment shelves, commentary spines, bridges, …). No
 * hand-built keys anywhere else in the worker; if you find yourself templating a
 * string with `:` separators, use one of these helpers.
 *
 *   ctx:gemara:v1:{tractate}:{page}
 *   ctx:commentaries:v1:{tractate}:{page}
 *
 * The corpus-AGNOSTIC producer keys — `mark:…` / `enrich:…`, plus the
 * `instanceIdOf` / `recipeHash` / slug normalization behind them — live in
 * `@corpus/core/cache/keys` (shared with sibling apps) and are re-exported
 * below so existing `./cache-keys` importers are unaffected. `slugDaf` /
 * `slugTractate` are imported for the source helpers here.
 */

import { slugDaf, slugTractate } from '@corpus/core/cache/keys';

export {
  instanceIdOf,
  keyForEnrichment,
  keyForMark,
  normalizeQualifier,
  previousVersionKey,
  qualifierHash,
  recipeHash,
  slugDaf,
  slugTractate,
} from '@corpus/core/cache/keys';

export function keyForGemara(tractate: string, page: string): string {
  return `ctx:gemara:v1:${slugDaf(tractate, page)}`;
}
/** dafyomi.co.il structured corpus, keyed by daf NUMBER (both amudim share one
 *  file). Bump the version when the set of ingested content changes so old
 *  cached dapim become unreachable and re-fetch fresh.
 *  v1 -> v2: added the Revach l'Daf content type (entries cached under v1
 *  predate it and would otherwise never show Revach, since the positive cache
 *  has no TTL).
 *  v2 -> v3: charset-sniff decode (UTF-8 vs windows-1255) — v2 entries fetched
 *  from windows-1255 pages cached mojibake'd Hebrew (U+FFFD "????").
 *  v3 -> v4: background parser fix — pages with no girsa section (no girsasep)
 *  had their entire glossary swallowed; v3 cached those as empty background.
 *  v4 -> v5: Revach parser now extracts in-text cross-references ("Pesachim
 *  50a") into entry.refs; v4 entries predate it. Re-parse only (no LLM). */
export function keyForDafyomi(tractate: string, daf: string): string {
  return `dafyomi:v5:${slugDaf(tractate, daf)}`;
}
export function keyForCommentaries(tractate: string, page: string): string {
  return `ctx:commentaries:v1:${slugDaf(tractate, page)}`;
}

// Source-content caches (HebrewBooks scans, Sefaria page/segments, dafyomi
// sub-corpora) that live behind the getters in source-cache.ts. Centralised here
// so a version bump happens in ONE place: keeping them inline let warm-cron.ts
// drift to `sefaria-bundle:v2` as a probe while the reader (source-cache.ts)
// moved to v5, so warm-cron's "already warm?" check always missed.
// IMPORTANT: these use RAW `${tractate}:${page}`, NOT slugDaf — existing cached
// entries were written with the raw form (a space/upper-case tractate like
// "Bava Kamma" is part of the key as-is). Do NOT normalise them or every cached
// daf cold-misses and re-fetches.
export function keyForHebrewBooks(tractate: string, page: string): string {
  return `hb:v2:${tractate}:${page}`;
}
export function keyForSefariaBundle(tractate: string, page: string): string {
  return `sefaria-bundle:v5:${tractate}:${page}`;
}
export function keyForSefariaSegments(tractate: string, page: string): string {
  return `sefaria-seg:v1:${tractate}:${page}`;
}
export function keyForRishonim(tractate: string, page: string): string {
  return `rishonim:v4:${tractate}:${page}`;
}
export function keyForHalachaRefs(tractate: string, page: string): string {
  // v3: snippets now carry einMishpat (Ein Mishpat / Ner Mitzvah classical
  // codification flag) alongside segStart/segEnd.
  return `halacha-refs:v3:${tractate}:${page}`;
}
/** Reverse derivation: the Talmud/Tanakh sources a CODE ref (Mishneh Torah /
 *  Tur / Shulchan Aruch citation) links back to. Keyed by the raw code ref. */
export function keyForCodeSources(codeRef: string): string {
  // v2: links now carry einMishpat (authoritative classical derivation flag).
  return `code-sources:v2:${codeRef}`;
}
export function keyForDafTopics(tractate: string, page: string): string {
  return `daf-topics:v1:${tractate}:${page}`;
}
export function keyForMishnaBundle(tractate: string, page: string): string {
  return `mishna-bundle:v1:${tractate}:${page}`;
}
/** Parallel Jerusalem Talmud passages on the same mishnah as this gemara daf,
 *  with their real Hebrew+English text — the grounding for the `yerushalmi`
 *  Bavli↔Yerushalmi mark. One getRelated + a getText per parallel halacha. */
export function keyForYerushalmi(tractate: string, page: string): string {
  return `yerushalmi:v1:${tractate}:${page}`;
}
/** Talmud↔Talmud parallels on this daf — Sefaria's "Mesorat HaShas" apparatus
 *  (`category: "Talmud"` related links) projected into the spine link graph as
 *  `parallels` edges. One getRelated call; daf-keyed since the apparatus doesn't
 *  vary by argument. Distinct prefix from keyForMesorah (rabbi transmission).
 *  RAW tractate:page like its source-bundle siblings above. */
export function keyForTalmudParallels(tractate: string, page: string): string {
  return `talmud-parallels:v1:${tractate}:${page}`;
}
/** Shulchan Aruch commentary, keyed by an already-sanitised Sefaria ref. */
export function keyForSaCommentary(safeKey: string): string {
  return `sa-commentary:v1:${safeKey}`;
}

/** daf -> cached pieces reverse index (the "build manifest" read side). One KV
 *  entry PER (daf, producer, instance, lang), written at every fresh mark/
 *  enrichment write (best-effort, off the request critical path). The daf is the
 *  PREFIX — the content `mark:`/`enrich:` keys carry it as a SUFFIX, so they
 *  can't be listed by daf — so `prefixForDafIndex(t,p)` + one `cache.list()`
 *  returns the whole daf's pieces, with per-piece telemetry in each entry's KV
 *  METADATA (cost/model/tokens/cold_ms/recipeHash). The value is empty: the
 *  inspector needs only the key + metadata, and skipping the content key avoids
 *  re-deriving it (the mark he-collapse makes that ambiguous). `instanceToken` is
 *  the enrichment instance_id, or '-' for a whole-daf mark. */
export function keyForDafIndex(
  tractate: string,
  page: string,
  producerId: string,
  instanceToken: string,
  lang: 'en' | 'he',
): string {
  return `dafidx:v1:${slugDaf(tractate, page)}:${producerId}:${instanceToken}:${lang}`;
}
/** List every daf-index entry for one daf (`cache.list({ prefix })`). */
export function prefixForDafIndex(tractate: string, page: string): string {
  return `dafidx:v1:${slugDaf(tractate, page)}:`;
}
/** Completion sentinel — written by a full backfill of one (daf, lang). Its
 *  presence is what lets /api/daf-runs trust the index (serve from one `list()`
 *  instead of probing): a daf with only scattered fresh-write entries but no
 *  completed backfill has no sentinel, so it still takes the probe path. Kept in
 *  a SEPARATE namespace so it doesn't appear under `prefixForDafIndex`. */
export function keyForDafIndexDone(tractate: string, page: string, lang: 'en' | 'he'): string {
  // v2: the backfill now also indexes the per-section `argument` facets, so a v1
  // "complete" is stale. Bumping forces one re-backfill per daf (off the request
  // path) that adds the argument entries, then writes v2.
  return `dafidx-done:v2:${slugDaf(tractate, page)}:${lang}`;
}

// Per-daf analysis + per-rabbi enrichment caches. Each of these was hand-built
// at 2-4 separate call sites in index.ts — the precise drift hazard that bit
// `sefaria-bundle` (warm-cron probed v2 while the reader used v5). Centralising
// makes a version bump land everywhere at once. RAW interpolation (no slugDaf):
// the rabbi `slug` is already normalised by the caller, and the daf keys were
// written with raw `tractate:page`. Do not change the shape — existing entries
// across Shas would cold-miss.
export function keyForRabbiEnriched(slug: string): string {
  return `rabbi-enriched:v1:${slug}`;
}
export function keyForRabbiWikidata(slug: string): string {
  return `rabbi-wikidata:v1:${slug}`;
}
export function keyForRabbiWikiBio(slug: string): string {
  return `rabbi-wiki-bio:v1:${slug}`;
}
export function keyForAnalyzeSkeleton(tractate: string, page: string): string {
  return `analyze-skel:v2:${tractate}:${page}`;
}
export function keyForRegion(tractate: string, page: string): string {
  return `region:v1:${tractate}:${page}`;
}
export function keyForMesorah(tractate: string, page: string): string {
  return `mesorah:v1:${tractate}:${page}`;
}

// Commentary-spine + cross-daf bridge caches, previously hand-built in index.ts.
// Single-site each today (no drift hazard), but centralised so the
// reverse-dependency index (roadmap step 6) can enumerate every producer's key
// from one place. Shapes preserved byte-for-byte. NOTE: keyForBridge
// SLUG-normalises (lowercase, then any run NOT in [a-z0-9.-] -> '_', so '.' and
// '-' survive), a THIRD normalisation distinct from both the raw source-cache
// keys and slugDaf — kept verbatim.
export function keyForCommentaryWorks(tractate: string, page: string): string {
  return `commentaries:v1:${tractate}:${page}`;
}
export function keyForCommentaryText(sourceRef: string): string {
  return `commentary-tx:v1:${sourceRef}`;
}
export function keyForReferences(tractate: string, page: string): string {
  return `refs:v1:${tractate}:${page}`;
}
export function keyForBridge(tractate: string, page: string): string {
  const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9.-]+/g, '_');
  return `bridge:v1:${norm(tractate)}:${norm(page)}`;
}

// Single-site content + rabbi caches, previously hand-built in index.ts — the
// last batch of producer keys to centralise (roadmap step 6). Shapes preserved
// byte-for-byte (raw interpolation, no slugDaf). Several are built at MANY call
// sites (pasuk ×2, rabbi-bio's shapes, the rabbi aggregate blobs ×6+ sites
// each) where an inline literal could drift into a silent cold-miss.

/** A Tanach verse's Hebrew, keyed by a sanitised Sefaria ref (caller replaces
 *  any char outside [A-Za-z0-9 .:-] with '_'). */
export function keyForPasuk(safeRef: string): string {
  return `pasuk:v4:${safeRef}`;
}

/** The AI context-matcher's per-daf placement of a fixed item set (`itemsHash`
 *  = hash of the item keys). */
export function keyForCtxMatch(tractate: string, page: string, itemsHash: string): string {
  return `ctx-match:v2:${tractate}:${page}:${itemsHash}`;
}

/** A single word's contextual translation. `ctxHash` is the caller's
 *  surrounding-text hash, already carrying its own leading separator. `lang` is
 *  the TARGET language of the translation ('en' default → English, byte-exact
 *  with the historical key; 'he' → a `:he` suffix so Hebrew glosses never
 *  collide with the English ones). */
export function keyForTranslate(
  tractate: string,
  page: string,
  word: string,
  ctxHash: string,
  lang: 'en' | 'he' = 'en',
): string {
  return `translate:v3:${tractate}:${page}:${word}${ctxHash}${lang === 'he' ? ':he' : ''}`;
}

/** A hebraised English string, keyed by a content hash. */
export function keyForHebraize(hash: string): string {
  return `hebraize:v2:${hash}`;
}

/** A rabbi's global bio enrichment, keyed by slug alone. */
export function keyForRabbiBioBySlug(slug: string): string {
  return `rabbi-bio:v1:${slug}`;
}

/** A rabbi's per-daf bio synthesis. When `include` (the normalised, sorted,
 *  comma-joined section list) is non-empty it is embedded as an `i=` segment;
 *  an empty `include` yields the plain (tractate, page, slug) shape. */
export function keyForRabbiBioOnDaf(
  tractate: string,
  page: string,
  slug: string,
  include = '',
): string {
  return include
    ? `rabbi-bio:v1:i=${include}:${tractate}:${page}:${slug}`
    : `rabbi-bio:v1:${tractate}:${page}:${slug}`;
}

// Rabbi aggregate blobs — single fixed keys (no params), compiled once by the
// admin stages and read by the bio synthesiser. Built as raw literals at many
// call sites (put + several gets + readGeneratedAt); centralised so a typo in
// one can't silently miss the compiled blob.
export function keyForRabbiGraph(): string {
  return 'rabbi-graph:v1';
}
/** The learned Shas-wide rabbi voice graph (voice-graph.ts / warm-cron fold).
 *  Distinct from rabbi-graph:v1 (the compiled curated teacher/student blob). */
export function keyForRabbiVoiceGraph(): string {
  return 'rabbi-voice-graph:v1';
}
export function keyForRabbiCohort(): string {
  return 'rabbi-cohort:v1';
}
export function keyForRabbiPlacesIndex(): string {
  return 'rabbi-places-index:v1';
}
export function keyForRabbiAcademyRoster(): string {
  return 'rabbi-academy-roster:v1';
}

// Rabbi-observations reverse index — one slice per (rabbi, daf), plus a
// per-rabbi dirty marker. `dafSlug` is the caller's obsDafSlug(tractate, page).
export function keyForRabbiObs(slug: string, dafSlug: string): string {
  return `rabbi-obs:v1:${slug}:${dafSlug}`;
}
export function keyForRabbiObsDirty(slug: string): string {
  return `rabbi-obs-dirty:v1:${slug}`;
}
/** Prefix for listing every daf slice of one rabbi (note the trailing ':'). */
export function prefixForRabbiObs(slug: string): string {
  return `rabbi-obs:v1:${slug}:`;
}

/** Cross-daf argument flow for a daf: the section-level edges INTO the next daf
 *  (the relation-typed successor to keyForBridge's boolean). Keyed per anchor
 *  daf (forward window of 1), same raw shape family as the bridge key. */
export function keyForCrossFlow(tractate: string, page: string): string {
  // v2: precision pass after the Berakhot audit — tighter relation defs +
  // anti-fan-out cap (≤1 continues / ≤2 total per source) + entity guard.
  return `cross-flow:v2:${slugDaf(tractate, page)}`;
}

/** The whole-tractate link graph (spineLinks aggregator), materialized on the
 *  tractate shelf — one entry per tractate (the same tractate-only addressing as
 *  the `spine` enrichment scope; a deterministic VIEW rather than an enrichment
 *  producer, so it has its own key instead of routing through keyForEnrichment). */
export function keyForSpineLinks(tractate: string): string {
  return `spine-links:v1:${slugTractate(tractate)}`;
}

/** Per-tractate spine-VIEW snapshot SHELF — the materialized whole-tractate flow
 *  graph the warm-cron builds incrementally, served O(1) (no fan-out, no 60-daf
 *  bound) by `GET /api/spine-view/:t?cached=1`. Tractate-only, slug-normalised,
 *  mirroring {@link keyForSpineLinks}. */
export function keyForSpineView(tractate: string): string {
  return `spine-view:v1:${slugTractate(tractate)}`;
}

/** The cron's per-tractate ACCUMULATOR for the spine-view shelf — a
 *  `Record<page, node>` map RMW-merged one window of dapim at a time, then
 *  projected onto {@link keyForSpineView} at end-of-tractate-pass. Internal to the
 *  builder; never served. */
export function keyForSpineViewAcc(tractate: string): string {
  return `spine-view-acc:v1:${slugTractate(tractate)}`;
}
