/**
 * Canonical record for an enriched rabbi/sage. Produced by the EnrichRabbi
 * workflow (one record per rabbi, keyed by slug in KV under `rabbi:{slug}`),
 * compiled into a denormalized graph artifact for the client.
 *
 * Bump SCHEMA_VERSION when the shape changes — KV records below the bump
 * get re-enriched on the next workflow run.
 */

export const SCHEMA_VERSION = 1;

export type Region = 'israel' | 'bavel' | 'mixed';

export type Orientation = 'mystical' | 'practical' | 'mixed' | 'unknown';

export type Academy =
  | 'sura'
  | 'pumbedita'
  | 'nehardea'
  | 'mehoza'
  | 'naresh'
  | 'mata-mehasya'
  | 'tiberias'
  | 'caesarea'
  | 'sepphoris'
  | 'yavneh'
  | 'usha'
  | 'lod'
  | 'bnei-brak'
  | 'jerusalem'
  | 'other';

export type FamilyRelation =
  | 'father'
  | 'mother'
  | 'spouse'
  | 'son'
  | 'daughter'
  | 'brother'
  | 'sister'
  | 'uncle'
  | 'aunt'
  | 'nephew'
  | 'niece'
  | 'grandfather'
  | 'grandmother'
  | 'grandson'
  | 'granddaughter'
  | 'father-in-law'
  | 'mother-in-law'
  | 'son-in-law'
  | 'daughter-in-law'
  | 'brother-in-law'
  | 'sister-in-law'
  | 'cousin'
  | 'ancestor'
  | 'descendant'
  | 'other';

export type EdgeSource = 'sefaria' | 'llm';

export interface RabbiEdge {
  /** Slug of the related rabbi when resolvable; null for non-rabbis or
   *  unmatched names. */
  slug: string | null;
  /** Canonical name as written, used as fallback when slug is null. */
  name: string;
  /** Sefaria tfidf when source='sefaria', LLM-asserted strength 0–1 otherwise.
   *  Sort by this descending to derive primary_teacher / primary_student. */
  weight: number | null;
  source: EdgeSource;
}

export interface FamilyEdge extends RabbiEdge {
  relation: FamilyRelation;
}

export interface EnrichedRabbi {
  slug: string;
  canonical: { en: string; he: string };
  aliases: string[];

  generation: string | null;
  region: Region | null;
  academy: Academy | null;
  birthYear: number | null;
  deathYear: number | null;
  places: string[];

  bio: { en: string; he: string };
  prominence: number | null;

  orientation: Orientation;
  characteristics: string[];

  primaryTeacher: string | null;
  primaryStudent: string | null;
  teachers: RabbiEdge[];
  students: RabbiEdge[];
  contemporaries: string[];
  family: FamilyEdge[];
  opposed: RabbiEdge[];
  influences: RabbiEdge[];
  events: string[];

  refs: {
    sefariaSlug?: string;
    enWiki?: string;
    heWiki?: string;
    je?: string;
    wikidata?: string;
  };

  image: { url: string; caption: string | null } | null;

  schemaVersion: number;
  enrichedAt: string;
  sources: ReadonlyArray<'sefaria' | 'wikipedia' | 'llm'>;
}

const ORIENTATIONS: ReadonlySet<Orientation> = new Set([
  'mystical',
  'practical',
  'mixed',
  'unknown',
]);

const REGIONS: ReadonlySet<Region> = new Set(['israel', 'bavel', 'mixed']);

export interface ValidationFailure {
  path: string;
  message: string;
}

/** Subset of EnrichedRabbi the LLM returns; the worker stamps provenance. */
export type LLMRabbiOutput = Omit<EnrichedRabbi, 'schemaVersion' | 'enrichedAt' | 'sources'>;

/**
 * Validator for raw LLM output. Same shape checks as the full record minus
 * provenance fields, which the worker fills in after a successful call.
 */
