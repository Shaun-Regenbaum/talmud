/**
 * Shared Sefaria source helpers for the tanach worker — the one SefariaClient
 * instance plus the fetch/normalize helpers both the plain routes
 * (/api/commentary, /api/gemara, /api/midrash) and the producer source
 * resolvers (run-ports.ts) consume. Extracted from index.ts verbatim so the
 * producer pipeline can import them without a circular dependency on the app.
 */

import { flattenPieces, pickV3Version, SefariaClient } from '@corpus/core/sefaria/client';
import { COMMENTATORS } from '../lib/commentators.ts';

export const sefaria = new SefariaClient();

/** Strip Sefaria's inline footnote apparatus (the marker + the expanded note
 *  text), which otherwise renders mid-verse. Keeps benign inline tags like the
 *  large/small-letter <big>/<small> markup. */
export function stripFootnotes(html: string): string {
  return html
    .replace(/<sup class="footnote-marker">.*?<\/sup>/g, '')
    .replace(/<i class="footnote">.*?<\/i>/g, '')
    .trim();
}

/** Sefaria returns he/text as a per-verse string array for a chapter ref (or a
 *  bare string for a single verse). Normalize to a string[], footnotes stripped. */
export function asVerses(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v.map((s) => (typeof s === 'string' ? stripFootnotes(s) : ''));
  return typeof v === 'string' ? [stripFootnotes(v)] : [];
}

export interface VerseCommentary {
  key: string;
  en: string;
  heName: string;
  he: string[];
  enText: string[];
}

/** Fetch each curated commentator's note on a verse from Sefaria (he+en), drop
 *  the empties. Shared by the commentary drawer and the synthesis producer. */
export async function fetchVerseCommentaries(
  book: string,
  chapter: string,
  verse: string,
): Promise<VerseCommentary[]> {
  const results = await Promise.all(
    COMMENTATORS.map(async (cm) => {
      const ref = `${cm.title} on ${book} ${chapter}:${verse}`;
      try {
        const v3 = await sefaria.getTextV3(ref);
        const he = flattenPieces(pickV3Version(v3.versions, 'he')).filter((s) => s.trim());
        const en = flattenPieces(pickV3Version(v3.versions, 'en')).filter((s) => s.trim());
        if (!he.length && !en.length) return null;
        return { key: cm.key, en: cm.en, heName: cm.he, he, enText: en };
      } catch {
        return null;
      }
    }),
  );
  return results.filter((r): r is VerseCommentary => r !== null);
}

export interface SourcePassage {
  ref: string;
  he: string;
  en: string;
}

/** Distinct citing passages of one Sefaria category for a verse (Talmud /
 *  Midrash), capped, each with a fetched text snippet. `bavliFirst` floats the
 *  Bavli ahead of Yerushalmi / minor tractates. */
export async function fetchPassages(
  ref: string,
  category: string,
  cap: number,
  bavliFirst = false,
): Promise<{ count: number; passages: SourcePassage[] }> {
  type Link = { category?: string; ref?: string; sourceRef?: string; index_title?: string };
  const r = await fetch(`https://www.sefaria.org/api/links/${encodeURIComponent(ref)}?with_text=0`);
  const links = (await r.json()) as Link[];
  const seen = new Set<string>();
  const picked: { ref: string; title: string }[] = [];
  for (const l of Array.isArray(links) ? links : []) {
    if (l.category !== category) continue;
    const sref = l.sourceRef || l.ref;
    if (!sref || seen.has(sref)) continue;
    seen.add(sref);
    picked.push({ ref: sref, title: l.index_title ?? '' });
  }
  if (bavliFirst) {
    picked.sort(
      (a, b) =>
        Number(/^(Jerusalem|Tractate)/.test(a.title)) -
        Number(/^(Jerusalem|Tractate)/.test(b.title)),
    );
  }
  const passages = await Promise.all(
    picked.slice(0, cap).map(async (p) => {
      try {
        const v3 = await sefaria.getTextV3(p.ref);
        const he = flattenPieces(pickV3Version(v3.versions, 'he'))
          .join(' ')
          .replace(/<[^>]+>/g, '')
          .trim()
          .slice(0, 420);
        const en = flattenPieces(pickV3Version(v3.versions, 'en'))
          .join(' ')
          .replace(/<[^>]+>/g, '')
          .trim()
          .slice(0, 420);
        return { ref: p.ref, he, en };
      } catch {
        return { ref: p.ref, he: '', en: '' };
      }
    }),
  );
  return { count: picked.length, passages };
}
