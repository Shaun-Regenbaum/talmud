/**
 * Spine — one of the four primitives (Spine / Anchor / Artifact / Producer).
 *
 * A spine is an addressable text or entity space artifacts pin to: the Bavli
 * ('bavli', levels tractate/page/seg), Tanach ('tanach', book/chapter/verse), a
 * commentary work ('rashi'), or an entity registry ('entity:rabbi', one level —
 * the entity id). Text spines are ordered (reading order); entity spines are
 * not. A reference INTO a spine is a path of components, one per level, and may
 * stop early: a truncated path names the containing division (e.g.
 * ['Berakhot', '2a'] = the whole daf — this is what retires the DAF_SEG=-1
 * sentinel in the new model).
 */

export type RefPart = string | number;

export interface SpineDef {
  /** 'bavli', 'tanach', 'rashi', 'entity:rabbi'. */
  id: string;
  kind: 'text' | 'entity';
  label?: string;
  /** Address levels, outermost first. bavli: ['tractate','page','seg'];
   *  tanach: ['book','chapter','verse']; entity:rabbi: ['id']. */
  levels: string[];
  /** Whether positions on this spine have a reading order. Defaults to true
   *  for kind='text', false for kind='entity' (see {@link isOrderedSpine}). */
  ordered?: boolean;
  /** Pure normalization hook (slugging, alias folding). Applied by
   *  {@link SpineRegistry.ref} after depth validation. */
  normalizePath?: (path: RefPart[]) => RefPart[];
}

/** The effective `ordered` flag with its kind-based default applied. */
export function isOrderedSpine(def: SpineDef): boolean {
  return def.ordered ?? def.kind === 'text';
}

export interface SpineRegistry {
  get(id: string): SpineDef | undefined;
  list(): SpineDef[];
  /** Validate + normalize a reference path into a spine: depth must be
   *  1..levels.length (truncated paths name divisions), then the spine's
   *  normalizePath hook applies. Throws on an unknown spine or bad depth. */
  ref(spineId: string, path: RefPart[]): RefPart[];
}

export function createSpineRegistry(defs: SpineDef[]): SpineRegistry {
  const byId = new Map<string, SpineDef>();
  for (const def of defs) {
    if (byId.has(def.id)) throw new Error(`duplicate spine id: ${def.id}`);
    byId.set(def.id, def);
  }
  return {
    get: (id) => byId.get(id),
    list: () => [...byId.values()],
    ref(spineId, path) {
      const def = byId.get(spineId);
      if (!def) throw new Error(`unknown spine: ${spineId}`);
      if (path.length < 1 || path.length > def.levels.length) {
        throw new Error(
          `spine ${spineId} expects a path of depth 1..${def.levels.length}, got ${path.length}`,
        );
      }
      return def.normalizePath ? def.normalizePath(path) : path;
    },
  };
}
