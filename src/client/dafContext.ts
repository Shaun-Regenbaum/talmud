import type { GenerationId } from './generations';

// The single unit of state shared by underlines, timeline, geography map,
// and the bio sidebar. Produced by /api/daf-context by joining the AI
// model's output with the precomputed Sefaria-derived rabbi-places dataset.
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

export interface DafContext {
  rabbis: IdentifiedRabbi[];
}
