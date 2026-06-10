import { describe, expect, it } from 'vitest';
import { BOOKS, SECTIONS, bookByName, isBook } from '../src/lib/books';
import { COMMENTATORS } from '../src/lib/commentators';

describe('BOOKS registry', () => {
  it('has the 39 books of Tanach, uniquely named', () => {
    expect(BOOKS.length).toBe(39);
    expect(new Set(BOOKS.map((b) => b.name)).size).toBe(39);
  });

  it('groups them 5 Torah / 21 Neviim / 13 Ketuvim', () => {
    const count = (s: string) => BOOKS.filter((b) => b.section === s).length;
    expect(count('Torah')).toBe(5);
    expect(count("Nevi'im")).toBe(21);
    expect(count('Ketuvim')).toBe(13);
  });

  it('every book has a Hebrew name and a known section', () => {
    for (const b of BOOKS) {
      expect(b.he.length).toBeGreaterThan(0);
      expect(SECTIONS).toContain(b.section);
    }
  });

  it('bookByName / isBook resolve Sefaria English names', () => {
    expect(bookByName('Genesis')?.he).toBe('בְּרֵאשִׁית');
    expect(isBook('I Samuel')).toBe(true);
    expect(isBook('1 Samuel')).toBe(false);
    expect(bookByName('Bereshit')).toBeUndefined();
  });
});

describe('COMMENTATORS registry', () => {
  it('has unique keys and titles', () => {
    expect(new Set(COMMENTATORS.map((c) => c.key)).size).toBe(COMMENTATORS.length);
    expect(new Set(COMMENTATORS.map((c) => c.title)).size).toBe(COMMENTATORS.length);
  });

  it('keeps Rashi first (display order)', () => {
    expect(COMMENTATORS[0]?.key).toBe('rashi');
  });
});
