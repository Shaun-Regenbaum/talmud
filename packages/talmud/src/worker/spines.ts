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
 */

import { createSpineRegistry, type SpineDef } from '@corpus/core/model/spine';
import { CODIFIERS } from '../lib/halacha/codifiers.ts';

const codifierSpines: SpineDef[] = CODIFIERS.map((c) => ({
  id: c.id,
  kind: 'text',
  label: c.label,
  levels: ['section', 'chapter', 'entry'],
}));

export const talmudSpines = createSpineRegistry([
  { id: 'bavli', kind: 'text', label: 'Talmud Bavli', levels: ['tractate', 'page', 'seg'] },
  { id: 'tanach', kind: 'text', label: 'Tanach', levels: ['book', 'chapter', 'verse'] },
  ...codifierSpines,
]);
