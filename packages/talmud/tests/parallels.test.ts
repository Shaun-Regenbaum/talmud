import { DAF_SEG } from '@corpus/core/context/coord';
import { describe, expect, it } from 'vitest';
import { parseTalmudRef, talmudParallelsToLinks } from '../src/lib/context/parallels';

describe('parseTalmudRef', () => {
  it('parses a bare daf ref to a daf-level coord', () => {
    expect(parseTalmudRef('Shabbat 31a')).toEqual({
      tractate: 'Shabbat',
      page: '31a',
      seg: DAF_SEG,
    });
  });
  it('parses a segment ref, converting Sefaria 1-indexed to 0-indexed', () => {
    expect(parseTalmudRef('Shabbat 31a:5')).toEqual({ tractate: 'Shabbat', page: '31a', seg: 4 });
  });
  it('takes the start of a same-daf range', () => {
    expect(parseTalmudRef('Bava Metzia 59a:12-18')).toEqual({
      tractate: 'Bava Metzia',
      page: '59a',
      seg: 11,
    });
  });
  it('takes the start of a cross-daf range', () => {
    expect(parseTalmudRef('Bava Metzia 59a:12-59b:7')).toEqual({
      tractate: 'Bava Metzia',
      page: '59a',
      seg: 11,
    });
  });
  it('keeps multi-word tractate names intact', () => {
    expect(parseTalmudRef('Rosh Hashanah 16b:3')).toEqual({
      tractate: 'Rosh Hashanah',
      page: '16b',
      seg: 2,
    });
  });
  it('rejects non-Bavli refs (Yerushalmi chapter:halacha, Tanakh verses)', () => {
    expect(parseTalmudRef('Jerusalem Talmud Berakhot 2:1')).toBeNull();
    expect(parseTalmudRef('Genesis 1:1')).toBeNull();
    expect(parseTalmudRef('')).toBeNull();
  });
  it('rejects folio-style Yerushalmi (same category:Talmud channel + daf shape)', () => {
    // Sefaria surfaces these under category:'Talmud' and they match the Bavli
    // ref shape — must be excluded so this Bavli-parallels path stays clean.
    expect(parseTalmudRef('Jerusalem Talmud Berakhot 2a')).toBeNull();
    expect(parseTalmudRef('Jerusalem Talmud Bava Metzia 1a:3')).toBeNull();
  });
});

describe('talmudParallelsToLinks', () => {
  const daf = { tractate: 'Berakhot', page: '2a' };

  it('projects a cross-tractate parallel to a parallels link sourced on this daf', () => {
    const links = talmudParallelsToLinks(daf, [
      { anchorRef: 'Berakhot 2a:3', targetRef: 'Shabbat 31a:5' },
    ]);
    expect(links).toEqual([
      {
        via: 'mesorah',
        relation: 'parallels',
        source: { tractate: 'Berakhot', page: '2a', seg: 2 },
        targets: [{ tractate: 'Shabbat', page: '31a', seg: 4 }],
      },
    ]);
  });

  it('anchors at seg 0 when the apparatus anchors the whole daf', () => {
    const [link] = talmudParallelsToLinks(daf, [
      { anchorRef: 'Berakhot 2a', targetRef: 'Megillah 3a' },
    ]);
    expect(link.source.seg).toBe(0);
    expect(link.targets[0].seg).toBe(DAF_SEG);
  });

  it('drops self-links (a parallel onto the same daf)', () => {
    expect(
      talmudParallelsToLinks(daf, [{ anchorRef: 'Berakhot 2a:1', targetRef: 'Berakhot 2a:7' }]),
    ).toEqual([]);
  });

  it('drops targets that do not parse to a Bavli coordinate (incl. Yerushalmi)', () => {
    expect(
      talmudParallelsToLinks(daf, [
        { anchorRef: 'Berakhot 2a:1', targetRef: 'Jerusalem Talmud Berakhot 1:1' },
        { anchorRef: 'Berakhot 2a:1', targetRef: 'Jerusalem Talmud Berakhot 2a' },
      ]),
    ).toEqual([]);
  });

  it('dedupes identical (source-segment, target) pairs', () => {
    const links = talmudParallelsToLinks(daf, [
      { anchorRef: 'Berakhot 2a:3', targetRef: 'Shabbat 31a:5' },
      { anchorRef: 'Berakhot 2a:3', targetRef: 'Shabbat 31a:5' },
    ]);
    expect(links).toHaveLength(1);
  });

  it('keeps the same target as distinct edges when anchored at different source segments', () => {
    const links = talmudParallelsToLinks(daf, [
      { anchorRef: 'Berakhot 2a:3', targetRef: 'Shabbat 31a:5' },
      { anchorRef: 'Berakhot 2a:8', targetRef: 'Shabbat 31a:5' },
    ]);
    expect(links).toHaveLength(2);
  });
});
