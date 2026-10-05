// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { injectSegmentMarkers } from '../src/client/injectSegmentMarkers';
import { partitionSections } from '../src/lib/argumentMoves';
import { reanchorArgument } from '../src/lib/place/reanchor';
import fixture from './fixtures/shabbat_137b_sections.json';

// Shabbat 137b. Three blessings in a row (segs 6, 7, 8) end with the same
// words, and the new Mishnah (seg 10) follows a Hadran line (seg 9).
const ranges = (parsed: unknown) =>
  (parsed as { instances: Array<{ startSegIdx: number; endSegIdx: number }> }).instances.map(
    (i) => [i.startSegIdx, i.endSegIdx],
  );

describe('Shabbat 137b section ranges', () => {
  const out = reanchorArgument(
    structuredClone({ instances: fixture.instances }),
    fixture.segments_he,
  );

  it('ends the baraita at its LAST closing blessing (seg 8) plus the Hadran line (seg 9)', () => {
    expect(ranges(out)[2]).toEqual([5, 9]);
  });

  it('starts the new Mishnah where its opening words are (seg 10)', () => {
    const mishnah = ranges(out)[3];
    expect(mishnah[0]).toBe(10);
  });

  it('tiles the daf with no gap and no overlap', () => {
    const r = ranges(out);
    for (let i = 1; i < r.length; i++) expect(r[i][0]).toBe(r[i - 1][1] + 1);
  });
});

describe('partitionSections never moves a start back', () => {
  it('stretches the previous section over a gap instead', () => {
    const s = (a: number, b: number) => ({ startSegIdx: a, endSegIdx: b });
    const out = partitionSections([s(0, 2), s(6, 9)], 9);
    expect(out.map((x) => [x.startSegIdx, x.endSegIdx])).toEqual([
      [0, 5],
      [6, 9],
    ]);
  });
});

describe('segment alignment with an editorial label', () => {
  const word = (t: string) => `<span class="daf-word">${t}</span>`;
  it('tags a segment that opens "מתני׳" when the printed page has no such word', () => {
    const html = ['הדרן', 'עלך', 'רבי', 'אליעזר', 'אומר', 'תולין', 'את', 'המשמרת']
      .map(word)
      .join(' ');
    const segs = ['<big>הדרן עלך</big>', 'מַתְנִי׳ רַבִּי אֱלִיעֶזֶר אוֹמֵר: תּוֹלִין אֶת הַמְשַׁמֶּרֶת'];
    const { html: tagged } = injectSegmentMarkers(html, segs);
    const doc = new DOMParser().parseFromString(`<body>${tagged}</body>`, 'text/html');
    const seg1 = [...doc.querySelectorAll('.daf-word[data-seg="1"]')].map((w) => w.textContent);
    expect(seg1).toEqual(['רבי', 'אליעזר', 'אומר', 'תולין', 'את', 'המשמרת']);
  });
});

describe('segment alignment reports what it could not place', () => {
  it('lists a segment that has no match on the printed page', () => {
    const word = (t: string) => `<span class="daf-word">${t}</span>`;
    const html = ['אחד', 'שנים', 'שלשה'].map(word).join(' ');
    const { stats } = injectSegmentMarkers(html, ['אחד שנים שלשה', 'ארבעה חמשה ששה']);
    expect(stats.unalignedSegments).toEqual([1]);
  });
});
