/**
 * linkTarget — the ONE place that answers, for any coordinate a piece links to:
 * what corpus is it, can we open it, and at what URL.
 *
 * Every "connection" in the app (a parallel sugya, the Yerushalmi, a cited daf,
 * a verse, a commentary, a halachic code) is a `Link` pointing at an
 * `AnchorCoord`. Each surface that renders one (the spine exit chips, the
 * overview cross-references, the halacha derivation, …) used to re-implement "is
 * this a Bavli daf / how do I navigate there". This pure resolver centralizes
 * that so they all agree; the chip/view layers build on it.
 *
 * Pure + DOM-free: returns either a RELATIVE in-app reader href (`?tractate=&
 * page=`) or an ABSOLUTE cross-app href (the Tanach reader), with `external`
 * saying which — so it needs no `window` and is unit-testable.
 */

import type { AnchorCoord } from '@corpus/core/context/coord';
import { coordLabel } from '@corpus/core/context/types';
import { codifierShort, corpusOfSpine } from './externalSpines.ts';

/** Which text family a target belongs to. Context-free (a function of the coord
 *  alone) — "same tractate as the daf in view" is a view concern, not here. */
export type LinkCorpus = 'bavli' | 'yerushalmi' | 'commentary' | 'tanach' | 'halacha' | 'other';

export interface LinkTarget {
  /** Human label: "Berakhot 13a" / "Genesis 19:5" / "Rambam · Reading the Shema 1:1". */
  label: string;
  corpus: LinkCorpus;
  /** Whether we can open this target (the Bavli daf in our reader, a pasuk in
   *  the sister Tanach reader). */
  navigable: boolean;
  /** The href when navigable: a RELATIVE in-app URL (`?tractate=&page=`) for a
   *  Bavli daf, or an ABSOLUTE cross-app URL for a pasuk; null otherwise. */
  href: string | null;
  /** True when `href` points to another app/site (open in a new tab); false for
   *  an in-app relative href. */
  external: boolean;
}

/** A Bavli daf page is "<number><a|b>" (2a, 117b); the Yerushalmi + Tanakh use
 *  "<chapter>:<verse|halacha>", so the page shape disambiguates them. */
const BAVLI_PAGE = /^\d+[ab]$/;

/** The sister Tanach reader — a pasuk link opens the containing chapter there. */
const TANACH_APP = 'https://tanach.shaunregenbaum.com';

export function linkCorpus(c: AnchorCoord): LinkCorpus {
  // An external corpus spine the daf links INTO: a pasuk ('tanach') or a
  // halachic code ('mishneh-torah' / 'shulchan-aruch' / …). Checked before the
  // commentary fallback, since those also carry a `spine`.
  const external = corpusOfSpine(c.spine);
  if (external) return external;
  // A commentary spine (Rashi / Tosafot / a rishon) pinned over the daf.
  if (c.spine) return 'commentary';
  // The Yerushalmi is Sefaria `category:'Talmud'` with a distinct title.
  if (/^(?:Jerusalem Talmud|Yerushalmi)\b/i.test(c.tractate)) return 'yerushalmi';
  if (BAVLI_PAGE.test(c.page)) return 'bavli';
  // Tanakh verses cited spine-less (legacy), Tosefta, etc. — no in-app reader.
  return 'other';
}

export function linkTarget(c: AnchorCoord): LinkTarget {
  const corpus = linkCorpus(c);
  if (corpus === 'tanach') {
    // A pasuk: "Genesis 19:5", opening the chapter in the Tanach reader.
    const label = `${c.tractate} ${c.page}${c.seg >= 0 ? `:${c.seg}` : ''}`;
    const href = `${TANACH_APP}/?book=${encodeURIComponent(c.tractate)}&chapter=${encodeURIComponent(c.page)}`;
    return { label, corpus, navigable: true, href, external: true };
  }
  if (corpus === 'halacha') {
    // A codifier ref: an inert chip ("Rambam · Reading the Shema 1:1"). The rich
    // view is the halacha card (the marker's expansion), not a jump out.
    const short = (c.spine && codifierShort(c.spine)) || c.spine || '';
    const where =
      `${c.tractate ? `${c.tractate} ` : ''}${c.page}${c.seg >= 0 ? `:${c.seg}` : ''}`.trim();
    return {
      label: short ? `${short} · ${where}` : where,
      corpus,
      navigable: false,
      href: null,
      external: false,
    };
  }
  const navigable = corpus === 'bavli';
  const href = navigable
    ? `?tractate=${encodeURIComponent(c.tractate)}&page=${encodeURIComponent(c.page)}`
    : null;
  return { label: coordLabel(c), corpus, navigable, href, external: false };
}

/** Convenience for the common `{ tractate, page }` (daf-level) case — callers
 *  that hold a daf reference rather than a full coord. */
export function dafTarget(daf: { tractate: string; page: string }): LinkTarget {
  return linkTarget({ tractate: daf.tractate, page: daf.page, seg: -1 });
}
