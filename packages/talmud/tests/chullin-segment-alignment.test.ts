// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { abbreviationMatches, injectSegmentMarkers } from '../src/client/injectSegmentMarkers';
import { tokenizeHebrewHtml } from '../src/client/tokenize';
import fixture from './fixtures/chullin-57a-segments.json';

describe('Chullin 57a paragraph placement', () => {
  it('expands the printed abbreviation only for its matching words', () => {
    expect(abbreviationMatches('מדא"ר', ['מִדְּאָמַר', 'רַבִּי', 'יוֹחָנָן'], 0)).toBe(2);
    expect(abbreviationMatches('מדא״ר', ['מדאמר', 'רבי'], 0)).toBe(2);
    expect(abbreviationMatches('מדא"ר', ['אמר', 'רבי'], 0)).toBe(0);
    expect(abbreviationMatches('מדא"ר', ['מדאמר', 'רב'], 0)).toBe(0);
  });

  it('keeps the repeated Rav Huna teaching before Abba’s visit', () => {
    const result = injectSegmentMarkers(tokenizeHebrewHtml(fixture.hebrew), fixture.segmentsHe);
    const doc = new DOMParser().parseFromString(result.html, 'text/html');
    const text = (seg: number) =>
      [...doc.querySelectorAll(`[data-seg="${seg}"]`)].map((word) => word.textContent).join(' ');
    expect(result.stats.unalignedSegments).toEqual([]);
    expect(text(5)).toContain('והא מדא"ר יוחנן');
    expect(text(6)).toContain('אמר רב הונא אמר רב שמוטת ירך בעוף כשרה');
    expect(text(6)).toContain('נהרא נהרא ופשטיה');
    expect(text(7)).toContain('אזל רבי אבא אשכחיה לרב ירמיה בר אבא');
    expect(text(9)).toContain('אמר רב הונא אמר רב שמוטת ירך בעוף טרפה');
  });
});
