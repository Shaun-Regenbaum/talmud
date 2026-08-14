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

/**
 * Verse counts per chapter for a book, 1-indexed by chapter — Sefaria's shape
 * API (`/api/shape/Deuteronomy` -> `chapters: [46, 37, …]`). This is what lets
 * the parsha map place a unit at its true extent instead of an equal slice.
 *
 * Deliberately fetched rather than hand-kept in `books.ts` (see that file's
 * note on chapter counts), and cached for thirty days: the shape of a
 * biblical book does not change, so the only reason to re-ask is a Sefaria
 * data fix. Null on any failure — callers draw no map rather than a wrong one.
 */
export async function bookChapterLengths(
  cache: KVNamespace,
  book: string,
  waitUntil?: (promise: Promise<unknown>) => void,
): Promise<number[] | null> {
  const cacheKey = `shape:v1:${book}`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as unknown;
      if (Array.isArray(parsed) && parsed.every((n) => Number.isInteger(n) && n > 0)) {
        return parsed as number[];
      }
    } catch {
      // A malformed shape cache is a miss; the live fetch below repairs it.
    }
  }

  let chapters: unknown;
  try {
    const response = await fetch(`https://www.sefaria.org/api/shape/${encodeURIComponent(book)}`);
    if (!response.ok) return null;
    const body = (await response.json()) as unknown;
    // The endpoint answers with a list (a complex title can shape into several
    // entries); take the one that IS this book, else the first. A bare object
    // is accepted too, so a shape response that isn't wrapped still works.
    type ShapeEntry = { book?: string; chapters?: unknown };
    const entry: ShapeEntry | null = Array.isArray(body)
      ? ((body as ShapeEntry[]).find((candidate) => candidate?.book === book) ??
        (body[0] as ShapeEntry) ??
        null)
      : ((body as ShapeEntry) ?? null);
    chapters = entry?.chapters;
  } catch {
    return null;
  }
  if (!Array.isArray(chapters) || !chapters.every((n) => Number.isInteger(n) && n > 0)) return null;

  const lengths = chapters as number[];
  const write = cache.put(cacheKey, JSON.stringify(lengths), { expirationTtl: 30 * 24 * 3600 });
  if (waitUntil) waitUntil(write);
  else await write;
  return lengths;
}

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
