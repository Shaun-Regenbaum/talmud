/**
 * linkTarget — the ONE place that answers, for any coordinate a piece links to:
 * what corpus is it, can we open it in our reader, and at what URL.
 *
 * Every "connection" in the app (a parallel sugya, the Yerushalmi, a cited daf,
 * a verse, a commentary) is a `Link` pointing at an `AnchorCoord`. Each surface
 * that renders one (the spine exit chips, the overview cross-references, the
 * halacha derivation, …) used to re-implement "is this a Bavli daf / how do I
 * navigate there" — several copies of `dafHref` + ref-shape regexes. This pure
 * resolver centralizes that so they all agree; the chip/view layers build on it.
 *
 * Pure + DOM-free: returns a RELATIVE reader href (`?tractate=&page=`, which the
 * browser resolves against the SPA root and which drops any hash), so it needs
 * no `window` and is unit-testable.
 */

import type { AnchorCoord } from '@corpus/core/context/coord';
import { coordLabel } from '@corpus/core/context/types';

/** Which text family a target belongs to. Context-free (a function of the coord
 *  alone) — "same tractate as the daf in view" is a view concern, not here. */
export type LinkCorpus = 'bavli' | 'yerushalmi' | 'commentary' | 'other';

export interface LinkTarget {
  /** Human label, e.g. "Berakhot 13a" / "Jerusalem Talmud Berakhot 1:1". */
  label: string;
  corpus: LinkCorpus;
  /** Whether we have an in-app reader for this target (only the Bavli daf today). */
  navigable: boolean;
  /** Relative reader URL when navigable (`?tractate=&page=`, hash cleared); else
   *  null. Used directly as an `<a href>` or assigned to `window.location.href`. */
  href: string | null;
}

/** A Bavli daf page is "<number><a|b>" (2a, 117b); the Yerushalmi + Tanakh use
 *  "<chapter>:<verse|halacha>", so the page shape disambiguates them. */
const BAVLI_PAGE = /^\d+[ab]$/;

export function linkCorpus(c: AnchorCoord): LinkCorpus {
  // A commentary spine (Rashi / Tosafot / a rishon) pinned over the daf.
  if (c.spine) return 'commentary';
  // The Yerushalmi is Sefaria `category:'Talmud'` with a distinct title.
  if (/^(?:Jerusalem Talmud|Yerushalmi)\b/i.test(c.tractate)) return 'yerushalmi';
  if (BAVLI_PAGE.test(c.page)) return 'bavli';
  // Tanakh verses, Tosefta, etc. — no in-app reader yet.
  return 'other';
}

export function linkTarget(c: AnchorCoord): LinkTarget {
  const corpus = linkCorpus(c);
  const navigable = corpus === 'bavli';
  const href = navigable
    ? `?tractate=${encodeURIComponent(c.tractate)}&page=${encodeURIComponent(c.page)}`
    : null;
  return { label: coordLabel(c), corpus, navigable, href };
}

/** Convenience for the common `{ tractate, page }` (daf-level) case — callers
 *  that hold a daf reference rather than a full coord. */
export function dafTarget(daf: { tractate: string; page: string }): LinkTarget {
  return linkTarget({ tractate: daf.tractate, page: daf.page, seg: -1 });
}
