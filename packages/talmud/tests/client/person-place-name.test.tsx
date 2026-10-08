import { describe, expect, it } from 'vitest';
import { injectCheckedNames } from '../../src/client/injectCheckedNames';
import { tokenizeHebrewHtml } from '../../src/client/tokenize';
import occurrence from '../fixtures/person-place-name.json';

function passage() {
  const box = document.createElement('div');
  box.innerHTML = tokenizeHebrewHtml(occurrence.source);
  for (const word of box.querySelectorAll<HTMLElement>('.daf-word')) word.dataset.seg = '10';
  return box;
}
function mark(box: HTMLElement, words: string[]) {
  const selected = [...box.querySelectorAll<HTMLElement>('.daf-word')].filter((word) =>
    words.includes(word.textContent ?? ''),
  );
  const marker = document.createElement('span');
  marker.className = 'city-marker';
  selected[0].replaceWith(marker);
  for (const word of selected) {
    marker.appendChild(word);
    marker.appendChild(document.createTextNode(' '));
  }
}

describe('places inside reviewed personal names', () => {
  it('links Hanan of Nehardea while preserving the separate destination marker', () => {
    const box = passage();
    mark(box, ['מנהרדעא']);
    mark(box, ['לפום', 'נהרא']);
    box.innerHTML = injectCheckedNames(box.innerHTML, [occurrence]);
    const person = box.querySelector<HTMLElement>('[data-checked-person]');
    expect(person?.dataset.rabbiSlug).toBe('local:b312-p9/D');
    expect(person?.textContent?.replace(/\s+/g, ' ').trim()).toBe('רב חנן מנהרדעא');
    expect(box.querySelectorAll('.city-marker')).toHaveLength(1);
    expect(box.querySelector('.city-marker')?.textContent).toContain('נהרא');
  });
  it('does not remove a place annotation extending beyond the reviewed name', () => {
    const box = passage();
    mark(box, ['מנהרדעא', 'איקלע']);
    box.innerHTML = injectCheckedNames(box.innerHTML, [occurrence]);
    expect(box.querySelector('[data-checked-person]')).toBeNull();
    expect(box.querySelector('.city-marker')).not.toBeNull();
  });
});
