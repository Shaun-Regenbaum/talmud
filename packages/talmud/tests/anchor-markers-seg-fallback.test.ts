// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  injectAggadataAnchors,
  injectAnchorMarkers,
  injectOpinionMarkers,
  injectPesukimAnchors,
} from '../src/client/anchorMarkers';

// Build a daf-word stream. Each entry is [text, segIdx?]; words with a segIdx
// get `data-seg` the way injectSegmentMarkers tags them at render time. No
// inter-span whitespace so sibling assertions stay clean.
function daf(words: Array<[string, number?]>): string {
  return words
    .map(([t, seg]) =>
      seg == null
        ? `<span class="daf-word">${t}</span>`
        : `<span class="daf-word" data-seg="${seg}">${t}</span>`,
    )
    .join('');
}

function parse(html: string): Document {
  return new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
}

// The real Chullin 20a mismatch: HebrewBooks renders the abbreviation סד where
// Sefaria (and therefore the LLM excerpt) spells out סלקא דעתך, so a verbatim
// match for the excerpt fails — but every word is tagged with its segment.
const CHULLIN_20A = daf([
  ['ואי', 0],
  ['סד', 0],
  ['מחזיר', 0],
  ['דוקא', 0],
  ['מאי', 1],
  ['איריא', 1],
  ['מולק', 1],
  ['אר', 2],
  ['ינאי', 2],
  ['יקבלו', 2],
  ['הרובין', 2],
]);

describe('injectAnchorMarkers seg fallback', () => {
  it('uses a verbatim excerpt match when the phrase is present', () => {
    const out = injectAnchorMarkers(
      CHULLIN_20A,
      [{ excerpt: 'מחזיר דוקא', index: 0, startSegIdx: 0 }],
      'daf-argument-anchor',
    );
    const doc = parse(out);
    const markers = doc.querySelectorAll('.daf-argument-anchor');
    expect(markers.length).toBe(1);
    const m = markers[0];
    expect(m.getAttribute('data-idx')).toBe('0');
    // Verbatim match → no fallback marker, anchored before "מחזיר".
    expect(m.getAttribute('data-anchor-fallback')).toBeNull();
    expect((m.nextElementSibling as HTMLElement).textContent).toBe('מחזיר');
  });

  it('falls back to the startSegIdx position when the excerpt does not match', () => {
    // Sefaria-spelled excerpt that never matches the HebrewBooks abbreviation.
    const out = injectAnchorMarkers(
      CHULLIN_20A,
      [{ excerpt: 'ואי סלקא דעתך מחזיר דוקא', index: 0, startSegIdx: 0 }],
      'daf-argument-anchor',
    );
    const doc = parse(out);
    const markers = doc.querySelectorAll('.daf-argument-anchor');
    expect(markers.length).toBe(1);
    const m = markers[0];
    expect(m.getAttribute('data-anchor-fallback')).toBe('seg');
    // Seg 0's first word is "ואי".
    expect((m.nextElementSibling as HTMLElement).textContent).toBe('ואי');
  });

  it('anchors via segment even when the instance has no excerpt at all', () => {
    const out = injectAnchorMarkers(
      CHULLIN_20A,
      [{ excerpt: '', index: 2, startSegIdx: 2 }],
      'daf-argument-anchor',
    );
    const doc = parse(out);
    const m = doc.querySelector('.daf-argument-anchor');
    expect(m).not.toBeNull();
    expect(m!.getAttribute('data-anchor-fallback')).toBe('seg');
    expect((m!.nextElementSibling as HTMLElement).textContent).toBe('אר'); // first word of seg 2
  });

  it('renders no marker when neither the excerpt nor a known segment resolves', () => {
    const out = injectAnchorMarkers(
      CHULLIN_20A,
      [{ excerpt: 'פסוק שאינו קיים', index: 0, startSegIdx: 99 }],
      'daf-argument-anchor',
    );
    expect(parse(out).querySelectorAll('.daf-argument-anchor').length).toBe(0);
  });
});

