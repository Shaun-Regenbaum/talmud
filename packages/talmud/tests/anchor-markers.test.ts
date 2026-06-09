// @vitest-environment jsdom
//
// Regression coverage for the *original* anchor-injection contract — the
// behaviour that predates the data-seg fallback and must keep working:
// verbatim excerpt matching, the monotonic forward cursor (so repeated
// phrases anchor to successive occurrences and item N+1 never steals item
// N's match), start/end range placement, and the per-section opinion bounds.
// The seg-fallback path is covered separately in
// anchor-markers-seg-fallback.test.ts.
import { describe, expect, it } from 'vitest';
import {
  injectAggadataAnchors,
  injectAnchorMarkers,
  injectOpinionMarkers,
  injectPesukimAnchors,
} from '../src/client/anchorMarkers';

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

describe('injectAnchorMarkers — verbatim contract', () => {
  it('anchors a single verbatim excerpt and records its token length', () => {
    const html = daf([['אמר'], ['רבי'], ['יוחנן'], ['הלכה'], ['כמותו']]);
    const out = injectAnchorMarkers(
      html,
      [{ excerpt: 'רבי יוחנן', index: 0 }],
      'daf-argument-anchor',
    );
    const doc = parse(out);
    const m = doc.querySelector('.daf-argument-anchor')!;
    expect(m).not.toBeNull();
    expect(m.getAttribute('data-idx')).toBe('0');
    expect(m.getAttribute('data-excerpt-len')).toBe('2');
    expect(m.getAttribute('data-anchor-fallback')).toBeNull();
    expect((m.nextElementSibling as HTMLElement).textContent).toBe('רבי');
  });

  it('advances the cursor so a repeated phrase anchors to successive occurrences', () => {
    // "שלום עולם" appears twice; two anchors must land on the two distinct
    // occurrences, not both on the first.
    const html = daf([['שלום'], ['עולם'], ['גדול'], ['שלום'], ['עולם'], ['קטן']]);
    const out = injectAnchorMarkers(
      html,
      [
        { excerpt: 'שלום עולם', index: 0 },
        { excerpt: 'שלום עולם', index: 1 },
      ],
      'daf-argument-anchor',
    );
    const doc = parse(out);
    const markers = Array.from(doc.querySelectorAll('.daf-argument-anchor'));
    expect(markers.length).toBe(2);
    // Both followed by "שלום", but at different document positions.
    const words = Array.from(doc.querySelectorAll('.daf-word'));
    const posOf = (m: Element) => words.indexOf(m.nextElementSibling as HTMLElement);
    expect(posOf(markers[0])).toBe(0);
    expect(posOf(markers[1])).toBe(3);
  });

  it('forward-only: a later anchor does not match an occurrence before an earlier one', () => {
    // index 0's excerpt sits late; index 1's excerpt sits early. Because the
    // cursor only moves forward, index 1 cannot match its early occurrence and
    // (with no segment) drops rather than anchoring out of order.
    const html = daf([['בית'], ['הלל'], ['גמרא'], ['בית'], ['שמאי']]);
    const out = injectAnchorMarkers(
      html,
      [
        { excerpt: 'בית שמאי', index: 0 },
        { excerpt: 'בית הלל', index: 1 },
      ],
      'daf-argument-anchor',
    );
    const doc = parse(out);
    const markers = Array.from(doc.querySelectorAll('.daf-argument-anchor'));
    // Only index 0 anchors; index 1's earlier occurrence is behind the cursor.
    expect(markers.length).toBe(1);
    expect(markers[0].getAttribute('data-idx')).toBe('0');
  });

  it('returns the html untouched when there are no daf-word spans', () => {
    const html = '<p>no words here</p>';
    expect(injectAnchorMarkers(html, [{ excerpt: 'משהו', index: 0 }], 'daf-argument-anchor')).toBe(
      html,
    );
  });

  it('returns the html untouched when given no anchors', () => {
    const html = daf([['אחד'], ['שתים']]);
    expect(injectAnchorMarkers(html, [], 'daf-argument-anchor')).toBe(html);
  });
});

