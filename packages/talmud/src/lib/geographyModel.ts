/**
 * Whole-daf geography model assembly — the pure assembler shared by the worker
 * (the `geography` computed mark's compute fn builds this server-side from
 * cached inputs) and the client (GeographyMap renders it).
 *
 * Pure functions (no Solid, no fetch, no worker bindings) that merge the two
 * registry-era data sources into the model GeographyMap renders:
 *
 *   1. Per-rabbi geography — the deterministic registry identity (places /
 *      region / moved from rabbi-places.json) plus the CACHED `rabbi.geography`
 *      enrichment when one exists. Registry places win over the AI enrichment
 *      (human-curated outranks AI); the enrichment fills in rabbis the registry
 *      has no places for and supplies movements.
 *   2. On-daf place mentions — the `places` mark instances (name/nameHe),
 *      matched against the projected city table by alias or Hebrew name.
 *
 * Everything here is cached-only by construction: the inputs are whatever the
 * caller already has in hand; nothing in this module can trigger generation.
 *
 * Lives in src/lib (not src/client) so the worker compute fn can import it
 * without dragging in Solid — geoShapes.ts is likewise pure data.
 */

import { GEO_CITIES, type GeoCity, type GeoRegionId } from '../client/geoShapes';

export type MoveDirection = 'bavel->israel' | 'israel->bavel' | 'both';

/** The shape of the `rabbi.geography` enrichment this assembler reads. A
 *  structural subset of RabbiGeographyCard's GeographyData — kept local so this
 *  module stays free of any client (.tsx) import. */
export interface GeoEnrichment {
  birthplace?: { place: string; region?: string } | null;
  primaryStudyPlaces?: Array<{ place: string }>;
  notablePlaces?: Array<{ place: string }>;
  movements?: Array<{ from: string; to: string }>;
}

/** One rabbi's geographic inputs, as assembled by the caller. */
export interface RabbiGeoSource {
  /** Display name AS IT APPEARS on the daf (drives rabbi-underline
   *  highlighting, which is keyed by the mark instance's name). */
  name: string;
  /** Registry slug when grounding pinned the rabbi. Drives list identity
   *  (same-name HOMONYMS with different slugs stay distinct, mirroring
   *  dedupRabbiList) and the slug-preferring click path. */
  slug?: string | null;
  /** Registry identity (deterministic, from rabbi-places.json). */
  identity?: {
    places?: string[];
    region?: 'israel' | 'bavel' | null;
    moved?: MoveDirection | null;
  } | null;
  /** Cached rabbi.geography enrichment (null/absent until warmed). */
  geography?: GeoEnrichment | null;
}

export interface PlaceMention {
  name?: string;
  nameHe?: string;
}

/** A rabbi as rendered on the map: display name + the registry slug (when
 *  known) so dot clicks can open the RIGHT same-name homonym. */
export interface GeoRabbi {
  name: string;
  slug: string | null;
}

export interface CityDot {
  city: GeoCity;
  rabbis: GeoRabbi[];
  /** Times this city is mentioned by name on the daf (0 when only rabbis
   *  put it on the map). */
  mentions: number;
  /** RAW mention names as the places mark emitted them (deduped, in
   *  encounter order). The inline .city-marker spans carry the raw
   *  `fields.name` in data-city, so click-to-highlight must use these —
   *  not the canonical city name (e.g. a daf says "Sepphoris", the dot is
   *  Tzipori, the span is data-city="Sepphoris"). */
  mentionNames: string[];
}

export interface MoverRow {
  name: string;
  slug: string | null;
  direction: MoveDirection;
}

export interface DafGeoModel {
  /** Cities with at least one rabbi or one on-daf mention. */
  dots: CityDot[];
  /** Rabbis whose region is known but whose city is not. */
  unspecifiedIsrael: GeoRabbi[];
  unspecifiedBavel: GeoRabbi[];
  moverRows: MoverRow[];
  israelCount: number;
  bavelCount: number;
  /** True when there is nothing to draw — callers show an empty-state card. */
  empty: boolean;
}

// ---------------------------------------------------------------------------
// City matching
// ---------------------------------------------------------------------------

/** Lowercase + strip diacritic-ish punctuation so "Neharde'a" matches
 *  "nehardea" and "Maḥoza" matches "mahoza". */