describe('range anchors (aggadata / pesukim) seg fallback', () => {
  const STORY = daf([
    ['פתיחה', 0],
    ['של', 0],
    ['הסיפור', 0],
    ['אמצע', 1],
    ['הסיפור', 1],
    ['סוף', 2],
    ['הסיפור', 2],
    ['כאן', 2],
  ]);

  it('falls back to endSegIdx for the closing anchor when endExcerpt does not match', () => {
    const out = injectAggadataAnchors(STORY, [
      { excerpt: 'פתיחה של', endExcerpt: 'מילה שלא קיימת', index: 0, startSegIdx: 0, endSegIdx: 2 },
    ]);
    const doc = parse(out);
    const start = doc.querySelector('.daf-aggadata-anchor');
    const end = doc.querySelector('.daf-aggadata-end-anchor');
    expect(start).not.toBeNull();
    expect(start!.getAttribute('data-anchor-fallback')).toBeNull(); // start matched verbatim
    expect(end).not.toBeNull();
    expect(end!.getAttribute('data-anchor-fallback')).toBe('seg');
    // End marker sits AFTER the last word of seg 2 ("כאן").
    expect((end!.previousElementSibling as HTMLElement).textContent).toBe('כאן');
  });

  it('pesukim: both ends fall back to their segments when excerpts miss', () => {
    const out = injectPesukimAnchors(STORY, [
      { excerpt: 'לא קיים', endExcerpt: 'גם לא', index: 0, startSegIdx: 0, endSegIdx: 1 },
    ]);
    const doc = parse(out);
    const start = doc.querySelector('.daf-pesuk-anchor');
    const end = doc.querySelector('.daf-pesuk-end-anchor');
    expect(start!.getAttribute('data-anchor-fallback')).toBe('seg');
    expect((start!.nextElementSibling as HTMLElement).textContent).toBe('פתיחה'); // seg 0 first
    expect(end!.getAttribute('data-anchor-fallback')).toBe('seg');
    expect((end!.previousElementSibling as HTMLElement).textContent).toBe('הסיפור'); // seg 1 last word
  });
});

describe('injectOpinionMarkers section bounding via segment', () => {
  // Two sections; the first section's excerpt is paraphrased (won't match), but
  // its startSegIdx lets the bounds resolve so the rabbi opinion inside still
  // anchors within the right section.
  const HTML = daf([
    ['פתח', 0],
    ['רבי', 0],
    ['מאיר', 0],
    ['אומר', 0],
    ['כך', 0],
    ['רבי', 1],
    ['יהודה', 1],
    ['אומר', 1],
    ['אחרת', 1],
  ]);

  it('anchors a rabbi opinion even when the section excerpt is paraphrased', () => {
    const out = injectOpinionMarkers(HTML, [
      {
        excerpt: 'נוסח אחר לגמרי שאינו תואם',
        startSegIdx: 0,
        rabbis: [{ name: 'Rabbi Meir', nameHe: 'רבי מאיר', opinionStart: 'רבי מאיר אומר' }],
      },
      {
        excerpt: 'רבי יהודה אומר',
        startSegIdx: 1,
        rabbis: [{ name: 'Rabbi Yehuda', nameHe: 'רבי יהודה', opinionStart: 'רבי יהודה אומר' }],
      },
    ]);
    const doc = parse(out);
    const opinions = doc.querySelectorAll('.daf-opinion-anchor');
    expect(opinions.length).toBe(2);
    const meir = doc.querySelector('.daf-opinion-anchor[data-rabbi="Rabbi Meir"]');
    expect(meir).not.toBeNull();
    expect(meir!.getAttribute('data-section-idx')).toBe('0');
    expect((meir!.nextElementSibling as HTMLElement).textContent).toBe('רבי');
  });
});
