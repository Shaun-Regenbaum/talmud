import { describe, expect, it } from 'vitest';
import { injectCheckedNames } from '../../src/client/injectCheckedNames';
import fixture from '../fixtures/checked-name-marker-gaps.json';

function render(html: string) {
  const box = document.createElement('div');
  box.innerHTML = html;
  return box;
}

describe('checked names in actual page marker gaps', () => {
  for (const row of fixture.rows) {
    it(`restores only source words on ${row.ref}`, () => {
      const before = render(row.html);
      const after = render(injectCheckedNames(row.html, row.occurrences));
      expect(after.textContent).toBe(before.textContent);
      for (const occurrence of row.occurrences) {
        const marks = after.querySelectorAll<HTMLElement>(
          `[data-checked-person="${occurrence.personKey}"]`,
        );
        expect(marks.length).toBeGreaterThan(0);
        expect([...marks].map((m) => m.textContent?.trim()).join(' ')).toBe(
          occurrence.quote === 'רבא' ? 'דרבא' : occurrence.quote,
        );
        for (const mark of marks) expect(mark.dataset.rabbiSlug).toBe(occurrence.personId);
      }
      for (const word of after.querySelectorAll<HTMLElement>('.daf-word')) {
        if (/^[א-ת]{1,3}\]$/.test(word.textContent?.trim() ?? '')) {
          expect(word.closest('[data-checked-person]')).toBeNull();
          expect(word.dataset.seg).toBeUndefined();
        }
      }
      const oldTagged = [...before.querySelectorAll<HTMLElement>('[data-seg]')].map((w) => [
        w.dataset.wordIndex,
        w.dataset.seg,
      ]);
      for (const [index, seg] of oldTagged)
        expect(after.querySelector<HTMLElement>(`[data-word-index="${index}"]`)?.dataset.seg).toBe(
          seg,
        );
    });
  }
  it('keeps a changed source unlinked', () => {
    const row = fixture.rows[0];
    const changed = row.occurrences.map((o) => ({ ...o, source: o.source.replace('תני', 'אמר') }));
    expect(
      render(injectCheckedNames(row.html, changed)).querySelector('[data-checked-person]'),
    ).toBeNull();
  });
  it('refuses a repeated complete sentence in the same gap', () => {
    const row = fixture.rows[0];
    const box = render(row.html);
    const unmarked = [...box.querySelectorAll<HTMLElement>('.daf-word:not([data-seg])')];
    for (const word of unmarked) box.appendChild(word.cloneNode(true));
    expect(
      render(injectCheckedNames(box.innerHTML, row.occurrences)).querySelector(
        '[data-checked-person]',
      ),
    ).toBeNull();
  });
  it('does not cross another segment marker', () => {
    const row = fixture.rows[1];
    const box = render(row.html);
    const suffix = [...box.querySelectorAll<HTMLElement>('.daf-word')].find(
      (w) => w.textContent === 'עובדי',
    );
    expect(suffix).toBeDefined();
    suffix!.dataset.seg = '10';
    expect(
      render(injectCheckedNames(box.innerHTML, row.occurrences)).querySelector(
        '[data-checked-person]',
      ),
    ).toBeNull();
  });
  it('refuses an unanchored gap', () => {
    const row = fixture.rows[0];
    const box = render(row.html);
    for (const word of box.querySelectorAll('[data-seg]')) word.removeAttribute('data-seg');
    expect(
      render(injectCheckedNames(box.innerHTML, row.occurrences)).querySelector(
        '[data-checked-person]',
      ),
    ).toBeNull();
  });
  it('preserves a target marker outside the complete source match', () => {
    const row = fixture.rows[0];
    const box = render(row.html);
    const last = box.querySelector('.daf-word:last-child') as HTMLElement;
    expect(last.textContent).toBe('אשם');
    last.dataset.seg = '20';
    const after = render(injectCheckedNames(box.innerHTML, row.occurrences));
    expect(after.querySelector('[data-checked-person]')).toBeNull();
    expect(after.querySelector<HTMLElement>('.daf-word:last-child')?.dataset.seg).toBe('20');
  });
  it('keeps split name links unchanged on a second pass', () => {
    const row = fixture.rows[0];
    const first = injectCheckedNames(row.html, row.occurrences);
    expect(injectCheckedNames(first, row.occurrences)).toBe(first);
  });
});
