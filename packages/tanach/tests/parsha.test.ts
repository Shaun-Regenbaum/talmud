import { describe, expect, it } from 'vitest';
import {
  formatParshaRange,
  normalizeParshaComposition,
  parseParshaRef,
  pointInParsha,
  sectionInParsha,
} from '../src/lib/parsha';

describe('weekly parsha references', () => {
  it('parses same-chapter and cross-chapter Sefaria ranges', () => {
    expect(parseParshaRef('Leviticus 6:1-8:36')).toEqual({
      book: 'Leviticus',
      startChapter: 6,
      startVerse: 1,
      endChapter: 8,
      endVerse: 36,
    });
    expect(parseParshaRef('Deuteronomy 29:9-30:20')).toEqual({
      book: 'Deuteronomy',
      startChapter: 29,
      startVerse: 9,
      endChapter: 30,
      endVerse: 20,
    });
    expect(parseParshaRef('Numbers 8:1-26')).toEqual({
      book: 'Numbers',
      startChapter: 8,
      startVerse: 1,
      endChapter: 8,
      endVerse: 26,
    });
  });

  it('formats and bounds anchored flow sections', () => {
    const parsha = parseParshaRef('Deuteronomy 7:12-11:25');
    expect(parsha).not.toBeNull();
    if (!parsha) return;
    expect(formatParshaRange(parsha.book, parsha)).toBe('Deuteronomy 7:12–11:25');
    expect(pointInParsha(parsha, { chapter: 10, verse: 12 })).toBe(true);
    expect(pointInParsha(parsha, { chapter: 7, verse: 11 })).toBe(false);
    expect(
      sectionInParsha(parsha, {
        startChapter: 10,
        startVerse: 12,
        endChapter: 10,
        endVerse: 22,
      }),
    ).toBe(true);
  });

  it('normalizes editorial composition estimates to 100 percent', () => {
    expect(normalizeParshaComposition({ narrative: 1, law: 1, discourse: 2 })).toEqual({
      narrative: 25,
      law: 25,
      discourse: 50,
    });
    expect(normalizeParshaComposition({})).toEqual({ narrative: 0, law: 0, discourse: 100 });
  });
});
