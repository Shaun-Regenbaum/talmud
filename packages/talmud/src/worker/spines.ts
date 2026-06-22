/**
 * The talmud app's spine registry — the addressable text spaces its pieces pin
 * to or link INTO, expressed through the SAME core SpineRegistry the tanach app
 * uses (@corpus/core/model/spine):
 *
 *   - 'bavli'   (tractate/page/seg) — the home spine: the daf itself.
 *   - 'tanach'  (book/chapter/verse) — the scripture spine a pasuk cites INTO;
 *               mirrors the tanach app's own spine so the two agree on coords.
 *   - one spine per canonical codifier ('mishneh-torah', 'shulchan-aruch', …) —
 *               the halachic-code spines a daf is CODIFIED into. Levels are
 *               generic (section/chapter/entry); `section` is the Sefaria
 *               sub-book ("Reading the Shema", "Orach Chayim") and may be empty
 *               for works addressed by siman alone (Mishnah Berurah). These are
 *               TARGET-only spines (we host no reader for them — the rich view is
 *               the halacha card), so they carry no order beyond the lineage.
 *
 * Wiring the reserved 'external' anchor of the four-primitive model: until now no
 * spine consumed a non-Gemara target. These do.
 *
 * Entity spines ('entity:rabbi', 'entity:place') are the registries the "global"
 * rabbi/place enrichments belong to — one position per entity, addressed by its
 * identity slug. They are UNORDERED (kind:'entity'); their single level is the
 * id, normalized through the SAME `slugId` the cache uses for an enrichment's
 * `instance_id`, so an entity anchor's id is byte-identical to the cached key
 * (e.g. entity:rabbi/'rav_huna' ⇄ enrich:rabbi.bio:5:rav_huna). No cache key
 * changes — this only gives those pieces an honest place to sit.
 */

import { slugId } from '@corpus/core/cache/keys';
import { createSpineRegistry, type RefPart, type SpineDef } from '@corpus/core/model/spine';
import { CODIFIERS } from '../lib/halacha/codifiers.ts';

const codifierSpines: SpineDef[] = CODIFIERS.map((c) => ({
  id: c.id,
  kind: 'text',
  label: c.label,
  levels: ['section', 'chapter', 'entry'],
}));

/** entity:* spines: one level (the id), slugged to the cache's instance_id.
 *  NB: matches instanceIdOf byte-for-byte for the real inputs (English
 *  `fields.name`); a degenerate/Hebrew-only name would slug to "_" here while
 *  instanceIdOf falls back to a hash — not a corpus case (rabbi/place marks
 *  always carry an English name), and the authoritative id downstream is
 *  instanceIdOf's output, not a raw name run back through this. */
const entitySpine = (id: string, label: string): SpineDef => ({
  id,
  kind: 'entity',
  label,
  levels: ['id'],
  normalizePath: (path: RefPart[]) => [slugId(String(path[0]))],
});

export const talmudSpines = createSpineRegistry([
  { id: 'bavli', kind: 'text', label: 'Talmud Bavli', levels: ['tractate', 'page', 'seg'] },
  { id: 'tanach', kind: 'text', label: 'Tanach', levels: ['book', 'chapter', 'verse'] },
  ...codifierSpines,
  entitySpine('entity:rabbi', 'Rabbi'),
  entitySpine('entity:place', 'Place'),
]);
