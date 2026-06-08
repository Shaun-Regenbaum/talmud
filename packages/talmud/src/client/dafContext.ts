import type { GenerationId } from './generations';

// The unit of identified-rabbi state shared by underlines, timeline, geography
// map, and the bio sidebar. Sourced from the `rabbi` mark run (name/nameHe/
// generation) joined with the rabbi.identity enrichment (slug/region/places/
// moved, from the Sefaria-derived rabbi-places dataset).
export type Movement = 'bavel->israel' | 'israel->bavel' | 'both' | null;

export interface IdentifiedRabbi {
  slug: string | null;
  name: string;
  nameHe: string;
  generation: GenerationId;
  region: 'israel' | 'bavel' | null;
  places: string[];
  moved: Movement;
  bio: string | null;
  image: string | null;
  wiki: string | null;
}
