// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { injectInitialNames } from '../../src/client/injectInitialNames';
import { initialPlacement } from '../../src/lib/sage-graph/initial-placement';
import type { LegacyRow } from '../../src/lib/sage-graph/legacy-readings';
import saved from '../fixtures/initial-name-placement.json';

const prepare = async () => {
  const placement = await initialPlacement(saved.occurrences, saved.records as LegacyRow[]);
  const source = placement.sources[0],
    segment = Number(source.ref.split(':').at(-1)) - 1;
  const html = `<p>${source.text
    .split(/\s+/)
    .map((w) => `<span class="daf-word" data-seg="${segment}">${w}</span>`)
    .join(' ')}</p>`;
  return {
    placement: {
      ...placement,
      sources: [source],
      occurrences: placement.occurrences.filter((o) => o.sourceKey === source.key),
    },
    html,
  };
};
describe('conservative initial name links', () => {
  it('paints the actual exact name and uses the existing local card ID', async () => {
    const { placement, html } = await prepare(),
      result = injectInitialNames(html, placement);
    expect(result.painted).toBe(1);
    const doc = new DOMParser().parseFromString(result.html, 'text/html');
    const link = doc.querySelector<HTMLElement>('[data-initial-reading]')!;
    expect(link.textContent).toBe(placement.occurrences[0].quote);
    expect(link.dataset.rabbiSlug).toBe(placement.occurrences[0].people[0].id);
  });
  it('allows the actual reader plain span container without removing annotated wrappers', async () => {
    const { placement, html } = await prepare();
    expect(
      injectInitialNames(html.replace('<p>', '<span>').replace('</p>', '</span>'), placement)
        .painted,
    ).toBe(1);
  });
  it('preserves existing accepted, human and place wrappers', async () => {
    const { placement, html } = await prepare();
    for (const mark of ['rabbi-underline', 'city-marker']) {
      const marked = html
        .replace('<p>', `<p><span class="${mark}" data-rabbi-slug="existing">`)
        .replace('</p>', '</span></p>');
      expect(injectInitialNames(marked, placement).painted).toBe(0);
      expect(injectInitialNames(marked, placement).html).toBe(marked);
    }
  });
  it('rejects changed word boundaries in the captured name', async () => {
    const { placement, html } = await prepare();
    const damaged = html.replace(
      'רבינא</span>',
      'רב</span> <span class="daf-word" data-seg="5">ינא</span>',
    );
    expect(injectInitialNames(damaged, placement).painted).toBe(0);
  });
  it('refuses changed layout, missing segment labels and shifted offsets', async () => {
    const { placement, html } = await prepare();
    expect(injectInitialNames(html.replace('רבינא', 'רב'), placement).painted).toBe(0);
    expect(
      injectInitialNames(html.replaceAll('data-seg=', 'data-absent='), placement).painted,
    ).toBe(0);
    placement.occurrences[0].start++;
    expect(injectInitialNames(html, placement).painted).toBe(0);
  });
});
