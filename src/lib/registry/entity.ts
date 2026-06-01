/**
 * EntityPiece — a first-class, addressable view of a "global" entity (a rabbi or
 * a place) assembled from its already-computed global enrichments.
 *
 * Rabbi/place enrichments are `scope: 'global'` (cached per-entity, daf-agnostic),
 * so the entity's facts already live in the cache keyed by name. Today they're
 * only reachable by clicking the entity on some daf. This makes the entity
 * itself addressable: GET /api/entity/rabbi/:slug · /api/entity/place/:name
 * returns the assembled pieces. READ-ONLY — the endpoint never triggers an LLM
 * run; a piece is `null` until something has warmed it.
 *
 * Pure data shape (no client/worker imports) so it can live in src/lib and be
 * shared by the worker (producer) and any future consumer.
 */
export type EntityType = 'rabbi' | 'place';

export interface EntityPiece {
  type: EntityType;
  /** Canonical id: the rabbi's Sefaria slug, or the place name. */
  id: string;
  name: string;
  nameHe?: string;
  /** The entity's global pieces as cached (parsed enrichment output), keyed by
   *  the bare leaf name (e.g. `identity`, `relationships`, `geography` for a
   *  rabbi; `profile`, `significance`, `figures` for a place). `null` when that
   *  piece hasn't been computed yet. */
  pieces: Record<string, unknown>;
}
