/**
 * Cache key derivation — single source of truth for every KV cache read/write
 * in the registry-driven pipeline. No hand-built keys anywhere else in the
 * worker; if you find yourself templating a string with `:` separators, use
 * one of these helpers instead.
 *
 * Shape:
 *
 *   mark:{id}:{cache_version}:{tractate}:{page}
 *   enrich:{id}:{cache_version}:{instance_id}                    (scope=global)
 *   enrich:{id}:{cache_version}:{instance_id}:{tractate}:{page}  (scope=local)
 *   ctx:gemara:v1:{tractate}:{page}
 *   ctx:commentaries:v1:{tractate}:{page}
 *
 * `instance_id` derivation lives here too (instanceIdOf) so callers don't
 * invent their own scheme. Mark instances that carry a stable own id (rabbi
 * name, place slug) use it; instances without an id fall back to a 12-char
 * hash of stable anchor fields. Either way the same input always yields the
 * same key, so cache hits flow through transparently.
 *
 * If a definition's prompt or schema changes, bump its `cache_version` — the
 * key changes, old entries become unreachable.
 */

import type { MarkDefinition as SchemaMarkDefinition, EnrichmentDefinition as SchemaEnrichmentDefinition } from './studio-schema';
import type { MarkDefinition as KvMarkDefinition, EnrichmentDefinition as KvEnrichmentDefinition } from './studio-registry';

export type AnyMarkDefinition = SchemaMarkDefinition | KvMarkDefinition;
export type AnyEnrichmentDefinition = SchemaEnrichmentDefinition | KvEnrichmentDefinition;

const TRACTATE_PAGE_RE = /[^a-zA-Z0-9.-]/g;
/** The `{tractate}:{page}` slug that terminates local mark/enrichment keys.
 *  Exported so the cache backfill can build the exact inverse map
 *  (slug -> display daf) byte-for-byte rather than re-deriving the transform. */
export function slugDaf(tractate: string, page: string): string {
  return `${tractate.toLowerCase().replace(TRACTATE_PAGE_RE, '_')}:${page.toLowerCase().replace(TRACTATE_PAGE_RE, '_')}`;
}

