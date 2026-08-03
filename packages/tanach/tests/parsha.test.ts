import { describe, expect, it } from 'vitest';
import {
  formatParshaRange,
  normalizeParshaComposition,
  parseParshaRef,
  pointInParsha,
  sanitizeParshaTerms,
  sectionInParsha,
  tokenizeTermMentions,
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

describe('hover-hint terms', () => {
  it('keeps only Hebrew-surface + English-meaning pairs, first entry winning a collision', () => {
    expect(
      sanitizeParshaTerms([
        { he: 'ברכה', en: 'blessing' },
        { he: ' קללה ', en: ' curse ' }, // trimmed
        { he: 'ברכה', en: 'a different blessing' }, // duplicate surface — dropped
        { he: 'bracha', en: 'transliteration, not script' }, // no Hebrew — dropped
        { he: 'מעשר', en: 'מעשר' }, // Hebrew "meaning" is no hint — dropped
        { he: '', en: 'empty' },
        'not an object',
      ]),
    ).toEqual([
      { he: 'ברכה', en: 'blessing' },
      { he: 'קללה', en: 'curse' },
    ]);
  });

  it('tokenizes Hebrew surfaces only, longest first, without touching attached prefixes', () => {
    const terms = [
      { he: 'מעשר', en: 'tithe' },
      { he: 'מעשר שני', en: 'the second tithe' },
      { he: 'ברכה', en: 'blessing' },
    ];
    expect(tokenizeTermMentions('sets a ברכה (blessing) before them', terms)).toEqual([
      { kind: 'text', value: 'sets a ' },
      { kind: 'term', value: 'ברכה', term: { he: 'ברכה', en: 'blessing' } },
      { kind: 'text', value: ' (blessing) before them' },
    ]);
    // The longer surface wins where both could match.
    expect(tokenizeTermMentions('the law of מעשר שני applies', terms).map((p) => p.kind)).toEqual([
      'text',
      'term',
      'text',
    ]);
    expect(tokenizeTermMentions('the law of מעשר שני applies', terms)[1].value).toBe('מעשר שני');
    // An attached prefix form (הברכה) is not half-underlined.
    expect(tokenizeTermMentions('וזאת הברכה', terms)).toEqual([
      { kind: 'text', value: 'וזאת הברכה' },
    ]);
    // English meanings are never matched (they are everyday words).
    expect(tokenizeTermMentions('a blessing and a curse', terms)).toEqual([
      { kind: 'text', value: 'a blessing and a curse' },
    ]);
  });
});
