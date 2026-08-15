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
 *   a hard cap     so a town-list chapter yields a readable map, whatever the
 *                  model returned
 */

/** The most pins one chapter's map carries. The producer is asked for at most
 *  this many, but on the deployed path that instruction is prompt guidance
 *  rather than a provider-enforced grammar (first-party DeepSeek can't honour
 *  json_schema, so the schema is inlined as text — see core llm.ts
 *  `inlineSchemaForFirstParty`). The cap is therefore applied HERE too, where
 *  it actually holds: a border survey that comes back with a hundred towns
 *  becomes a readable map instead of a wall of dots. */
export const MAX_MAPPED_PLACES = 40;

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
 * Dedupe keys on the gazetteer ENTRY, not on `lat,lng`. The coordinate is not
 * an identity: 774 of the gazetteer's 1330 entries share a coordinate with
 * another (the Jerusalem point alone carries 57 names), because neighbouring
 * sites round together and unlocated names get a regional fallback. Keying on
 * the coordinate therefore deleted real places — in the live data, Joshua 19
 * files Beer-sheba, Hazar-shual and Eltolad at one point and Numbers 33 files
 * Tahath, Terah and Mithkah at another, so two of each three were silently
 * dropped from those maps.
 *
 * The trade this makes: OpenBible also records some alias pairs as separate
 * entries at one site (Ai / Aiath, Ephrath / Bethlehem), and those now draw
 * two pins, which the map's de-overlap spiral fans apart. That is a small
 * cosmetic cost — both names really are in the text — against a systematic
 * loss of places the reader was never shown at all. Entry granularity is the
 * gazetteer's own notion of a place, so it is what we defer to.
 */
export function locatePlaces(
  places: readonly NamedPlace[] | undefined,
  lookup: (name: string) => GazetteerHit | null,
  cap: number = MAX_MAPPED_PLACES,
): LocatedPlace[] {
  const seen = new Set<string>();
  const out: LocatedPlace[] = [];
  for (const place of places ?? []) {
    if (out.length >= cap) break;
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
