// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadUserHighlights,
  saveUserHighlights,
  selectionToTokenRange,
  highlightCoversWord,
  buildHighlight,
  wordCoordFromTarget,
  bgForColor,
  HIGHLIGHT_COLORS,
  type UserHighlight,
} from '../src/client/userHighlights';

function buildDaf(): HTMLElement {
  // seg 0: [aleph, bet]  seg 1: [gimel, dalet, he]
  const col = document.createElement('div');
  col.className = 'daf-text';
  col.innerHTML =
    '<span class="daf-word" data-seg="0" data-word-index="0">aleph</span> ' +
    '<span class="daf-word" data-seg="0" data-word-index="1">bet</span> ' +
    '<span class="daf-word" data-seg="1" data-word-index="2">gimel</span> ' +
    '<span class="daf-word" data-seg="1" data-word-index="3">dalet</span> ' +
    '<span class="daf-word" data-seg="1" data-word-index="4">he</span>';
  document.body.appendChild(col);
  return col;
}

describe('selectionToTokenRange', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('maps a multi-word, cross-segment selection to (seg, tok) coords', () => {
    const col = buildDaf();
    const words = col.querySelectorAll<HTMLElement>('.daf-word');
    const range = document.createRange();
    range.setStartBefore(words[1]); // "bet"  (seg 0, tok 1)
    range.setEndAfter(words[2]); //  "gimel" (seg 1, tok 0)
    const out = selectionToTokenRange(range, col);
    expect(out).toEqual({ startSeg: 0, startTok: 1, endSeg: 1, endTok: 0, text: 'bet gimel' });
  });

  it('maps a single-word selection', () => {
    const col = buildDaf();
    const words = col.querySelectorAll<HTMLElement>('.daf-word');
    const range = document.createRange();
    range.setStartBefore(words[3]); // "dalet" (seg 1, tok 1)
    range.setEndAfter(words[3]);
    const out = selectionToTokenRange(range, col);
    expect(out).toEqual({ startSeg: 1, startTok: 1, endSeg: 1, endTok: 1, text: 'dalet' });
  });

  it('returns null for a collapsed selection', () => {
    const col = buildDaf();
    const range = document.createRange();
    range.setStart(col, 0);
    range.collapse(true);
    expect(selectionToTokenRange(range, col)).toBeNull();
  });

  it('returns null when the column has no tagged words', () => {
    const col = document.createElement('div');
    col.textContent = 'plain text, no words';
    document.body.appendChild(col);
    const range = document.createRange();
    range.selectNodeContents(col);
    expect(selectionToTokenRange(range, col)).toBeNull();
  });
});

describe('highlightCoversWord', () => {
  const h: UserHighlight = {
    id: 'x',
    startSeg: 0,
    startTok: 1,
    endSeg: 1,
    endTok: 1,
    text: 'bet gimel dalet',
    note: '',
    color: 'yellow',
    createdAt: 0,
  };

  it('covers words inside the range (inclusive endpoints)', () => {
    expect(highlightCoversWord(h, 0, 1)).toBe(true); // start
    expect(highlightCoversWord(h, 1, 0)).toBe(true); // middle seg
    expect(highlightCoversWord(h, 1, 1)).toBe(true); // end
  });

  it('excludes words before the start token and after the end token', () => {
    expect(highlightCoversWord(h, 0, 0)).toBe(false); // before startTok in startSeg
    expect(highlightCoversWord(h, 1, 2)).toBe(false); // after endTok in endSeg
  });
});

describe('wordCoordFromTarget', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('resolves (seg, tok) for a word element / its text node', () => {
    const col = buildDaf();
    const words = col.querySelectorAll<HTMLElement>('.daf-word');
    expect(wordCoordFromTarget(words[2], col)).toEqual({ seg: 1, tok: 0 });
    // A click usually lands on the text node inside the span.
    expect(wordCoordFromTarget(words[4].firstChild, col)).toEqual({ seg: 1, tok: 2 });
  });

  it('returns null for a target outside the column', () => {
    const col = buildDaf();
    const outside = document.createElement('span');
    outside.className = 'daf-word';
    outside.setAttribute('data-seg', '9');
    document.body.appendChild(outside);
    expect(wordCoordFromTarget(outside, col)).toBeNull();
  });
});

describe('persistence (localStorage round-trip)', () => {
  beforeEach(() => localStorage.clear());

  it('saves and loads per (tractate, page)', () => {
    const list = [buildHighlight({ startSeg: 0, startTok: 0, endSeg: 0, endTok: 1, text: 'aleph bet' })];
    saveUserHighlights('Berakhot', '2a', list);
    const back = loadUserHighlights('Berakhot', '2a');
    expect(back).toHaveLength(1);
    expect(back[0].text).toBe('aleph bet');
    // A different daf is isolated.
    expect(loadUserHighlights('Berakhot', '2b')).toEqual([]);
  });

  it('removes the key when the list is emptied', () => {
    saveUserHighlights('Shabbat', '5a', [buildHighlight({ startSeg: 0, startTok: 0, endSeg: 0, endTok: 0, text: 'x' })]);
    saveUserHighlights('Shabbat', '5a', []);
    expect(loadUserHighlights('Shabbat', '5a')).toEqual([]);
  });

  it('ignores corrupt storage payloads', () => {
    localStorage.setItem('talmud:user-highlights:v1:Eruvin:3a', '{not json');
    expect(loadUserHighlights('Eruvin', '3a')).toEqual([]);
  });

  it('normalizes records missing the optional note/color fields', () => {
    // A hand-edited record with only the structural anchor fields.
    localStorage.setItem(
      'talmud:user-highlights:v1:Eruvin:4a',
      JSON.stringify([{ id: 'a', startSeg: 0, startTok: 0, endSeg: 0, endTok: 1, text: 'x' }]),
    );
    const back = loadUserHighlights('Eruvin', '4a');
    expect(back).toHaveLength(1);
    expect(back[0].note).toBe('');
    expect(back[0].color).toBe(HIGHLIGHT_COLORS[0].key);
    expect(typeof back[0].note).toBe('string'); // safe for note().trim()
  });
});

describe('buildHighlight + palette', () => {
  it('defaults to an empty note and the first palette color', () => {
    const h = buildHighlight({ startSeg: 2, startTok: 0, endSeg: 2, endTok: 3, text: 'foo' });
    expect(h.note).toBe('');
    expect(h.color).toBe(HIGHLIGHT_COLORS[0].key);
    expect(h.id).toBeTruthy();
  });

  it('honours explicit color + note', () => {
    const h = buildHighlight({ startSeg: 0, startTok: 0, endSeg: 0, endTok: 0, text: 'x' }, { color: 'blue', note: 'a thought' });
    expect(h.color).toBe('blue');
    expect(h.note).toBe('a thought');
  });

  it('bgForColor falls back to yellow for unknown keys', () => {
    expect(bgForColor('blue')).toBe(HIGHLIGHT_COLORS.find((c) => c.key === 'blue')!.bg);
    expect(bgForColor('nonsense')).toBe(HIGHLIGHT_COLORS[0].bg);
  });
});
