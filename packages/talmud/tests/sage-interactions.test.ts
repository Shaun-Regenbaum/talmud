import { describe, expect, it } from 'vitest';
import {
  barSegments,
  kindLines,
  nameKey,
  onThisPage,
  type Partner,
  partnerLabel,
  sefariaUrl,
} from '../src/client/sageInteractions';

const abaye: Partner = {
  nameHe: 'אביי',
  name: 'Abaye',
  slug: 'abaye',
  total: 241,
  kinds: { disputes: 187, addresses: 54 },
  out: { addresses: 13 },
  in: { addresses: 27 },
  refs: { disputes: ['Berakhot 2b:3'], addresses: ['Shabbat 12a:1', 'Eruvin 3b:2'] },
};

describe('kindLines', () => {
  it("lists each kind in a fixed order and words the directions for the card's sage", () => {
    const lines = kindLines(abaye, 'Rava', 'en');
    expect(lines.map((l) => [l.label, l.n])).toEqual([
      ['argue', 187],
      ['speak to each other', 54],
    ]);
    expect(lines[0].directions).toBe('');
    expect(lines[1].directions).toBe('Rava speaks to him 13 · he speaks to Rava 27');
    expect(lines[1].refs).toEqual(['Shabbat 12a:1', 'Eruvin 3b:2']);
  });

  it('words the same pair in Hebrew', () => {
    expect(kindLines(abaye, 'רבא', 'he')[1].directions).toBe('רבא אומר לו 13 · הוא אומר לרבא 27');
  });

  it('skips kinds the pair does not have, and never invents a direction', () => {
    const p: Partner = { ...abaye, kinds: { kin: 2 }, out: {}, in: {}, refs: {} };
    expect(kindLines(p, 'Rava', 'en')).toEqual([
      {
        kind: 'kin',
        color: 'var(--ink-plum)',
        label: 'family, in the text',
        n: 2,
        directions: '',
        refs: [],
      },
    ]);
  });
});

describe('barSegments', () => {
  it('gives each kind its share of the bar', () => {
    const segs = barSegments(abaye);
    expect(segs).toHaveLength(2);
    expect(segs[0].share + segs[1].share).toBeCloseTo(1);
    expect(segs[0].share).toBeCloseTo(187 / 241);
  });

  it('draws nothing for a partner with no counted kinds', () => {
    expect(barSegments({ ...abaye, kinds: {} })).toEqual([]);
  });
});

describe('partnerLabel', () => {
  it('shows the Hebrew name only, in either interface language', () => {
    expect(partnerLabel(abaye)).toBe('אביי');
    expect(partnerLabel({ ...abaye, name: undefined })).toBe('אביי');
  });
});

describe('onThisPage', () => {
  it('matches by slug, or by the Hebrew name ignoring vowel marks', () => {
    expect(onThisPage(abaye, [{ slug: 'abaye', nameHe: '' }])).toBe(true);
    expect(onThisPage({ ...abaye, slug: undefined }, [{ slug: null, nameHe: 'אַבַּיֵי' }])).toBe(true);
    expect(onThisPage(abaye, [{ slug: 'rava', nameHe: 'רבא' }])).toBe(false);
  });
});

describe('sefariaUrl', () => {
  it('turns a Bavli, Yerushalmi or midrash reference into a Sefaria link', () => {
    expect(sefariaUrl('Berakhot 56a:2')).toBe('https://www.sefaria.org/Berakhot.56a.2');
    expect(sefariaUrl('Jerusalem Talmud Berakhot 1:1:2')).toBe(
      'https://www.sefaria.org/Jerusalem_Talmud_Berakhot.1.1.2',
    );
    expect(sefariaUrl('Bereshit Rabbah 12:3')).toBe('https://www.sefaria.org/Bereshit_Rabbah.12.3');
  });
  it('gives no link for a reference built on an internal section slug', () => {
    expect(sefariaUrl('Sifra sifra-shemini-chapter-10:5')).toBeNull();
  });
});

describe('nameKey', () => {
  it("matches a name with vowel marks, or with ר' for רבי, to the plain spelling", () => {
    expect(nameKey('רַבִּי עֲקִיבָא')).toBe('רבי עקיבא');
    expect(nameKey("ר' עקיבא")).toBe('רבי עקיבא');
    expect(nameKey('רבי  עקיבא ')).toBe('רבי עקיבא');
  });
});
