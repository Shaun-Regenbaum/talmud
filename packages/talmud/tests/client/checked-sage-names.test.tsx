import { describe, expect, it } from 'vitest';
import { injectCheckedNames } from '../../src/client/injectCheckedNames';
import { tokenizeHebrewHtml } from '../../src/client/tokenize';
import fixture from '../fixtures/checked-sage-names.json';

function segmentHtml(text: string, seg: number) {
  const box = document.createElement('div');
  box.innerHTML = tokenizeHebrewHtml(text);
  for (const word of box.querySelectorAll<HTMLElement>('.daf-word')) word.dataset.seg = String(seg);
  return box.innerHTML;
}
function render(html: string) {
  const box = document.createElement('div');
  box.innerHTML = html;
  return box;
}

describe('checked sage occurrences from real passages', () => {
  for (const row of fixture.rows) {
    it(`${row.occurrence.ref}: ${row.occurrence.personId} at ${row.occurrence.characterStart}`, () => {
      const box = render(
        injectCheckedNames(segmentHtml(row.segment, row.segIdx), [row.occurrence]),
      );
      const marks = box.querySelectorAll<HTMLElement>('[data-checked-person]');
      expect(marks.length).toBe(1);
      expect(marks[0].dataset.rabbiSlug).toBe(row.occurrence.personId);
      expect(marks[0].textContent?.replace(/[֑-ׇ]/g, '')).toBe(row.expectedNameText);
    });
  }
  it('does not link after the source words change', () => {
    const row = fixture.rows[0];
    expect(
      render(
        injectCheckedNames(segmentHtml(row.segment.replace(/ש/, 'מ'), row.segIdx), [
          row.occurrence,
        ]),
      ).querySelector('[data-checked-person]'),
    ).toBeNull();
  });
  it('removes an older link when checked identities conflict', () => {
    const row = fixture.rows[0];
    const html = injectCheckedNames(segmentHtml(row.segment, row.segIdx), [row.occurrence]);
    const conflict = { ...row.occurrence, personId: fixture.rows[1].occurrence.personId };
    expect(
      render(injectCheckedNames(html, [row.occurrence, conflict])).querySelector(
        '.rabbi-underline',
      ),
    ).toBeNull();
  });
  it('distinguishes the two full Shimon names while leaving bare Shimons alone', () => {
    const rows = fixture.rows.filter((r) => r.occurrence.ref === 'Sanhedrin 17b:4');
    const box = render(
      injectCheckedNames(
        segmentHtml(rows[0].segment, rows[0].segIdx),
        rows.map((r) => r.occurrence),
      ),
    );
    expect(
      [...box.querySelectorAll<HTMLElement>('[data-checked-person]')].map(
        (e) => e.dataset.rabbiSlug,
      ),
    ).toEqual(['shimon-b-azzai', 'shimon-b-zoma']);
    expect(box.querySelectorAll('[data-checked-person] .daf-word').length).toBe(6);
  });
});
