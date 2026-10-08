import { describe, expect, it } from 'vitest';
import { injectCheckedNames } from '../../src/client/injectCheckedNames';
import { tokenizeHebrewHtml } from '../../src/client/tokenize';
import fixture from '../fixtures/person-verse-references.json';

function render(text: string) {
  const box = document.createElement('div');
  box.innerHTML = tokenizeHebrewHtml(text);
  for (const word of box.querySelectorAll<HTMLElement>('.daf-word')) word.dataset.seg = '13';
  box.innerHTML = injectCheckedNames(box.innerHTML, fixture.occurrences);
  return box;
}

describe('reviewed names beside printed verse references', () => {
  it('links the full son name and the separate father when printed references are omitted', () => {
    const box = render(fixture.rendered);
    const links = box.querySelectorAll<HTMLElement>('[data-checked-person]');
    expect([...links].map((link) => link.dataset.rabbiSlug)).toEqual([
      'local:b174-p0/D',
      'local:b174-p0/E',
    ]);
    expect(links[0].textContent).toBe('מר זוטרא בריה דרב נחמן');
    expect(links[1].textContent).toBe('לרב נחמן');
    expect(links[0].contains(links[1])).toBe(false);
  });
  it('also links the names when the page keeps its verse references', () => {
    expect(render(fixture.source).querySelectorAll('[data-checked-person]')).toHaveLength(2);
  });
  it('still refuses a different word outside the name', () => {
    expect(
      render(fixture.rendered.replace('מחט', 'מסמר')).querySelector('[data-checked-person]'),
    ).toBeNull();
  });
  it('does not ignore arbitrary words in parentheses', () => {
    expect(
      render(`${fixture.rendered} (רב הונא)`).querySelector('[data-checked-person]'),
    ).toBeNull();
  });
});
