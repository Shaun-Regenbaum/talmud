// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { injectCheckedNames } from '../src/client/injectCheckedNames';
import { injectSegmentMarkers } from '../src/client/injectSegmentMarkers';
import { tokenizeHebrewHtml } from '../src/client/tokenize';
import fixture from './fixtures/reviewed-name-footnotes.json';

describe('reviewed names on printed pages with footnotes', () => {
  it('keeps the closing word of the bracketed name on Berakhot 13b', () => {
    const row = fixture.bracketedPage;
    const marked = injectSegmentMarkers(tokenizeHebrewHtml(row.hebrew), row.segmentsHe);
    const doc = new DOMParser().parseFromString(marked.html, 'text/html');
    const words = [...doc.querySelectorAll<HTMLElement>('.daf-word')];
    const start = words.findIndex((word) => word.textContent === '[חייא');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(words.slice(start, start + 3).map((word) => word.textContent)).toEqual([
      '[חייא',
      'בר',
      'אבא]',
    ]);
    expect(words[start].dataset.seg).toBeDefined();
    expect(words[start + 2].dataset.seg).toBe(words[start].dataset.seg);
  });
  for (const row of fixture.rows) {
    it(`places the reviewed name on ${row.tractate} ${row.page}`, () => {
      const marked = injectSegmentMarkers(tokenizeHebrewHtml(row.hebrew), row.segmentsHe);
      const html = injectCheckedNames(marked.html, row.occurrences);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const original = new DOMParser().parseFromString(tokenizeHebrewHtml(row.hebrew), 'text/html');
      expect(doc.body.textContent).toBe(original.body.textContent);
      const names = [...doc.querySelectorAll<HTMLElement>('[data-checked-person]')];
      expect(names).toHaveLength(row.occurrences.length);
      expect(
        names.map((name) =>
          [...name.querySelectorAll('.daf-word')].map((word) => word.textContent).join(' '),
        ),
      ).toEqual(row.expectedLinks);
      for (const name of names) expect(name.dataset.checkedPerson).toBe(row.personKey);
      for (const word of doc.querySelectorAll<HTMLElement>('.daf-word')) {
        if (/^[א-ת]{1,3}\]$/.test(word.textContent?.trim() ?? '')) {
          expect(word.dataset.seg).toBeUndefined();
          expect(word.closest('[data-checked-person]')).toBeNull();
        }
      }
    });
  }
  it('withholds the abbreviated name when the saved full name is changed', () => {
    const row = fixture.rows.find((r) => r.tractate === 'Nedarim')!;
    const marked = injectSegmentMarkers(tokenizeHebrewHtml(row.hebrew), row.segmentsHe);
    const corrupted = row.occurrences.map((occurrence) => ({
      ...occurrence,
      source: occurrence.source.replaceAll('שמעון', 'שמואל'),
      quote: occurrence.quote.replaceAll('שמעון', 'שמואל'),
    }));
    const doc = new DOMParser().parseFromString(
      injectCheckedNames(marked.html, corrupted),
      'text/html',
    );
    expect(doc.querySelector('[data-checked-person]')).toBeNull();
  });
});
