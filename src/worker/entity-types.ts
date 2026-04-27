/**
 * Canonical entity contract shared by /api/identify and /api/enrich.
 *
 * The contract has two stages per entity type:
 *   1. Identify  → GET  /api/identify/{type}/:tractate/:page          → { items: Entity[] }
 *   2. Enrich    → POST /api/enrich/{type}/:tractate/:page/:entityId  → EnrichedEntity
 *               or POST /api/enrich/{type}/:tractate/:page            → { items: EnrichedEntity[] }
 *
 * Stage 1 returns the bare structural facts (anchor + label + identification
 * fields). Stage 2 attaches strategy-keyed enrichments. Both stages are KV
 * read-through cached (365d).
 *
 * Adding a new entity type means: pick a slug for it, add it to ENTITY_TYPES,
 * implement identify_<type> + enrich_<type> in index.ts, list its strategies
 * in STRATEGIES.
 */

export type EntityType = 'rabbi' | 'argument' | 'halacha' | 'aggadata' | 'pesukim' | 'era' | 'region' | 'mesorah';

export const ENTITY_TYPES: readonly EntityType[] = [
  'rabbi',
  'argument',
  'halacha',
  'aggadata',
  'pesukim',
  'era',
  'region',
  'mesorah',
] as const;

/** Strategies recognized per entity type. Stage-2 routes 400 if asked for one
 *  that isn't listed here. */
export const STRATEGIES: Record<EntityType, readonly string[]> = {
  rabbi: ['bio', 'lineage', 'corpus'],
  argument: ['rabbis', 'references', 'parallels', 'commentaries', 'bigger-picture', 'background', 'synthesize'],
  halacha: ['modern-authorities', 'rishonim-condensed', 'sa-commentary-walk'],
  aggadata: ['parallels', 'historical-context'],
  pesukim: ['tanach-context', 'peshat', 'gemara-usage', 'exegesis', 'synthesize'],
  era: ['llm-refine'],
  // Region and mesorah keep no LLM strategies — only their daf-scoped
  // first-pass GETs survive (region:v1:* / mesorah:v1:* in worker/index.ts).
  region: [],
  mesorah: [],
} as const;

/** Used by the convenience POST /api/enrich/{type}/:t/:p route when no strategy
 *  is supplied. */
export const DEFAULT_STRATEGY: Record<EntityType, string> = {
  rabbi: 'bio',
  argument: 'synthesize',
  halacha: 'modern-authorities',
  aggadata: 'parallels',
  pesukim: 'synthesize',
  era: 'llm-refine',
  region: '',
  mesorah: '',
};

export function isEntityType(s: string): s is EntityType {
  return (ENTITY_TYPES as readonly string[]).includes(s);
}

export function isValidStrategy(type: EntityType, strategy: string): boolean {
  return (STRATEGIES[type] as readonly string[]).includes(strategy);
}

/** Pointer back to the source text. `segmentIdx` is the 0-based Sefaria
 *  segment index when known; `quote` is verbatim Hebrew used when only an
 *  excerpt is available (the AI handlers for halacha/aggadata/argument don't
 *  emit segment indices today). */
export interface Anchor {
  segmentIdx?: number;
  segmentRange?: [number, number];
  quote?: string;
}

export interface Entity {
  id: string;
  type: EntityType;
  anchor: Anchor;
  label: string;
  fields: Record<string, unknown>;
}

export type EnrichedEntity = Entity & {
  enrichments: Record<string, unknown>;
};

/* ---------- ID helpers ---------------------------------------------------- */
/**
 * IDs are stable within (type, tractate, page) and serialize to URL-safe
 * strings. Keep the `<type>:<...>` shape so a bare ID is self-describing.
 *
 * - rabbi:    rabbi:<canonical-slug>           e.g. rabbi:rabbi-yochanan
 *             rabbi:idx-<n>                    when slug is unavailable
 * - argument: argument:<0-based section idx>
 * - halacha:  halacha:<0-based topic idx>
 * - aggadata: aggadata:<0-based story idx>
 * - pesukim:  pesukim:<0-based citation idx>
 * - era:      era:<segIdx>                     single-segment classification
 * - region:   region:<0-based section idx>     per-section region tag
 * - mesorah:  mesorah:<canonical-slug>         per-sage chain
 */

export function makeRabbiId(slug: string | null | undefined, fallbackIdx: number): string {
  if (slug && slug.length > 0) return `rabbi:${slug}`;
  return `rabbi:idx-${fallbackIdx}`;
}

export function makeIndexId(
  type: 'argument' | 'halacha' | 'aggadata' | 'pesukim' | 'region',
  idx: number,
): string {
  return `${type}:${idx}`;
}

export function makeEraId(segIdx: number): string {
  return `era:${segIdx}`;
}

export function makeMesorahId(slug: string): string {
  return `mesorah:${slug}`;
}

export interface ParsedEntityId {
  type: EntityType;
  rest: string;
  index?: number;
  slug?: string;
  segIdx?: number;
}

export function parseEntityId(id: string): ParsedEntityId | null {
  const colon = id.indexOf(':');
  if (colon < 0) return null;
  const type = id.slice(0, colon);
  const rest = id.slice(colon + 1);
  if (!isEntityType(type)) return null;
  if (type === 'rabbi') {
    if (rest.startsWith('idx-')) {
      const n = Number(rest.slice(4));
      return Number.isFinite(n) ? { type, rest, index: n } : null;
    }
    return { type, rest, slug: rest };
  }
  if (type === 'era') {
    const n = Number(rest);
    return Number.isFinite(n) ? { type, rest, segIdx: n } : null;
  }
  if (type === 'mesorah') {
    return { type, rest, slug: rest };
  }
  const n = Number(rest);
  return Number.isFinite(n) ? { type, rest, index: n } : null;
}

/* ---------- Cache key helpers -------------------------------------------- */

const ONE_YEAR_S = 60 * 60 * 24 * 365;
export const CACHE_TTL_S = ONE_YEAR_S;

// v3 bumped when pesukim entity type was added and aggadata's `derash` theme
// + `exegesis` strategy were retired (they now live in pesukim).
export function identifyCacheKey(type: EntityType, tractate: string, page: string): string {
  return `identify:v3:${type}:${tractate}:${page}`;
}

export function enrichCacheKey(
  type: EntityType,
  tractate: string,
  page: string,
  entityId: string,
  strategy: string,
): string {
  return `enrich:v3:${type}:${tractate}:${page}:${entityId}:${strategy}`;
}