describe('range anchors — verbatim contract', () => {
  const STORY = daf([
    ['היה'],
    ['מעשה'],
    ['בחסיד'],
    ['אחד'],
    ['והלך'],
    ['לביתו'],
    ['ומת'],
    ['בשלום'],
    ['גדול'],
  ]);

  it('places start before the opening phrase and end after the closing phrase', () => {
    const out = injectAggadataAnchors(STORY, [
      { excerpt: 'היה מעשה', endExcerpt: 'ומת בשלום', index: 0 },
    ]);
    const doc = parse(out);
    const start = doc.querySelector('.daf-aggadata-anchor')!;
    const end = doc.querySelector('.daf-aggadata-end-anchor')!;
    expect(start.getAttribute('data-anchor-fallback')).toBeNull();
    expect(end.getAttribute('data-anchor-fallback')).toBeNull();
    // Start sits before "היה"; end sits AFTER "בשלום" (last word of end phrase).
    expect((start.nextElementSibling as HTMLElement).textContent).toBe('היה');
    expect((end.previousElementSibling as HTMLElement).textContent).toBe('בשלום');
  });

  it('keeps successive items in order via the shared cursor', () => {
    const out = injectPesukimAnchors(STORY, [
      { excerpt: 'היה מעשה', index: 0 },
      { excerpt: 'ומת בשלום', index: 1 },
    ]);
    const doc = parse(out);
    const anchors = Array.from(doc.querySelectorAll('.daf-pesuk-anchor'));
    expect(anchors.length).toBe(2);
    const words = Array.from(doc.querySelectorAll('.daf-word'));
    const posOf = (m: Element) => words.indexOf(m.nextElementSibling as HTMLElement);
    expect(posOf(anchors[0])).toBeLessThan(posOf(anchors[1]));
  });

  it('finds an end phrase that overlaps the start phrase (single-clause item)', () => {
    const single = daf([['ואמר'], ['רבי'], ['חנינא'], ['הכל'], ['בידי'], ['שמים']]);
    const out = injectAggadataAnchors(single, [
      { excerpt: 'ואמר רבי חנינא', endExcerpt: 'בידי שמים', index: 0 },
    ]);
    const doc = parse(out);
    expect(doc.querySelector('.daf-aggadata-anchor')).not.toBeNull();
    const end = doc.querySelector('.daf-aggadata-end-anchor')!;
    expect(end).not.toBeNull();
    expect((end.previousElementSibling as HTMLElement).textContent).toBe('שמים');
  });
});

describe('injectOpinionMarkers — bounds contract', () => {
  // seg0: indices 0-4, seg1: indices 5-9
  const HTML = daf([
    ['פתח', 0],
    ['רבי', 0],
    ['מאיר', 0],
    ['אומר', 0],
    ['אלף', 0],
    ['ואז', 1],
    ['רבי', 1],
    ['יהודה', 1],
    ['אומר', 1],
    ['בית', 1],
  ]);

  it('anchors a rabbi opinion that falls inside its section', () => {
    const out = injectOpinionMarkers(HTML, [
      {
        excerpt: 'פתח רבי מאיר',
        startSegIdx: 0,
        rabbis: [{ name: 'Rabbi Meir', nameHe: 'רבי מאיר', opinionStart: 'רבי מאיר אומר' }],
      },
    ]);
    const doc = parse(out);
    const m = doc.querySelector('.daf-opinion-anchor[data-rabbi="Rabbi Meir"]')!;
    expect(m).not.toBeNull();
    expect(m.getAttribute('data-section-idx')).toBe('0');
    expect(m.getAttribute('data-opinion-len')).toBe('3');
  });

  it('does not anchor a rabbi whose opinion phrase falls past the section end', () => {
    // Section 0 ends where section 1 begins (seg1). Rabbi Meir's opinionStart
    // text only occurs inside section 1, so it must NOT anchor under section 0.
    const out = injectOpinionMarkers(HTML, [
      {
        excerpt: 'פתח רבי מאיר',
        startSegIdx: 0,
        rabbis: [{ name: 'Rabbi Meir', nameHe: 'רבי מאיר', opinionStart: 'רבי יהודה אומר' }],
      },
      {
        excerpt: 'רבי יהודה אומר',
        startSegIdx: 1,
        rabbis: [],
      },
    ]);
    const doc = parse(out);
    expect(doc.querySelectorAll('.daf-opinion-anchor').length).toBe(0);
  });

  it('skips rabbis with no opinionStart', () => {
    const out = injectOpinionMarkers(HTML, [
      {
        excerpt: 'פתח רבי מאיר',
        startSegIdx: 0,
        rabbis: [{ name: 'Rabbi Meir', nameHe: 'רבי מאיר' }],
      },
    ]);
    expect(parse(out).querySelectorAll('.daf-opinion-anchor').length).toBe(0);
  });
});