/** sha256(input) → first 12 hex chars. Used for hash-based instance ids. */
async function shortHash(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < 6; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

/** Stable JSON: object keys sorted recursively so field ORDER never changes the
 *  output. Array order is preserved (it is semantic). Used to canonicalize a
 *  producer's recipe before hashing it. */
function canonicalJSON(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      const src = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(src).sort()) out[k] = sort(src[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

/**
 * Content hash of a producer's RECIPE — the inputs that determine its output:
 * the `extractor` (prompt / schema / model) plus, for marks, the `render`
 * config. This reproduces the documented `def_hash` contract — sha256 over
 * (extractor + render) — but COMPUTED from the live spec instead of a
 * hand-authored literal, so it cannot drift from reality the way the current
 * `def_hash` strings have (e.g. 'rabbi-v2' never re-derives).
 *
 * Deliberately EXCLUDED: `passes` (post-processing, not a generation input),
 * `dependencies` (composition — hashed via their own recipes), and the
 * bookkeeping fields (`cache_version` / `def_hash` / `status` / `source` /
 * `updated_at` / `id` / `label`). Field-order insensitive.
 *
 * Foundation for content-hash freshness: a later step stores this alongside each
 * cached run and recomputes staleness automatically, retiring the manual
 * `cache_version` bump. It is intentionally NOT folded into the cache key — GC
 * sweeps by `cache_version` only, so keying on a content hash would orphan every
 * entry permanently in the TTL-less KV.
 */
export async function recipeHash(def: { extractor: unknown; render?: unknown }): Promise<string> {
  const recipe = def.render !== undefined
    ? { extractor: def.extractor, render: def.render }
    : { extractor: def.extractor };
  return shortHash(canonicalJSON(recipe));
}

/** Normalize free-text input (e.g. a user-submitted question) so cosmetic
 *  variation doesn't fan the cache out: trim, lowercase, collapse internal
 *  whitespace. Used by callers that want a stable cache-key qualifier from
 *  arbitrary text. Exported so the same normalization can be reused both
 *  when computing a write key and when looking up an existing entry. */
export function normalizeQualifier(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Hash a normalized qualifier to a short stable id suitable for use inside
 *  a KV key. Same input → same output across processes. */
export async function qualifierHash(s: string): Promise<string> {
  return shortHash(normalizeQualifier(s));
}

/**
 * Derive a stable per-instance id from a mark instance. Preference order:
 *   1. mark_input.fields.id (if the extractor emits one)
 *   2. mark_input.id        (legacy shape some marks still use)
 *   3. mark_input.fields.name (rabbi anchors carry this)
 *   4. sha256 of stable anchor fields, first 12 hex chars
 *
 * The instance_id is what makes scope='global' enrichments cache-shared
 * across dafim — for rabbi.bio on "Abaye", the same key `enrich:rabbi.bio:1:Abaye`
 * is hit regardless of which daf triggered the click.
 */
export async function instanceIdOf(markInput: unknown): Promise<string> {
  if (markInput && typeof markInput === 'object') {
    const o = markInput as Record<string, unknown>;
    const fields = o.fields as Record<string, unknown> | undefined;
    // Identity-label preference order. Top-level fields cover callers that pass
    // a flat {name, nameHe, generation, ...} shape (the rabbi sidebar, from
    // dafContext); the fields.* entries cover the mark-instance
    // {excerpt, fields:{name,...}} shape (warmers + mark anchors). Both must
    // agree so the same rabbi shares a cache key across surfaces.
    const labels: unknown[] = [
      o.id, o.name, o.topic, o.title, o.verseRef,
      fields?.id, fields?.name, fields?.topic, fields?.title, fields?.verseRef,
    ];
    for (const label of labels) {
      if (typeof label !== 'string' || !label) continue;
      const slug = slugId(label);
      // A label is only usable as an id if slugId leaves real alphanumerics.
      // Hebrew (and other non-Latin) titles/topics slug to just "_", so
      // returning that would collide EVERY Hebrew section/topic on a daf onto
      // one cache key (the bug that made all Hebrew argument cards render the
      // same section). On a degenerate slug, fall through to the structural
      // hash below — which includes the segment range + verbatim title/excerpt
      // and so stays distinct per section.
      if (/[a-z0-9]/.test(slug)) return slug;
    }
    // Anchor-shape fallback: hash the stable structural fields.
    const stable = pickStable(o);
    if (Object.keys(stable).length > 0) {
      return await shortHash(JSON.stringify(stable));
    }
  }
  return await shortHash(JSON.stringify(markInput ?? null));
}

function slugId(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9._-]+/g, '_').slice(0, 80);
}

function pickStable(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ['startSegIdx', 'endSegIdx', 'segIdx', 'tokenStart', 'tokenEnd', 'excerpt']) {
    if (k in o) out[k] = o[k];
  }
  if (o.fields && typeof o.fields === 'object') {
    const f = o.fields as Record<string, unknown>;
    for (const k of ['excerpt', 'title', 'topic', 'theme', 'verseRef']) {
      if (typeof f[k] === 'string') out[`fields.${k}`] = f[k];
    }
    // Content signature for comment-bearing instances (rishonim): the synthesis
    // is a pure function of these comments, so fold their content into the id.
    // Without it a rishonim instance has no usable label and pickStable yields
    // only {segIdx} — the key collapses to (segIdx, daf, cache_version), blind to
    // the comments. A single bad generation then caches permanently and cannot
    // self-heal even after the source content is corrected; including the content
    // makes the key change with the comments, so a corrected source regenerates.
    if (Array.isArray(f.comments)) {
      out['fields.comments'] = (f.comments as unknown[])
        .map((c) => {
          if (!c || typeof c !== 'object') return String(c);
          const cc = c as Record<string, unknown>;
          return [cc.work, cc.sourceRef, cc.textHe, cc.textEn]
            .map((v) => (typeof v === 'string' ? v : ''))
            .join('|');
        })
        .join('\n');
    }
  }
  return out;
}

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
  return `halacha-refs:v2:${tractate}:${page}`;
}
/** Reverse derivation: the Talmud/Tanakh sources a CODE ref (Mishneh Torah /
 *  Tur / Shulchan Aruch citation) links back to. Keyed by the raw code ref. */