export function validateLLMRabbiOutput(x: unknown): ValidationFailure | null {
  if (!x || typeof x !== 'object') return { path: '', message: 'not an object' };
  const r = x as Partial<LLMRabbiOutput>;

  if (typeof r.slug !== 'string' || r.slug.length === 0)
    return { path: 'slug', message: 'missing or empty' };

  if (!r.canonical || typeof r.canonical.en !== 'string' || typeof r.canonical.he !== 'string')
    return { path: 'canonical', message: 'requires { en, he } strings' };

  if (!Array.isArray(r.aliases)) return { path: 'aliases', message: 'must be array' };

  if (!r.bio || typeof r.bio.en !== 'string' || typeof r.bio.he !== 'string')
    return { path: 'bio', message: 'requires { en, he } strings' };

  if (r.region !== null && r.region !== undefined && !REGIONS.has(r.region))
    return { path: 'region', message: `invalid region: ${r.region}` };

  if (!ORIENTATIONS.has(r.orientation as Orientation))
    return { path: 'orientation', message: `invalid orientation: ${r.orientation}` };

  for (const field of ['teachers', 'students', 'family', 'opposed', 'influences'] as const) {
    if (!Array.isArray(r[field])) return { path: field, message: 'must be array' };
  }

  for (const [i, e] of (r.teachers ?? []).entries()) {
    if (!isValidEdge(e)) return { path: `teachers[${i}]`, message: 'invalid edge shape' };
  }
  for (const [i, e] of (r.students ?? []).entries()) {
    if (!isValidEdge(e)) return { path: `students[${i}]`, message: 'invalid edge shape' };
  }
  for (const [i, e] of (r.family ?? []).entries()) {
    if (!isValidEdge(e)) return { path: `family[${i}]`, message: 'invalid edge shape' };
    if (typeof (e as FamilyEdge).relation !== 'string')
      return { path: `family[${i}].relation`, message: 'missing relation' };
  }

  return null;
}

/**
 * Narrow runtime validator. Returns null on success, or the first failure.
 * Defense at the LLM-output boundary — we don't trust model JSON.
 */
export function validateEnrichedRabbi(x: unknown): ValidationFailure | null {
  if (!x || typeof x !== 'object') return { path: '', message: 'not an object' };
  const r = x as Partial<EnrichedRabbi>;

  if (typeof r.slug !== 'string' || r.slug.length === 0)
    return { path: 'slug', message: 'missing or empty' };

  if (!r.canonical || typeof r.canonical.en !== 'string' || typeof r.canonical.he !== 'string')
    return { path: 'canonical', message: 'requires { en, he } strings' };

  if (!Array.isArray(r.aliases)) return { path: 'aliases', message: 'must be array' };

  if (!r.bio || typeof r.bio.en !== 'string' || typeof r.bio.he !== 'string')
    return { path: 'bio', message: 'requires { en, he } strings' };

  if (r.region !== null && r.region !== undefined && !REGIONS.has(r.region))
    return { path: 'region', message: `invalid region: ${r.region}` };

  if (!ORIENTATIONS.has(r.orientation as Orientation))
    return { path: 'orientation', message: `invalid orientation: ${r.orientation}` };

  for (const field of ['teachers', 'students', 'family', 'opposed', 'influences'] as const) {
    if (!Array.isArray(r[field])) return { path: field, message: 'must be array' };
  }

  for (const [i, e] of (r.teachers ?? []).entries()) {
    if (!isValidEdge(e)) return { path: `teachers[${i}]`, message: 'invalid edge shape' };
  }
  for (const [i, e] of (r.students ?? []).entries()) {
    if (!isValidEdge(e)) return { path: `students[${i}]`, message: 'invalid edge shape' };
  }
  for (const [i, e] of (r.family ?? []).entries()) {
    if (!isValidEdge(e)) return { path: `family[${i}]`, message: 'invalid edge shape' };
    if (typeof (e as FamilyEdge).relation !== 'string')
      return { path: `family[${i}].relation`, message: 'missing relation' };
  }

  if (r.schemaVersion !== SCHEMA_VERSION)
    return { path: 'schemaVersion', message: `expected ${SCHEMA_VERSION}, got ${r.schemaVersion}` };

  return null;
}

function isValidEdge(e: unknown): e is RabbiEdge {
  if (!e || typeof e !== 'object') return false;
  const x = e as Partial<RabbiEdge>;
  if (typeof x.name !== 'string' || x.name.length === 0) return false;
  if (x.slug !== null && typeof x.slug !== 'string') return false;
  if (x.weight !== null && typeof x.weight !== 'number') return false;
  if (x.source !== 'sefaria' && x.source !== 'llm') return false;
  return true;
}

/* ---------- Generation labels (computed at read time, not stored) ---------- */

const GEN_PREFIX_LABELS: Record<string, string> = {
  T: 'Tanna',
  A: 'Amora',
  Z: 'Zugot',
  G: 'Gaon',
  S: 'Savora',
};

/**
 * Sefaria generation codes look like "T4", "A2", "Z5". This expands a code
 * like "T4" → "Tanna, 4th gen". Returns the raw code when not a known prefix
 * (e.g., "savora" from local data).
 */
export function generationLabel(code: string | null): string | null {
  if (!code) return null;
  const m = code.match(/^([A-Z])(\d+)$/);
  if (!m) return code;
  const [, prefix, n] = m;
  const stem = GEN_PREFIX_LABELS[prefix];
  if (!stem) return code;
  return `${stem}, ${ordinalSuffix(parseInt(n, 10))} gen`;
}

function ordinalSuffix(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n}st`;
  if (mod10 === 2 && mod100 !== 12) return `${n}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${n}rd`;
  return `${n}th`;
}
