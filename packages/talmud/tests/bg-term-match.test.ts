/**
 * Tests for the deterministic Background-term matcher (src/lib/context/anchor/bg-term.ts).
 * It anchors dafyomi Background glossary/girsa items onto the daf segment(s)
 * that quote their Hebrew term verbatim.
 */

import type { ContextItem } from '@corpus/core/context/types';
import { describe, expect, it } from 'vitest';
import { matchBackgroundTerms } from '../src/lib/context/anchor/bg-term';

function bg(key: string, he: string, kind = 'glossary'): ContextItem {
  return {
    source: 'dafyomi:background',
    sourceLabel: 'Background',
    kind,
    key,
    title: { he, en: key },
    body: { en: 'def' },
    segs: [],
  };
}

// A small daf: niqqud + maqaf in seg 2 to exercise normalization.
const SEGS = [
  'אמר רב יהודה', // 0
  'תנו רבנן בהמה בחייה', // 1
  'מִן הָאַרְכּוּבָה וּלְמַטָּה כָּשֵׁר', // 2 (the term, vocalized)
  'דאגרמא ולבר', // 3
  'אמר רב יהודה שוב', // 4 (repeats "אמר רב יהודה")
];

describe('matchBackgroundTerms', () => {
  it('places a term on the single segment that quotes it (niqqud-insensitive)', () => {
    const items = [bg('g1', 'ארכובה')];
    const placed = matchBackgroundTerms(items, SEGS);
    expect(placed).toBe(1);
    expect(items[0].segs).toEqual([2]);
    expect(items[0].via).toBe('bg-term');
    expect(items[0].confidence).toBe(0.9);
  });

  it('matches a multi-word term as a contiguous run', () => {
    const items = [bg('g2', 'דאגרמא ולבר')];
    matchBackgroundTerms(items, SEGS);
    expect(items[0].segs).toEqual([3]);
  });

  it('matches whole words only — does not match inside a longer word', () => {
    // "רכובה" is a substring of "ארכובה" but not a whole word -> no placement.
    const items = [bg('g3', 'רכובה')];
    expect(matchBackgroundTerms(items, SEGS)).toBe(0);
    expect(items[0].segs).toEqual([]);
  });

  it('places on multiple segments (<=3) with lower confidence', () => {
    const items = [bg('g4', 'אמר רב יהודה')]; // segs 0 and 4
    matchBackgroundTerms(items, SEGS);
    expect(items[0].segs).toEqual([0, 4]);
    expect(items[0].confidence).toBe(0.6);
  });

  it('leaves too-short and absent terms unplaced', () => {
    const items = [bg('s', 'בו'), bg('absent', 'מילה שאיננה')];
    expect(matchBackgroundTerms(items, SEGS)).toBe(0);
    expect(items.every((i) => i.segs.length === 0)).toBe(true);
  });

  it('only touches Background glossary/girsa items, and not already-placed ones', () => {
    const other: ContextItem = {
      source: 'dafyomi:insights',
      sourceLabel: 'Insights',
      kind: 'insights',
      key: 'x',
      title: { he: 'ארכובה' },
      body: {},
      segs: [],
    };
    const already = bg('placed', 'ארכובה');
    already.segs = [1];
    already.via = 'ai';
    matchBackgroundTerms([other, already], SEGS);
    expect(other.segs).toEqual([]); // wrong source -> untouched
    expect(already.segs).toEqual([1]); // already placed -> untouched
    expect(already.via).toBe('ai');
  });

  it('handles girsa items too', () => {
    const items = [bg('gir', 'ארכובה', 'girsa')];
    matchBackgroundTerms(items, SEGS);
    expect(items[0].segs).toEqual([2]);
  });

  it('no-ops when there are no segments', () => {
    const items = [bg('g', 'ארכובה')];
    expect(matchBackgroundTerms(items, undefined)).toBe(0);
    expect(matchBackgroundTerms(items, [])).toBe(0);
  });
});
