import { describe, expect, it } from 'vitest';
import {
  buildParshaMap,
  formatParshaRange,
  layoutParshaColumn,
  measureComposition,
  parseParshaRef,
  pointInParsha,
  sanitizeParshaTerms,
  sectionInParsha,
  tokenizeTermMentions,
  verseOffset,
} from '../src/lib/parsha';

/** Deuteronomy's verse counts per chapter (Sefaria's book shape). */
const DEUTERONOMY = [
  46, 37, 29, 49, 30, 25, 26, 20, 29, 22, 32, 31, 19, 29, 23, 22, 20, 22, 21, 20, 23, 29, 26, 22,
  19, 19, 26, 69, 28, 20, 30, 52, 29, 12,
];
/** Shoftim: 16:18-21:9 — 5 verses of ch. 16, then 20 + 22 + 21 + 20, then 9. */
const SHOFTIM = {
  book: 'Deuteronomy',
  startChapter: 16,
  startVerse: 18,
  endChapter: 21,
  endVerse: 9,
};

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
});

describe('the parsha map', () => {
  it('counts verses from the portion’s first verse, across chapters', () => {
    expect(verseOffset(SHOFTIM, DEUTERONOMY, { chapter: 16, verse: 18 })).toBe(0);
    expect(verseOffset(SHOFTIM, DEUTERONOMY, { chapter: 16, verse: 22 })).toBe(4);
    // ch. 16 contributes 5 verses (18-22), so 17:1 is the sixth.
    expect(verseOffset(SHOFTIM, DEUTERONOMY, { chapter: 17, verse: 1 })).toBe(5);
    expect(verseOffset(SHOFTIM, DEUTERONOMY, { chapter: 18, verse: 1 })).toBe(25);
    expect(verseOffset(SHOFTIM, DEUTERONOMY, { chapter: 21, verse: 9 })).toBe(96);
    // Outside the portion, and inside a chapter whose length we don't have.
    expect(verseOffset(SHOFTIM, DEUTERONOMY, { chapter: 16, verse: 17 })).toBeNull();
    expect(verseOffset(SHOFTIM, DEUTERONOMY, { chapter: 21, verse: 10 })).toBeNull();
    expect(verseOffset(SHOFTIM, [], { chapter: 18, verse: 1 })).toBeNull();
    // A verse that doesn't exist in a chapter the portion passes through:
    // inside the portion's ends, but off the end of chapter 18 (22 verses).
    expect(verseOffset(SHOFTIM, DEUTERONOMY, { chapter: 18, verse: 23 })).toBeNull();
  });

  it('lays the units, landmarks, aliyot and chapter starts on one axis', () => {
    const map = buildParshaMap({
      range: SHOFTIM,
      chapterLengths: DEUTERONOMY,
      flow: [
        { startChapter: 16, startVerse: 18, endChapter: 17, endVerse: 7 },
        { startChapter: 20, startVerse: 1, endChapter: 20, endVerse: 20 },
        // Outside the portion — dropped from the map, still listed in the drawer.
        { startChapter: 21, startVerse: 10, endChapter: 21, endVerse: 23 },
      ],
      landmarks: [
        { chapter: 16, verse: 20 },
        { chapter: 22, verse: 1 },
      ],
      aliyot: [
        'Deuteronomy 16:18-17:13',
        'Deuteronomy 17:14-17:20',
        // A bad entry costs its own band and NOTHING ELSE: the refs after it
        // keep their ordinals, and maftir (the eighth) stays out of the seven.
        'not a ref',
        'Deuteronomy 18:6-18:13',
        'Deuteronomy 18:14-19:13',
        'Deuteronomy 19:14-20:9',
        'Deuteronomy 20:10-21:9',
        'Deuteronomy 21:7-21:9',
      ],
    });
    expect(map).not.toBeNull();
    if (!map) return;
    expect(map.totalVerses).toBe(97);
    expect(map.units).toEqual([
      { index: 0, offset: 0, verses: 12 },
      { index: 1, offset: 68, verses: 20 },
    ]);
    expect(map.landmarks).toEqual([{ index: 0, offset: 2, verses: 1 }]);
    // Seven at most, positionally numbered — the maftir eighth never appears,
    // and the entries after the bad one keep their own ordinals.
    expect(map.aliyot.map((a) => a.n)).toEqual([1, 2, 4, 5, 6, 7]);
    expect(map.aliyot[0]).toMatchObject({ offset: 0, verses: 18 });
    expect(map.aliyot.at(-1)).toMatchObject({ n: 7, ref: 'Deuteronomy 20:10-21:9' });
    expect(map.chapters).toEqual([
      { chapter: 16, offset: 0 },
      { chapter: 17, offset: 5 },
      { chapter: 18, offset: 25 },
      { chapter: 19, offset: 47 },
      { chapter: 20, offset: 68 },
      { chapter: 21, offset: 88 },
    ]);
  });

  it('draws no map at all when the book’s chapter lengths are missing', () => {
    expect(
      buildParshaMap({
        range: SHOFTIM,
        chapterLengths: [],
        flow: [{ startChapter: 16, startVerse: 18, endChapter: 17, endVerse: 7 }],
        landmarks: [],
        aliyot: [],
      }),
    ).toBeNull();
  });
});

