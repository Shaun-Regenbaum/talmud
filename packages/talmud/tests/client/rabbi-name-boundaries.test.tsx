import { describe, expect, it } from 'vitest';
import { GENERATION_BY_ID, type GenerationId } from '../../src/client/generations';
import {
  type GenerationRabbi,
  injectRabbiUnderlines,
  normalizeHebrew,
} from '../../src/client/injectRabbiUnderlines';
import { injectSegmentMarkers } from '../../src/client/injectSegmentMarkers';
import { tokenizeHebrewHtml } from '../../src/client/tokenize';
import fixture from '../fixtures/shabbat-55b-rabbi-boundaries.json';

// A JSON import types every string as `string`, so the fixture's generation ids
// have to be checked against the real taxonomy before they count as GenerationId.
const isGenerationId = (g: string): g is GenerationId => g in GENERATION_BY_ID;

const rabbis: GenerationRabbi[] = fixture.cachedResult.parsed.instances.map((i) => {
  const { generation } = i.fields;
  if (!isGenerationId(generation)) throw new Error(`fixture has unknown generation: ${generation}`);
  return { ...i.fields, generation };
});

function render(segments: string[], punctuated: boolean) {
  const html = segments
    .map((s, seg) => {
      const text = punctuated ? s : normalizeHebrew(s);
      return tokenizeHebrewHtml(text).replaceAll(
        'class="daf-word"',
        `class="daf-word" data-seg="${seg}"`,
      );
    })
    .join(' ');
  const doc = new DOMParser().parseFromString(
    injectRabbiUnderlines(html, rabbis, segments),
    'text/html',
  );
  return Array.from(doc.querySelectorAll('.rabbi-underline')).map((el) => ({
    name: el.getAttribute('data-rabbi'),
    text: normalizeHebrew(el.textContent ?? ''),
  }));
}

describe('speaker boundaries in rabbi underlines', () => {
  it('finds both reported statements through the actual printed-text aligner', () => {
    const tokenized = tokenizeHebrewHtml(fixture.cachedSource.hebrew);
    const aligned = injectSegmentMarkers(tokenized, fixture.cachedSource.segments_he);
    const doc = new DOMParser().parseFromString(
      injectRabbiUnderlines(aligned.html, rabbis, fixture.cachedSource.segments_he),
      'text/html',
    );
    expect(doc.querySelectorAll('[data-rabbi="Rav Pinchas"]')).toHaveLength(0);
    for (const seg of [12, 13]) {
      expect(doc.querySelector(`[data-rabbi="Rav"] [data-seg="${seg}"]`)?.textContent).toBe('רב');
    }
  });

  it.each([false, true])(
    'underlines only Rav in both reported statements (punctuated: %s)',
    (punctuated) => {
      const marks = render(
        [fixture.cachedSource.segments_he[12], fixture.cachedSource.segments_he[13]],
        punctuated,
      );
      expect(marks.filter((m) => m.name === 'Rav Pinchas')).toEqual([]);
      expect(marks.filter((m) => m.name === 'Rav').map((m) => m.text)).toEqual(['רב', 'רב']);
    },
  );

  it('keeps a genuine mention when both captured passages appear in the same render', () => {
    const segments = [fixture.cachedSource.segments_he[12], ...fixture.genuinePinchas.segmentsHe];
    const marks = render(segments, false);
    expect(marks.filter((m) => m.name === 'Rav Pinchas')).toHaveLength(1);
    expect(marks.some((m) => m.name === 'Rav' && m.text === 'רב')).toBe(true);
  });

  it('handles both captured passages even within one source segment', () => {
    const text = [fixture.cachedSource.segments_he[12], ...fixture.genuinePinchas.segmentsHe].join(
      ' ',
    );
    const marks = render([text], false);
    expect(marks.filter((m) => m.name === 'Rav Pinchas')).toHaveLength(1);
  });
});
