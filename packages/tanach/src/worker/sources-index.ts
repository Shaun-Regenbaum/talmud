/**
 * Per-chapter sources index — for each verse, how much commentary / Talmud /
 * Midrash points at it. Drives the reader's gutter icons (show the commentary
 * icon only where many comment) AND the warm-cron's per-verse gating (only warm
 * synthesis where there are commentators, midrash-synthesis where there is
 * midrash). No LLM — Sefaria fetches only, cached under srcidx:v4:{book}:{chapter}.
 *
 * Extracted from the GET /api/sources-index route so the cron can call the same
 * builder (cache-respecting) without an HTTP round trip.
 */

import { flattenPieces, pickV3Version } from '@corpus/core/sefaria/client';
import { COMMENTATORS } from '../lib/commentators.ts';
import { sefaria } from './sefaria-sources.ts';

export interface SrcIndexVerse {
  verse: number;
  /** How many of the curated commentators comment on this verse. */
  rishonim: number;
  /** Many commentators AND in the top fraction of the chapter by volume. */
  rich: boolean;
  /** Distinct Talmud citations of this verse. */
  gemara: number;
  /** Distinct Midrash citations of this verse. */
  midrash: number;
}
export interface SrcIndex {
  book: string;
  chapter: number;
  verses: SrcIndexVerse[];
}

const indexKey = (book: string, chapter: string) => `srcidx:v4:${book}:${chapter}`;

/** Read the cached index if present (no compute) — the cron uses this to gate
 *  per-verse warming without paying the Sefaria fetches. */
export async function readSourcesIndex(
  cache: KVNamespace,
  book: string,
  chapter: string,
): Promise<SrcIndex | null> {
  const raw = await cache.get(indexKey(book, chapter));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SrcIndex;
  } catch {
    return null;
  }
}

/** Build (or read from cache) the per-verse sources index for a chapter. */
export async function computeSourcesIndex(
  cache: KVNamespace,
  book: string,
  chapter: string,
): Promise<SrcIndex> {
  const cached = await readSourcesIndex(cache, book, chapter);
  if (cached) return cached;

  // Per verse: how many commentators, and the total weight (chars of Hebrew
  // commentary) — volume is a better "richness" signal than count, since in the
  // Torah almost every verse has several commentators.
  const acc = new Map<number, { n: number; w: number }>();
  await Promise.all(
    COMMENTATORS.map(async (cm) => {
      try {
        const v3 = await sefaria.getTextV3(`${cm.title} on ${book} ${chapter}`);
        const heArr = (() => {
          const he = pickV3Version(v3.versions, 'he');
          return Array.isArray(he) ? (he as unknown[]) : [];
        })();
        for (let i = 0; i < heArr.length; i++) {
          const segs = flattenPieces(heArr[i]).map((x) => x.replace(/<[^>]+>/g, '').trim());
          const chars = segs.join('').length;
          if (!chars) continue;
          const e = acc.get(i + 1) ?? { n: 0, w: 0 };
          e.n += 1;
          e.w += chars;
          acc.set(i + 1, e);
        }
      } catch {
        /* commentator absent on this book */
      }
    }),
  );
  // Talmud + Midrash citation counts per verse, from one chapter-wide links
  // fetch (Sefaria's link graph). Heavy for the busiest chapters (~6MB) —
  // best-effort: on failure the icons just don't show, the drawers still work.
  const gem = new Map<number, number>();
  const mid = new Map<number, number>();
  try {
    const r = await fetch(
      `https://www.sefaria.org/api/links/${encodeURIComponent(`${book} ${chapter}`)}?with_text=0`,
    );
    type Link = { category?: string; anchorVerse?: number; sourceRef?: string; ref?: string };
    const links = (await r.json()) as Link[];
    const gemSeen = new Map<number, Set<string>>();
    const midSeen = new Map<number, Set<string>>();
    for (const l of Array.isArray(links) ? links : []) {
      const v = l.anchorVerse;
      if (!v) continue;
      const ref = l.sourceRef || l.ref;
      if (!ref) continue;
      if (l.category === 'Talmud') {
        const s = gemSeen.get(v) ?? new Set<string>();
        s.add(ref);
        gemSeen.set(v, s);
      } else if (l.category === 'Midrash') {
        const s = midSeen.get(v) ?? new Set<string>();
        s.add(ref);
        midSeen.set(v, s);
      }
    }
    gemSeen.forEach((s, v) => {
      gem.set(v, s.size);
    });
    midSeen.forEach((s, v) => {
      mid.set(v, s.size);
    });
  } catch {
    /* links too heavy / unavailable — skip gemara+midrash counts */
  }

  const entries = [...acc.entries()].sort((a, b) => a[0] - b[0]);
  // "rich" = many commentators AND in the top fraction of this chapter by volume.
  const weights = entries.map(([, e]) => e.w).sort((a, b) => a - b);
  const cutoff = weights.length ? weights[Math.floor(weights.length * 0.6)] : 0;
  // union of verses that have any source so gemara/midrash-only verses still appear
  const allVerses = new Set<number>([...acc.keys(), ...gem.keys(), ...mid.keys()]);
  const verses: SrcIndexVerse[] = [...allVerses]
    .sort((a, b) => a - b)
    .map((verse) => {
      const e = acc.get(verse) ?? { n: 0, w: 0 };
      return {
        verse,
        rishonim: e.n,
        rich: e.n >= 3 && e.w >= cutoff,
        gemara: gem.get(verse) ?? 0,
        midrash: mid.get(verse) ?? 0,
      };
    });
  const payload: SrcIndex = { book, chapter: Number(chapter), verses };
  await cache.put(indexKey(book, chapter), JSON.stringify(payload));
  return payload;
}
