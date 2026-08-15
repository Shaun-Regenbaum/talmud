/**
 * Joining the geography producer's NAMED places to real coordinates.
 *
 * The producer only names places; coordinates come deterministically from the
 * bundled gazetteer (worker/gazetteer.ts). This module is the join, kept pure
 * (the lookup is injected) so the rules below are testable:
 *
 *   place-or-omit  a name the gazetteer can't locate is dropped, because a
 *                  wrong pin is worse than a missing one
 *   one pin per PLACE, not per point — two names that resolve to the SAME
 *                  gazetteer entry are the same place named twice, but two
 *                  different entries that happen to share a coordinate are
 *                  two places and both belong on the map
 */

export interface NamedPlace {
  en?: string;
  he?: string;
  verses?: number[];
}

export interface LocatedPlace {
  en: string;
  he: string;
  lat: number;
  lng: number;
  verses: number[];
}

export interface GazetteerHit {
  name: string;
  lat: number;
  lng: number;
}

/**
 * Resolve the producer's named places to mappable ones.
 *
 * Deduping on the gazetteer ENTRY rather than on `lat,lng` matters: the
 * gazetteer gives several unlocated biblical names the same fallback point
 * (Havilah and Babylon both sit at 32.5433, 44.4222), and keying on the
 * coordinate silently dropped the second one — Genesis 10 lost Havilah
 * entirely. Names that resolve to the same entry (Ai / Aiath / Aija) still
 * collapse to one pin, which is the case dedupe is actually for.
 */
export function locatePlaces(
  places: readonly NamedPlace[] | undefined,
  lookup: (name: string) => GazetteerHit | null,
): LocatedPlace[] {
  const seen = new Set<string>();
  const out: LocatedPlace[] = [];
  for (const place of places ?? []) {
    const en = String(place?.en ?? '').trim();
    if (!en) continue;
    const hit = lookup(en);
    if (!hit) continue;
    if (seen.has(hit.name)) continue;
    seen.add(hit.name);
    out.push({
      en,
      he: String(place?.he ?? '').trim(),
      lat: hit.lat,
      lng: hit.lng,
      verses: Array.isArray(place?.verses)
        ? place.verses.filter((verse) => Number.isInteger(verse) && verse >= 1)
        : [],
    });
  }
  return out;
}
