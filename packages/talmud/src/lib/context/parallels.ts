/**
 * talmudParallels — project a daf's Talmud↔Talmud cross-references (the
 * "Mesorat HaShas" apparatus: where the same sugya, baraita, or dispute recurs
 * elsewhere in Shas) into the shared Link vocabulary.
 *
 * The data is Sefaria's `category: "Talmud"` related links — a human-curated
 * apparatus, so the edges are high-precision by construction. Each link carries
 * `anchorRef` (the segment on THIS daf) and `ref` (the parallel passage). This
 * pure module parses those refs to global coordinates and emits one
 * `relation: 'parallels'` DafLink per cross-reference (`via: 'mesorah'`), so a
 * parallel sugya joins the daf/tractate link graph exactly like a flow edge or
 * a citation — no bespoke encoding.
 *
 * PRECISION over recall: a ref that doesn't parse to a Bavli coordinate
 * (Yerushalmi chapter:halacha, a Tanakh verse) is dropped, not guessed, and a
 * parallel that points back onto the same daf carries no cross-daf information
 * so it is dropped too.
 */

import { type AnchorCoord, coordForSeg, DAF_SEG, type DafRef } from '@corpus/core/context/coord';
import type { TalmudParallel } from '../sefref/sefaria/client.ts';
import type { DafLink } from './dafLinks.ts';

/**
 * Parse a Sefaria Bavli ref into an `AnchorCoord` at its START coordinate.
 * Handles multi-word tractate names ("Bava Metzia 59a", "Rosh Hashanah 16b:3"),
 * an optional segment (Sefaria's 1-indexed `:N` → 0-indexed), and ranges of
 * either form ("31a:5-7" or the cross-daf "59a:12-59b:7") — the trailing range
 * is ignored and the start coordinate taken. A bare daf ref ("Shabbat 31a") is
 * daf-level ({@link DAF_SEG}). Returns null for anything that isn't a BAVLI
 * "<words> <daf>[:seg]" ref: Yerushalmi chapter:halacha + Tanakh verses fail the
 * shape, and folio-style Yerushalmi ("Jerusalem Talmud Berakhot 2a") — which is
 * also Sefaria `category:'Talmud'` and DOES match the shape — is rejected by
 * title, since the Bavli↔Yerushalmi parallel is a separate, richer producer.
 */
export function parseTalmudRef(ref: string): AnchorCoord | null {
  const m = (ref ?? '').trim().match(/^(.+?)\s+(\d+[ab])(?::(\d+))?(?:[-–].*)?$/);
  if (!m) return null;
  const tractate = m[1];
  const page = m[2];
  // The Yerushalmi shares the category:'Talmud' channel and a folio ref shape,
  // but it is a different spine/corpus — keep this Bavli-parallels path clean.
  if (/^(?:Jerusalem Talmud|Yerushalmi)\b/i.test(tractate)) return null;
  if (!m[3]) return { tractate, page, seg: DAF_SEG };
  const seg = Number.parseInt(m[3], 10) - 1;
  if (!Number.isFinite(seg) || seg < 0) return null;
  return { tractate, page, seg };
}

/** The 0-indexed source segment a parallel anchors to on the current daf — the
 *  start segment of the anchorRef, or 0 when the apparatus anchors the whole
 *  daf. Reuses {@link parseTalmudRef} so ranges resolve to their start. */
function anchorSeg(anchorRef: string): number {
  const c = parseTalmudRef(anchorRef);
  return c && c.seg >= 0 ? c.seg : 0;
}

/**
 * Project a daf's Talmud parallels into DafLinks (`relation: 'parallels'`,
 * `via: 'mesorah'`): source = the anchored segment on THIS daf, target = the
 * parallel passage elsewhere in Shas. Drops self-links (a parallel onto the same
 * daf) and refs that don't parse to a Bavli coordinate, and dedupes identical
 * (source-segment, target) pairs.
 */
export function talmudParallelsToLinks(
  daf: DafRef,
  parallels: readonly TalmudParallel[],
): DafLink[] {
  const out: DafLink[] = [];
  const seen = new Set<string>();
  for (const p of parallels) {
    const target = parseTalmudRef(p.targetRef);
    if (!target) continue;
    if (target.tractate === daf.tractate && target.page === daf.page) continue;
    const source = coordForSeg(daf, anchorSeg(p.anchorRef));
    const dedup = `${source.seg}|${target.tractate}:${target.page}:${target.seg}`;
    if (seen.has(dedup)) continue;
    seen.add(dedup);
    out.push({ via: 'mesorah', source, relation: 'parallels', targets: [target] });
  }
  return out;
}
