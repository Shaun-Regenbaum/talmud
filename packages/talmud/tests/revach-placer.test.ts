import type { ContextItem } from '@corpus/core/context/types';
import { describe, expect, it } from 'vitest';
import { matchRevach, type SectionForMatch } from '../src/lib/context/anchor/revach';

const sections: SectionForMatch[] = [
  {
    startSegIdx: 0,
    endSegIdx: 4,
    title: 'Opening Mishnah: Time for Evening Shema',
    summary:
      'The Mishnah presents opinions on the time for reciting the evening Shema, until midnight and until dawn.',
  },
  {
    startSegIdx: 5,
    endSegIdx: 7,
    title: 'Why begin with evening?',
    summary:
      'The Gemara asks why the Tanna begins with the morning prayer order, citing the verse about lying down.',
  },
];

const revach = (key: string, title: string, body: string): ContextItem => ({
  source: 'dafyomi:revach',
  sourceLabel: "Revach l'Daf",
  kind: 'revach',
  key,
  title: { en: title },
  body: { en: body },
  segs: [],
});

describe('matchRevach — conservative section placement', () => {
  it('places a clearly-matching entry on its section segment range', () => {
    const items = [
      revach(
        'r:0',
        'The Mishnah discusses the latest time for the nighttime Shema',
        'Rebbi Eliezer until a third of the night; Chachamim until midnight; Raban Gamliel until dawn.',
      ),
    ];
    const m = matchRevach(items, sections);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ key: 'r:0', segs: [0, 1, 2, 3, 4], via: 'revach-section' });
    expect(m[0].confidence).toBeGreaterThan(0);
  });

  it('leaves an entry unplaced when nothing overlaps', () => {
    const items = [
      revach('r:x', 'A note about ritual purity vessels', 'Earthenware and immersion in a mikveh.'),
    ];
    expect(matchRevach(items, sections)).toEqual([]);
  });

  it('ignores non-revach items and empty section lists', () => {
    const notRevach: ContextItem = { ...revach('bg:0', 'x', 'y'), source: 'dafyomi:background' };
    expect(matchRevach([notRevach], sections)).toEqual([]);
    expect(matchRevach([revach('r:0', 'Mishnah evening Shema time', 'midnight dawn')], [])).toEqual(
      [],
    );
  });

  it('places two in-order entries on their sections, preserving order', () => {
    const items = [
      revach(
        'r:0',
        'The latest time for the nighttime Shema, reciting in the evening',
        'until midnight and dawn',
      ),
      revach(
        'r:1',
        'Why begin with the evening prayer before morning',
        'from the verse about lying down',
      ),
    ];
    const m = matchRevach(items, sections);
    expect(m.map((x) => x.key)).toEqual(['r:0', 'r:1']);
    expect(m[0].segs).toEqual([0, 1, 2, 3, 4]);
    expect(m[1].segs).toEqual([5, 6, 7]);
  });

  it('always returns placements in non-decreasing segment order', () => {
    // Out-of-order entries: a (→ section 1) before b (→ section 0). The
    // max-weight non-decreasing alignment keeps an in-order subset, never a
    // backwards pair.
    const items = [
      revach(
        'r:a',
        'Why begin with the evening prayer before morning, the verse on lying down',
        'order',
      ),
      revach(
        'r:b',
        'The latest time for the nighttime Shema, reciting evening until midnight and dawn',
        'opinions',
      ),
    ];
    const m = matchRevach(items, sections);
    const starts = m.map((x) => x.segs[0]);
    expect([...starts]).toEqual([...starts].sort((p, q) => p - q)); // non-decreasing
    expect(m.length).toBeLessThanOrEqual(1); // the two conflict → at most one kept
  });
});
