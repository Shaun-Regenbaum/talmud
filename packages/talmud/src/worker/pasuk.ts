/**
 * One Tanach verse (Hebrew + English) from Sefaria, KV-cached under the
 * `pasuk:` key family for a year. The single fetch path behind GET /api/pasuk,
 * the pesukim prompt injection (`{{pasuk_he}}`), and the pesukim study view —
 * previously three copies of the same cache-then-Sefaria dance.
 */

import { z } from 'zod';
import { sefariaAPI } from '../lib/sefref';
import { keyForPasuk } from './cache-keys';
import { kvGetJSONAs } from './kv-json';

/** What a cached verse must carry to be servable: the ref it is for and the two
 *  text sides. The neighbour refs are derived and may legitimately be absent. */
const pasukDetailShape = z.looseObject({
  ref: z.string(),
  he: z.string(),
  en: z.string(),
});

export interface PasukDetail {
  /** Canonical Sefaria ref, e.g. "Proverbs 3:12". */
  ref: string;
  heRef: string | null;
  he: string;
  en: string;
  prevRef: string | null;
  nextRef: string | null;
  book: string | null;
}

// Sefaria returns HTML-ish text (entities, <i> / <b> / <span> tags) and
// editorial marks like {פ} / {ס} inside the Hebrew. Decode the entities, drop
// the editorial marks, and collapse whitespace so callers get clean
// nikud-bearing text.
export function cleanVerseText(s: string): string {
  if (!s) return '';
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&thinsp;/gi, ' ')
    .replace(/&ensp;/gi, ' ')
    .replace(/&emsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\{[פסש]\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The KV key for a ref (sanitized the same way on every path). */
export function pasukCacheKey(ref: string): string {
  return keyForPasuk(ref.replace(/[^A-Za-z0-9 .:-]/g, '_'));
}

/**
 * Sefaria's response.prev/next is chapter-level for many books; we want
 * verse-level stepping, so parse the canonical ref into (book, chapter, verse)
 * and step ±1. Chapter boundaries fall through to a 404 on the next fetch.
 */
function neighbours(canonical: string): { prevRef: string | null; nextRef: string | null } {
  const m = canonical.match(/^(.+?)\s+(\d+):(\d+)$/);
  if (!m) return { prevRef: null, nextRef: null };
  const [, book, chap, verseStr] = m;
  const verse = parseInt(verseStr, 10);
  return {
    prevRef: verse > 1 ? `${book} ${chap}:${verse - 1}` : null,
    nextRef: `${book} ${chap}:${verse + 1}`,
  };
}

/**
 * Cache-first verse fetch. Resolves `{ detail, cached }`; throws on a Sefaria
 * failure (callers decide whether that is a 502 or a quiet blank).
 */
export async function fetchPasuk(
  env: { CACHE?: KVNamespace },
  ref: string,
): Promise<{ detail: PasukDetail; cached: boolean }> {
  const cache = env.CACHE;
  const key = pasukCacheKey(ref);
  if (cache) {
    const hit = await kvGetJSONAs<PasukDetail>(cache, key, pasukDetailShape);
    if (hit) return { detail: hit, cached: true };
  }
  const res = await sefariaAPI.getText(ref, { context: 0 });
  const heRaw = Array.isArray(res.he) ? res.he.join(' ') : (res.he ?? '');
  const enRaw = Array.isArray(res.text) ? res.text.join(' ') : (res.text ?? '');
  const canonical = res.ref ?? ref;
  const detail: PasukDetail = {
    ref: canonical,
    heRef: res.heRef ?? null,
    he: cleanVerseText(heRaw),
    en: cleanVerseText(enRaw),
    ...neighbours(canonical),
    book: res.book ?? null,
  };
  if (cache && detail.he) {
    await cache.put(key, JSON.stringify(detail), { expirationTtl: 60 * 60 * 24 * 365 });
  }
  return { detail, cached: false };
}
