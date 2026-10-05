/**
 * @fileoverview Chapter (perek) boundaries per tractate.
 *
 * Saved from Sefaria's "Chapters" alt structure (the index API), so the reader
 * never calls Sefaria for this. A chapter often starts partway down a page, so
 * `start` is the page it begins on, not a clean top-of-page.
 */
import perakimData from './data/perakim.json';

export interface Perek {
  /** 1-based chapter number. */
  n: number;
  /** Page the chapter begins on, e.g. "20b". */
  start: string;
  he: string;
  en: string;
}

const DATA = perakimData as unknown as Record<string, [string, string, string][]>;

export function perakimOf(tractate: string): Perek[] {
  return (DATA[tractate] ?? []).map(([start, he, en], i) => ({ n: i + 1, start, he, en }));
}

/** Sort key for a page like "20b": 2a < 2b < 3a. */
function pageKey(p: string): number {
  const m = p.match(/^(\d+)([ab])$/);
  return m ? Number(m[1]) * 2 + (m[2] === 'b' ? 1 : 0) : 0;
}

/** The chapter a page falls in (the last one that starts on or before it). */
export function perekAt(perakim: Perek[], page: string): Perek | undefined {
  const k = pageKey(page);
  let hit: Perek | undefined;
  for (const p of perakim) {
    if (pageKey(p.start) <= k) hit = p;
    else break;
  }
  return hit;
}
