import { describe, expect, it } from 'vitest';
import { injectCheckedNames } from '../../src/client/injectCheckedNames';
import { tokenizeHebrewHtml } from '../../src/client/tokenize';
import fixture from '../fixtures/source-person-names.json';

describe('distinct people with the same name in real passages', () => {
  for (const ref of [...new Set(fixture.rows.map((r) => r.occurrence.ref))]) {
    it(`keeps the two people separate in ${ref}`, () => {
      const rows = fixture.rows.filter((r) => r.occurrence.ref === ref);
      const box = document.createElement('div');
      box.innerHTML = tokenizeHebrewHtml(rows[0].segment);
      for (const word of box.querySelectorAll<HTMLElement>('.daf-word'))
        word.dataset.seg = String(rows[0].segIdx);
      box.innerHTML = injectCheckedNames(
        box.innerHTML,
        rows.map((r) => r.occurrence),
      );
      const marks = [...box.querySelectorAll<HTMLElement>('[data-checked-person]')];
      expect(marks.map((m) => m.dataset.rabbiSlug)).toEqual(rows.map((r) => r.occurrence.personId));
      expect(new Set(marks.map((m) => m.dataset.rabbiSlug)).size).toBe(2);
      expect(marks.every((m) => m.classList.contains('rabbi-gen-unknown'))).toBe(true);
      expect(marks.some((m) => m.textContent?.includes('עקיבא'))).toBe(false);
    });
  }
});
