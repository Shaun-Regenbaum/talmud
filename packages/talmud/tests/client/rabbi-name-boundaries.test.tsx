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

function render(segments: string[], punctuated: boolean, entries: GenerationRabbi[] = rabbis) {
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
    injectRabbiUnderlines(html, entries, segments),
    'text/html',
  );
  return Array.from(doc.querySelectorAll('.rabbi-underline')).map((el) => ({
    name: el.getAttribute('data-rabbi'),
    slug: el.getAttribute('data-rabbi-slug'),
    seg: el.querySelector('.daf-word')?.getAttribute('data-seg'),
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

describe('saved identity at a specific name occurrence', () => {
  const segments = [fixture.cachedSource.segments_he[12], fixture.cachedSource.segments_he[13]];
  const rav = rabbis.find((r) => r.name === 'Rav')!;
  const tokenStart = normalizeHebrew(segments[1]).split(' ').indexOf('רב');

  it('keeps the saved person ID on just the requested occurrence', () => {
    expect(tokenStart).toBeGreaterThanOrEqual(0);
    const marks = render(segments, false, [{ ...rav, segIdx: 1, tokenStart }]);
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ name: 'Rav', slug: 'rav', seg: '1', text: 'רב' });
  });

  it('does not replace a bad position with a different occurrence of the same name', () => {
    expect(render(segments, false, [{ ...rav, segIdx: 1, tokenStart: tokenStart + 1 }])).toEqual(
      [],
    );
  });

  it('keeps segment-scoped identities out of commentary without matching segment addresses', () => {
    const html = tokenizeHebrewHtml(segments[1]);
    const marked = injectRabbiUnderlines(html, [{ ...rav, segIdx: 1 }], segments);
    expect(marked).not.toContain('rabbi-underline');
  });

  it('rejects conflicting identity stamps rather than trusting their list order', () => {
    const placed = { ...rav, segIdx: 1, tokenStart };
    // Fault injection changes metadata on a real captured occurrence, not its text.
    const conflict = { ...placed, slug: rabbis.find((r) => r.name === 'Rava')!.slug };
    for (const entries of [
      [placed, conflict, rav],
      [conflict, placed, rav],
    ]) {
      const marks = render(segments, false, entries);
      expect(marks.filter((m) => m.seg === '1')).toEqual([]);
    }
  });

  it('uses an exact position before a segment-wide identity stamp', () => {
    const exact = { ...rav, segIdx: 1, tokenStart };
    const broad = { ...rav, segIdx: 1, slug: rabbis.find((r) => r.name === 'Rava')!.slug };
    for (const entries of [
      [broad, exact],
      [exact, broad],
    ]) {
      expect(render(segments, false, entries)).toEqual([
        { name: 'Rav', slug: 'rav', seg: '1', text: 'רב' },
      ]);
    }
  });
});
