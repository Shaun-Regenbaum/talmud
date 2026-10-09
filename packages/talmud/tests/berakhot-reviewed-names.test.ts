// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { injectCheckedNames } from '../src/client/injectCheckedNames';
import { abbreviationMatches, injectSegmentMarkers } from '../src/client/injectSegmentMarkers';
import { tokenizeHebrewHtml } from '../src/client/tokenize';
import fixture from './fixtures/berakhot-48a-names.json';

describe('Berakhot 48a reviewed names', () => {
  it('recognizes the printed abbreviation for the explicitly written Rav', () => {
    expect(abbreviationMatches('א"ר', ['אמר', 'רב', 'יהודה'], 0)).toBe(2);
    expect(abbreviationMatches('א״ר', ['אמר', 'רבי', 'זירא'], 0)).toBe(2);
    expect(abbreviationMatches('א"ר', ['אמר', 'רבא'], 0)).toBe(0);
  });
  it('keeps Zeira, Rav Yehuda and Yirmeya in their shared paragraph', () => {
    const marked = injectSegmentMarkers(tokenizeHebrewHtml(fixture.hebrew), fixture.segmentsHe);
    const html = injectCheckedNames(marked.html, fixture.occurrences);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const names = [...doc.querySelectorAll<HTMLElement>('[data-checked-person]')];
    expect(names.map((n) => n.dataset.checkedPerson).sort()).toEqual([
      'b427-p6/G',
      'b427-p6/H',
      'b427-p6/L',
    ]);
    for (const n of names) {
      const row = fixture.occurrences.find((o) => o.personKey === n.dataset.checkedPerson)!;
      expect(n.dataset.rabbiSlug).toBe(row.personId);
      expect(
        [...n.querySelectorAll<HTMLElement>('.daf-word')].every((w) => w.dataset.seg === '3'),
      ).toBe(true);
    }
  });
});
