/**
 * Producer cache-key derivation — the corpus-agnostic half of the registry
 * pipeline's KV keys. Every app derives its mark/enrichment keys here so the
 * shape (and the `instanceIdOf` / `recipeHash` / slug normalization behind it)
 * is identical across corpora. App-specific SOURCE-cache keys (Sefaria bundles,
 * commentary text, etc.) live in each app's own cache-keys module.
 *
 * Shape:
 *
 *   mark:{id}:{cache_version}:{work}:{ref}
 *   enrich:{id}:{cache_version}:{instance_id}                 (scope=global)
 *   enrich:{id}:{cache_version}:{instance_id}:{work}:{ref}    (scope=local)
 *
 * (`work`/`ref` are the spine locator — `tractate`/`page` for the Talmud app,
 * `book`/`chapter` for a Tanach app.) `instance_id` derivation lives here too
 * (instanceIdOf) so callers don't invent their own scheme: instances with a
 * stable own id (a name, a slug, a verseRef) use it; instances without one fall
 * back to a 12-char hash of stable anchor fields. Same input → same key.
 *
 * If a definition's prompt or schema changes, bump its `cache_version` — the
 * key changes, old entries become unreachable.
 */

/** Enrichment cache scope — how broadly an enrichment's output is shared. */
export type EnrichmentScope = 'global' | 'local' | 'spine';

/** The minimal mark-definition shape `keyForMark` needs. Any fuller
 *  MarkDefinition (schema- or KV-shaped) structurally satisfies it. */
export interface MarkKeyDef {
  id: string;
  cache_version: string;
}

/** The minimal enrichment-definition shape the enrichment-key helpers need. */
export interface EnrichmentKeyDef {
  id: string;
  cache_version: string;
  scope: EnrichmentScope;
}

const TRACTATE_PAGE_RE = /[^a-zA-Z0-9.-]/g;
/** The `{tractate}` slug that terminates spine-scoped enrichment keys and
 *  prefixes every `{tractate}:{page}` slug. Factored out so spine-scope keys
 *  (tractate-only) and daf-scope keys (tractate+page) share one normalization. */
export function slugTractate(tractate: string): string {
  return tractate.toLowerCase().replace(TRACTATE_PAGE_RE, '_');
}
/** The `{tractate}:{page}` slug that terminates local mark/enrichment keys.
 *  Exported so the cache backfill can build the exact inverse map
 *  (slug -> display daf) byte-for-byte rather than re-deriving the transform. */
export function slugDaf(tractate: string, page: string): string {
  return `${slugTractate(tractate)}:${page.toLowerCase().replace(TRACTATE_PAGE_RE, '_')}`;
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
  const recipe =
    def.render !== undefined
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
      o.id,
      o.name,
      o.topic,
      o.title,
      o.verseRef,
      fields?.id,
      fields?.name,
      fields?.topic,
      fields?.title,
      fields?.verseRef,
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
  return s
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .slice(0, 80);
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

export function keyForMark(
  def: MarkKeyDef,
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
  def: EnrichmentKeyDef,
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
  // local  → keyed by instance + the whole daf (tractate:page)
  // spine  → keyed by instance + the tractate only (one shelf per tractate; the
  //          page is irrelevant because the piece accumulates across the daf set)
  // global → keyed by instance alone (same regardless of daf)
  const body =
    scope === 'local'
      ? (() => {
          if (!daf)
            throw new Error(
              `enrichment ${def.id} is scope=local but no daf was supplied to keyForEnrichment`,
            );
          return `${head}:${slugDaf(daf.tractate, daf.page)}`;
        })()
      : scope === 'spine'
        ? (() => {
            if (!daf)
              throw new Error(
                `enrichment ${def.id} is scope=spine but no daf (for the tractate) was supplied to keyForEnrichment`,
              );
            return `${head}:${slugTractate(daf.tractate)}`;
          })()
        : head;
  return qualifier ? `${body}:q_${qualifier}` : body;
}

/** Both schema-shape and KV-shape definitions carry `scope`. */
function enrichmentScope(def: EnrichmentKeyDef): 'global' | 'local' | 'spine' {
  return (def as { scope: 'global' | 'local' | 'spine' }).scope;
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