export function keyForCodeSources(codeRef: string): string {
  return `code-sources:v1:${codeRef}`;
}
export function keyForDafTopics(tractate: string, page: string): string {
  return `daf-topics:v1:${tractate}:${page}`;
}
export function keyForMishnaBundle(tractate: string, page: string): string {
  return `mishna-bundle:v1:${tractate}:${page}`;
}
/** Shulchan Aruch commentary, keyed by an already-sanitised Sefaria ref. */
export function keyForSaCommentary(safeKey: string): string {
  return `sa-commentary:v1:${safeKey}`;
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
export function keyForTranslate(tractate: string, page: string, word: string, ctxHash: string, lang: 'en' | 'he' = 'en'): string {
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
export function keyForRabbiBioOnDaf(tractate: string, page: string, slug: string, include = ''): string {
  return include
    ? `rabbi-bio:v1:i=${include}:${tractate}:${page}:${slug}`
    : `rabbi-bio:v1:${tractate}:${page}:${slug}`;
}

// Rabbi aggregate blobs — single fixed keys (no params), compiled once by the
// admin stages and read by the bio synthesiser. Built as raw literals at many
// call sites (put + several gets + readGeneratedAt); centralised so a typo in
// one can't silently miss the compiled blob.
export function keyForRabbiGraph(): string { return 'rabbi-graph:v1'; }
export function keyForRabbiCohort(): string { return 'rabbi-cohort:v1'; }
export function keyForRabbiPlacesIndex(): string { return 'rabbi-places-index:v1'; }
export function keyForRabbiAcademyRoster(): string { return 'rabbi-academy-roster:v1'; }

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

export function keyForMark(
  def: AnyMarkDefinition,
  tractate: string,
  page: string,
  /** Output language. 'en' (default) keeps the key byte-identical to the
   *  pre-i18n shape so existing caches stay reachable; 'he' inserts a `:he`
   *  segment after cache_version so marks whose title/summary differ by
   *  language get their own namespace. Marks with no `_he` prompt produce
   *  identical structure either way but are still keyed per-language. */
  lang: 'en' | 'he' = 'en',
): string {
  const langSeg = lang === 'he' ? ':he' : '';
  return `mark:${def.id}:${def.cache_version}${langSeg}:${slugDaf(tractate, page)}`;
}

export function keyForEnrichment(
  def: AnyEnrichmentDefinition,
  instance_id: string,
  daf?: { tractate: string; page: string },
  /** Optional extra key dimension for enrichments whose output depends on
   *  caller-supplied input (e.g. argument-move.qa, where each user question
   *  produces a distinct answer). Pass the already-hashed qualifier — callers
   *  should normalize then hash with qualifierHash() so cosmetic variation
   *  doesn't fan the cache out. */
  qualifier?: string,
  /** Output language. 'en' (default) keeps the key byte-identical to the
   *  pre-i18n shape so existing caches stay reachable; 'he' inserts a `:he`
   *  segment right after cache_version, giving Hebrew its own namespace
   *  (e.g. enrich:rabbi.bio:5:he:Abaye). keyForMark takes the same dimension
   *  so structural marks with a `_he` prompt cache Hebrew titles separately. */
  lang: 'en' | 'he' = 'en',
): string {
  const scope = enrichmentScope(def);
  const langSeg = lang === 'he' ? ':he' : '';
  const head = `enrich:${def.id}:${def.cache_version}${langSeg}:${instance_id}`;
  const body = scope === 'local'
    ? (() => {
        if (!daf) throw new Error(`enrichment ${def.id} is scope=local but no daf was supplied to keyForEnrichment`);
        return `${head}:${slugDaf(daf.tractate, daf.page)}`;
      })()
    : head;
  return qualifier ? `${body}:q_${qualifier}` : body;
}

/** Both schema-shape and KV-shape definitions carry `scope`. */
function enrichmentScope(def: AnyEnrichmentDefinition): 'global' | 'local' {
  return (def as { scope: 'global' | 'local' }).scope;
}

/** The cache key for the PREVIOUS numeric cache_version of an enrichment, given
 *  the current canonical key, the enrichment id, and its current version. Null
 *  when the version isn't a decrementable integer (>1) or the id:version marker
 *  isn't present. Powers stale-while-revalidate across a version bump: serve the
 *  prior version's value while the new one recomputes. */
export function previousVersionKey(
  key: string | null,
  id: string,
  version: string | undefined,
): string | null {
  if (!key || !version || !/^\d+$/.test(version)) return null; // plain decimal only
  const n = Number(version);
  if (n <= 1) return null;
  const marker = `:${id}:${version}:`;
  return key.includes(marker) ? key.replace(marker, `:${id}:${n - 1}:`) : null;
}
