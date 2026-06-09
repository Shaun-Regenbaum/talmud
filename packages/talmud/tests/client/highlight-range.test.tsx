// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { buildTokenRange } from '../../src/client/highlightRange';

// Minimal daf column: four words across segments 0,1,1,2.
function col(): HTMLElement {
  const d = document.createElement('div');
  d.innerHTML = [
    '<span class="daf-word" data-seg="0">a</span>',
    '<span class="daf-word" data-seg="1">b</span>',
    '<span class="daf-word" data-seg="1">c</span>',
    '<span class="daf-word" data-seg="2">d</span>',
  ].join('');
  document.body.appendChild(d);
  return d;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('buildTokenRange', () => {
  it('same-segment (start == end) covers just that segment — the rishonim highlight case', () => {
    const r = buildTokenRange(col(), 2, 2);
    expect(r).not.toBeNull();
    expect(r!.toString()).toBe('d');
  });

  it('a multi-word segment covers all of its words', () => {
    expect(buildTokenRange(col(), 1, 1)!.toString()).toBe('bc');
  });

  it('walks the end segment down when the requested end is untagged (LLM overshoot)', () => {
    // segments 3-5 do not exist → it should walk down to the last tagged seg (2)
    expect(buildTokenRange(col(), 0, 5)!.toString()).toBe('abcd');
  });

  it('returns null when the start segment has no words', () => {
    expect(buildTokenRange(col(), 9, 9)).toBeNull();
  });
});