function normalizePlace(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // latin combining diacritics (ḥ → h)
    .replace(/[‘’`׳]/g, "'")
    .replace(/[.,()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface CityIndex {
  byAlias: Map<string, GeoCity>;
  byHe: Map<string, GeoCity>;
}

let cityIndexCache: CityIndex | null = null;

function cityIndex(): CityIndex {
  if (cityIndexCache) return cityIndexCache;
  const byAlias = new Map<string, GeoCity>();
  const byHe = new Map<string, GeoCity>();
  for (const c of GEO_CITIES) {
    byAlias.set(normalizePlace(c.name), c);
    for (const a of c.aliases) byAlias.set(normalizePlace(a), c);
    byHe.set(c.nameHe, c);
  }
  cityIndexCache = { byAlias, byHe };
  return cityIndexCache;
}

/** Match a free-form place string (and/or Hebrew name) to a known city.
 *  Variants with and without the apostrophe both match ("Peki'in"/"Pekiin"). */
export function matchCity(name?: string | null, nameHe?: string | null): GeoCity | null {
  const idx = cityIndex();
  if (name) {
    const n = normalizePlace(name);
    const hit = idx.byAlias.get(n) ?? idx.byAlias.get(n.replace(/'/g, ''));
    if (hit) return hit;
  }
  if (nameHe) {
    const hit = idx.byHe.get(nameHe.trim());
    if (hit) return hit;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Region inference (for the "city unknown, region known" bucket and for
// deriving movement direction from rabbi.geography movements).
// ---------------------------------------------------------------------------

const REGION_WORDS_BAVEL = /bavel|babylon/;
const REGION_WORDS_ISRAEL = /eretz yisrael|israel|palestine|galilee/;

export function inferRegionOfPlace(place: string): GeoRegionId | null {
  const city = matchCity(place);
  if (city) return city.region;
  const p = normalizePlace(place);
  if (REGION_WORDS_BAVEL.test(p)) return 'bavel';
  if (REGION_WORDS_ISRAEL.test(p)) return 'israel';
  return null;
}

/** Derive a Bavel<->Eretz Yisrael migration direction from the enrichment's
 *  movements list. Local moves (both ends in one region) don't count. */
export function deriveMoveDirection(geo: GeoEnrichment | null | undefined): MoveDirection | null {
  if (!geo?.movements?.length) return null;
  let toIsrael = false;
  let toBavel = false;
  for (const mv of geo.movements) {
    const from = inferRegionOfPlace(mv.from);
    const to = inferRegionOfPlace(mv.to);
    if (!from || !to || from === to) continue;
    if (to === 'israel') toIsrael = true;
    else toBavel = true;
  }
  if (toIsrael && toBavel) return 'both';
  if (toIsrael) return 'bavel->israel';
  if (toBavel) return 'israel->bavel';
  return null;
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

/** Pick the single city a rabbi's dot lands on. Registry places first
 *  (deterministic outranks AI), then the enrichment's study places,
 *  birthplace, and notable places. */
export function placeRabbi(src: RabbiGeoSource): GeoCity | null {
  for (const p of src.identity?.places ?? []) {
    const city = matchCity(p);
    if (city) return city;
  }
  const geo = src.geography;
  if (geo) {
    for (const sp of geo.primaryStudyPlaces ?? []) {
      const city = matchCity(sp.place);
      if (city) return city;
    }
    if (geo.birthplace?.place) {
      const city = matchCity(geo.birthplace.place);
      if (city) return city;
    }
    for (const np of geo.notablePlaces ?? []) {
      const city = matchCity(np.place);
      if (city) return city;
    }
  }
  return null;
}

/** Region fallback when no city matched. */
function regionOf(src: RabbiGeoSource): GeoRegionId | null {
  if (src.identity?.region === 'israel' || src.identity?.region === 'bavel')
    return src.identity.region;
  const bp = src.geography?.birthplace;
  if (bp?.region === 'israel' || bp?.region === 'bavel') return bp.region;
  for (const sp of src.geography?.primaryStudyPlaces ?? []) {
    const r = inferRegionOfPlace(sp.place);
    if (r) return r;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Model assembly
// ---------------------------------------------------------------------------

const DIR_ORDER: MoveDirection[] = ['bavel->israel', 'israel->bavel', 'both'];

export function buildGeoModel(
  rabbis: RabbiGeoSource[],
  placeMentions: PlaceMention[],
): DafGeoModel {
  // On-daf mention counts per city, plus the raw mention names (what the
  // inline .city-marker spans carry in data-city).
  const mentionCounts = new Map<string, number>();
  const mentionNamesByCity = new Map<string, string[]>();
  for (const m of placeMentions) {
    const city = matchCity(m.name, m.nameHe);
    if (!city) continue;
    mentionCounts.set(city.name, (mentionCounts.get(city.name) ?? 0) + 1);
    const raw = m.name?.trim();
    if (raw) {
      let names = mentionNamesByCity.get(city.name);
      if (!names) {
        names = [];
        mentionNamesByCity.set(city.name, names);
      }
      if (!names.includes(raw)) names.push(raw);
    }
  }

  // Rabbi placement — one dot per rabbi. Identity mirrors dedupRabbiList's
  // slug-first rule: dedup by slug when grounding pinned one, else by the
  // normalized display name. Same-name HOMONYMS carrying different slugs
  // stay distinct (collapsing them by display name would merge rabbis the
  // upstream list deliberately keeps apart).
  const byCity = new Map<string, GeoRabbi[]>();
  const unspecifiedIsrael: GeoRabbi[] = [];
  const unspecifiedBavel: GeoRabbi[] = [];
  const seen = new Set<string>();
  const moverBuckets: Record<MoveDirection, GeoRabbi[]> = {
    'bavel->israel': [],
    'israel->bavel': [],
    both: [],
  };
  for (const src of rabbis) {
    if (!src.name) continue;
    const slug = src.slug ?? null;
    const idKey = slug ? `s:${slug}` : `n:${src.name.trim().toLowerCase()}`;
    if (seen.has(idKey)) continue;
    seen.add(idKey);
    const rabbi: GeoRabbi = { name: src.name, slug };
    const city = placeRabbi(src);
    if (city) {
      let list = byCity.get(city.name);
      if (!list) {
        list = [];
        byCity.set(city.name, list);
      }
      list.push(rabbi);
    } else {
      const region = regionOf(src);
      if (region === 'israel') unspecifiedIsrael.push(rabbi);
      else if (region === 'bavel') unspecifiedBavel.push(rabbi);
      // No city, no region: nowhere to put them on a two-region map.
    }
    const moved = src.identity?.moved ?? deriveMoveDirection(src.geography);
    if (moved) moverBuckets[moved].push(rabbi);
  }

  // One dot per city that has rabbis OR on-daf mentions.
  const cityNames = new Set<string>([...byCity.keys(), ...mentionCounts.keys()]);
  const cityByName = new Map(GEO_CITIES.map((c) => [c.name, c]));
  const dots: CityDot[] = [];
  for (const name of cityNames) {
    const city = cityByName.get(name);
    if (!city) continue;
    dots.push({
      city,
      rabbis: (byCity.get(name) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
      mentions: mentionCounts.get(name) ?? 0,
      mentionNames: mentionNamesByCity.get(name) ?? [],
    });
  }
  // Stable order: north to south within the data (y ascending), so cluster
  // rendering is deterministic.
  dots.sort((a, b) => a.city.y - b.city.y || a.city.name.localeCompare(b.city.name));

  for (const dir of DIR_ORDER) moverBuckets[dir].sort((a, b) => a.name.localeCompare(b.name));
  const moverRows: MoverRow[] = DIR_ORDER.flatMap((direction) =>
    moverBuckets[direction].map((r) => ({ name: r.name, slug: r.slug, direction })),
  );

  let israelCount = unspecifiedIsrael.length;
  let bavelCount = unspecifiedBavel.length;
  for (const d of dots) {
    if (d.city.region === 'israel') israelCount += d.rabbis.length;
    else bavelCount += d.rabbis.length;
  }

  return {
    dots,
    unspecifiedIsrael: unspecifiedIsrael.slice().sort((a, b) => a.name.localeCompare(b.name)),
    unspecifiedBavel: unspecifiedBavel.slice().sort((a, b) => a.name.localeCompare(b.name)),
    moverRows,
    israelCount,
    bavelCount,
    empty: dots.length === 0 && unspecifiedIsrael.length === 0 && unspecifiedBavel.length === 0,
  };
}
