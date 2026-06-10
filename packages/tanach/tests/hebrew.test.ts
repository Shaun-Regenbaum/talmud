import { describe, expect, it } from 'vitest';
import { hebrewNumeral } from '../src/lib/hebrew';

describe('hebrewNumeral', () => {
  it('renders units, tens, hundreds', () => {
    expect(hebrewNumeral(1)).toBe('א');
    expect(hebrewNumeral(9)).toBe('ט');
    expect(hebrewNumeral(10)).toBe('י');
    expect(hebrewNumeral(21)).toBe('כא');
    expect(hebrewNumeral(99)).toBe('צט');
    expect(hebrewNumeral(100)).toBe('ק');
    expect(hebrewNumeral(119)).toBe('קיט');
  });

  it('uses טו/טז for 15/16 (never spelling part of the divine name)', () => {
    expect(hebrewNumeral(15)).toBe('טו');
    expect(hebrewNumeral(16)).toBe('טז');
    expect(hebrewNumeral(115)).toBe('קטו');
    expect(hebrewNumeral(116)).toBe('קטז');
    // 17 goes back to the regular tens+units form
    expect(hebrewNumeral(17)).toBe('יז');
  });

  it('covers the longest chapter in Tanach (Psalms 119 has 176 verses)', () => {
    expect(hebrewNumeral(176)).toBe('קעו');
  });

  it('repeats ת above 400', () => {
    expect(hebrewNumeral(500)).toBe('תק');
    expect(hebrewNumeral(1000)).toBe('תתר');
  });
});