describe('the drawn column', () => {
  const spans = [
    { index: 0, offset: 0, verses: 50 },
    { index: 1, offset: 50, verses: 2 },
    { index: 2, offset: 52, verses: 2 },
    { index: 3, offset: 54, verses: 46 },
  ];

  it('keeps the ribbon proportional and only nudges the titles', () => {
    const { rows } = layoutParshaColumn(spans, { totalVerses: 100, height: 400, minGap: 24 });
    // Segments are exactly proportional — the ribbon is the map.
    expect(rows.map((r) => [r.segTop, r.segHeight])).toEqual([
      [0, 200],
      [200, 8],
      [208, 8],
      [216, 184],
    ]);
    // Two 2-verse moves are 8px of ribbon; their titles get 24px of room each.
    expect(rows.map((r) => r.labelTop)).toEqual([0, 200, 224, 248]);
  });

  it('grows the column when the nudged titles run past the bottom', () => {
    const crowded = Array.from({ length: 9 }, (_, i) => ({ index: i, offset: i, verses: 1 }));
    const { rows, height } = layoutParshaColumn(crowded, {
      totalVerses: 100,
      height: 100,
      minGap: 24,
    });
    expect(rows.at(-1)?.labelTop).toBe(192);
    expect(height).toBe(216);
  });

  it('reads the portion in verse order however the spans arrive', () => {
    const { rows } = layoutParshaColumn([...spans].reverse(), {
      totalVerses: 100,
      height: 400,
      minGap: 24,
    });
    expect(rows.map((r) => r.index)).toEqual([0, 1, 2, 3]);
  });

  it('draws nothing for an unmeasurable portion', () => {
    expect(layoutParshaColumn(spans, { totalVerses: 0, height: 400, minGap: 24 }).rows).toEqual([]);
  });
});

describe('measured composition', () => {
  it('counts the split off the anchored units, totalling 100', () => {
    expect(
      measureComposition(97, [
        { kind: 'law', offset: 0, verses: 83 },
        { kind: 'discourse', offset: 83, verses: 14 },
      ]),
    ).toEqual({ law: 86, discourse: 14 });
  });

  it('never rounds a kind that is present away to nothing', () => {
    const split = measureComposition(1000, [
      { kind: 'narrative', offset: 0, verses: 999 },
      { kind: 'poetry', offset: 999, verses: 1 },
    ]);
    expect(split.poetry).toBe(1);
    expect(split.narrative).toBe(99);
  });

  it('measures shares of the PORTION, so a gap is left uncounted', () => {
    // Ten law verses in a hundred-verse portion is 10%, not 100%.
    expect(measureComposition(100, [{ kind: 'law', offset: 0, verses: 10 }])).toEqual({ law: 10 });
  });

  it('paints an overlap once, the later unit winning as it does on the strip', () => {
    expect(
      measureComposition(100, [
        { kind: 'law', offset: 0, verses: 80 },
        { kind: 'narrative', offset: 40, verses: 60 },
      ]),
    ).toEqual({ narrative: 60, law: 40 });
  });

  it('ignores unknown kinds, empty units, and an empty portion', () => {
    expect(
      measureComposition(100, [
        { kind: 'law', offset: 0, verses: 10 },
        { kind: 'prophecy' as never, offset: 10, verses: 90 },
        { kind: 'records', offset: 10, verses: 0 },
      ]),
    ).toEqual({ law: 10 });
    expect(measureComposition(100, [])).toEqual({});
    expect(measureComposition(0, [{ kind: 'law', offset: 0, verses: 5 }])).toEqual({});
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
