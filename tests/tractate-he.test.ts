import { describe, it, expect } from 'vitest';
import { tractateLabelHe, pageLabelHe, dafRefHe, toHebrewNumeral } from '../src/lib/sefref/tractates';

describe('toHebrewNumeral — gematria across the daf range', () => {
  it('ones, tens, and the טו/טז exceptions', () => {
    expect(toHebrewNumeral(2)).toBe('ב');
    expect(toHebrewNumeral(10)).toBe('י');
    expect(toHebrewNumeral(15)).toBe('טו');
    expect(toHebrewNumeral(16)).toBe('טז');
    expect(toHebrewNumeral(17)).toBe('יז');
  });
  it('hundreds (deep tractates like Bava Batra ~176)', () => {
    expect(toHebrewNumeral(100)).toBe('ק');
    expect(toHebrewNumeral(127)).toBe('קכז');
    expect(toHebrewNumeral(176)).toBe('קעו');
    expect(toHebrewNumeral(115)).toBe('קטו');
  });
  it('falls back to decimal for non-positive / non-integer', () => {
    expect(toHebrewNumeral(0)).toBe('0');
    expect(toHebrewNumeral(-3)).toBe('-3');
  });
});

describe('tractateLabelHe — English slug -> Hebrew name', () => {
  it('maps known tractates to their Hebrew label', () => {
    expect(tractateLabelHe('Berakhot')).toBe('ברכות');
    expect(tractateLabelHe('Bava Metzia')).toBe('בבא מציעא');
    expect(tractateLabelHe('Niddah')).toBe('נידה');
  });
  it('falls back to the input for an unknown slug (never blank)', () => {
    expect(tractateLabelHe('Nonexistent')).toBe('Nonexistent');
  });
});

describe('pageLabelHe — Na/Nb -> Hebrew daf form', () => {
  it('uses amud-alef "." and amud-bet ":"', () => {
    expect(pageLabelHe('2a')).toBe('ב.');
    expect(pageLabelHe('2b')).toBe('ב:');
  });
  it('converts multi-digit pages via the Hebrew numeral table', () => {
    expect(pageLabelHe('15a')).toBe('טו.');
    expect(pageLabelHe('21b')).toBe('כא:');
  });
  it('tolerates surrounding whitespace', () => {
    expect(pageLabelHe(' 2b ')).toBe('ב:');
  });
  it('returns unparseable input unchanged', () => {
    expect(pageLabelHe('')).toBe('');
    expect(pageLabelHe('cover')).toBe('cover');
    expect(pageLabelHe('2')).toBe('2');
  });
});

describe('dafRefHe — full Hebrew reference (the BERAKHOT-2B leak guard)', () => {
  it('renders tractate + daf entirely in Hebrew', () => {
    expect(dafRefHe('Berakhot', '2b')).toBe('ברכות ב:');
    expect(dafRefHe('Shabbat', '127a')).toBe('שבת קכז.');
    expect(dafRefHe('Bava Batra', '176b')).toBe('בבא בתרא קעו:');
  });
  it('never emits Latin letters for a known tractate', () => {
    expect(/[A-Za-z]/.test(dafRefHe('Berakhot', '2b'))).toBe(false);
  });
});
