/**
 * externalRefs — parsing Sefaria ref strings into AnchorCoords on external
 * spines (Tanach + the codifier codes). Locks the encoding the pesukim + halacha
 * producers emit, and the precision-first drop of anything that doesn't parse.
 */

import { DAF_SEG } from '@corpus/core/context/coord';
import { describe, expect, it } from 'vitest';
import { parseCodifierRef, parseVerseRef } from '../src/lib/context/externalRefs';

describe('parseVerseRef', () => {
  it('parses a verse into a tanach-spine coord', () => {
    expect(parseVerseRef('Genesis 19:5')).toEqual({
      spine: 'tanach',
      tractate: 'Genesis',
      page: '19',
      seg: 5,
    });
  });

  it('handles multi-word book names', () => {
    expect(parseVerseRef('I Samuel 1:3')).toMatchObject({
      tractate: 'I Samuel',
      page: '1',
      seg: 3,
    });
    expect(parseVerseRef('Song of Songs 2:8')).toMatchObject({
      tractate: 'Song of Songs',
      page: '2',
      seg: 8,
    });
  });

  it('keeps the start verse of a range', () => {
    expect(parseVerseRef('Genesis 19:5-7')).toMatchObject({ page: '19', seg: 5 });
  });

  it('anchors a chapter-only ref at DAF_SEG', () => {
    expect(parseVerseRef('Psalms 23')).toEqual({
      spine: 'tanach',
      tractate: 'Psalms',
      page: '23',
      seg: DAF_SEG,
    });
  });

  it('returns null for a ref with no numeric location', () => {
    expect(parseVerseRef('not a verse')).toBeNull();
    expect(parseVerseRef('')).toBeNull();
  });
});

describe('parseCodifierRef', () => {
  it('parses a Mishneh Torah ref, stripping the work prefix to the section', () => {
    expect(parseCodifierRef('Mishneh Torah, Reading the Shema 1:1')).toEqual({
      spine: 'mishneh-torah',
      tractate: 'Reading the Shema',
      page: '1',
      seg: 1,
    });
  });

  it('parses a Shulchan Arukh ref (Sefaria spelling)', () => {
    expect(parseCodifierRef('Shulchan Arukh, Orach Chayim 235:1')).toEqual({
      spine: 'shulchan-aruch',
      tractate: 'Orach Chayim',
      page: '235',
      seg: 1,
    });
  });

  it('handles a section-less work (Mishnah Berurah, siman only)', () => {
    expect(parseCodifierRef('Mishnah Berurah 235:1')).toEqual({
      spine: 'mishnah-berurah',
      tractate: '',
      page: '235',
      seg: 1,
    });
  });

  it('anchors a chapter-only codifier ref at DAF_SEG', () => {
    expect(parseCodifierRef('Tur, Orach Chayim 235')).toMatchObject({
      spine: 'tur',
      tractate: 'Orach Chayim',
      seg: DAF_SEG,
    });
  });

  it('drops a non-codifier halakhah ref (the noisy tail)', () => {
    expect(parseCodifierRef('Sefer Mitzvot Gadol, Positive Commandments 18')).toBeNull();
    expect(parseCodifierRef('Mishneh Torah, Reading the Shema')).toBeNull(); // no numeric location
  });
});
