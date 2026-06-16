/**
 * externalRefs — parse a Sefaria reference string into an `AnchorCoord` on an
 * external spine, so the pesukim + halacha producers can emit real Links INTO
 * Tanach / the codifier codes (see dafLinks.ts).
 *
 * Both encodings round-trip to the correct modern Anchor via the existing
 * coord bridge: a tanach verse → {spine:'tanach', path:[book, chapter, verse]};
 * a codifier ref → {spine:<codifier>, path:[section, chapter, entry]}. Precision
 * over recall: a ref that doesn't parse cleanly returns null and is dropped
 * rather than guessed.
 *
 * Pure (codifiers.ts is pure) — unit-tested against real Sefaria ref shapes.
 */

import { type AnchorCoord, DAF_SEG } from '@corpus/core/context/coord';
import { classifyCodifier } from '../halacha/codifiers.ts';
import { TANACH_SPINE } from './externalSpines.ts';

/** Trailing " <chapter>:<verse>" / " <chapter>" location, allowing (and
 *  discarding) a range tail ("19:5-7", "1:1-3"). The head (group 1) is the
 *  book / Sefaria index_title; book names are multi-word, so the head is lazy
 *  and the location is anchored to the end. */
const LOCATION = /^(.+?)\s+(\d+)(?::(\d+))?(?:[-–]\d+(?::\d+)?)?$/;

/**
 * "Genesis 19:5" / "I Samuel 1:3" / "Song of Songs 2:8" / "Psalms 23" → a coord
 * on the Tanach spine (book→tractate, chapter→page, verse→seg). A verse-less ref
 * (chapter only) anchors at DAF_SEG (chapter level); a range keeps the start
 * verse. Null when there is no numeric location to anchor.
 */
export function parseVerseRef(ref: string): AnchorCoord | null {
  const m = (ref ?? '').trim().match(LOCATION);
  if (!m) return null;
  const book = m[1].trim();
  if (!book) return null;
  return {
    spine: TANACH_SPINE,
    tractate: book,
    page: m[2],
    seg: m[3] !== undefined ? Number(m[3]) : DAF_SEG,
  };
}

/**
 * "Mishneh Torah, Reading the Shema 1:1" / "Shulchan Arukh, Orach Chayim 235:1"
 * / "Mishnah Berurah 235:1" → a coord on the codifier's code spine: the Sefaria
 * sub-book → tractate (section, empty for works addressed by siman alone),
 * chapter→page, halacha/seif→seg. The work prefix selects the spine. Null for a
 * non-codifier ref (the noisy tail of Sefaria's "Halakhah" category) or one with
 * no numeric location.
 */
export function parseCodifierRef(ref: string): AnchorCoord | null {
  const s = (ref ?? '').trim();
  const codifier = classifyCodifier(s);
  if (!codifier) return null;
  const m = s.match(LOCATION);
  if (!m) return null;
  // The head is the Sefaria index_title ("Mishneh Torah, Reading the Shema");
  // strip the codifier's work prefix + the joining comma to get the section.
  const section = m[1]
    .replace(codifier.prefix, '')
    .replace(/^[,\s]+/, '')
    .trim();
  return {
    spine: codifier.id,
    tractate: section,
    page: m[2],
    seg: m[3] !== undefined ? Number(m[3]) : DAF_SEG,
  };
}
