// @vitest-environment jsdom
import { render } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaceBody, RishonimBody, type PlaceInstance, type RishonimInstance } from '../../src/client/ArgumentSidebar';
import { setLang, t } from '../../src/client/i18n';

beforeEach(() => {
  setLang('en');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] }) as unknown as Response));
});
afterEach(() => {
  vi.unstubAllGlobals();
  setLang('en');
});

describe('PlaceBody', () => {
  const place: PlaceInstance = {
    fields: { name: 'Tiberias', nameHe: 'טבריה', kind: 'city', region: 'israel', knownAs: ['Tveria'] },
  };
  it('renders the accent title, Hebrew twin, and region/kind chips', () => {
    const { container } = render(() => <PlaceBody place={place} tractate="Shabbat" page="125b" />);
    expect(container.querySelector('h3')!.textContent).toBe('Tiberias');
    const sub = container.querySelector('p[dir="rtl"]')!;
    expect(sub.textContent).toContain('טבריה');
    expect(container.textContent).toContain('city');
    expect(container.textContent).toContain(t('geography.eretzYisrael'));
  });
});

describe('RishonimBody', () => {
  const inst: RishonimInstance = {
    segIdx: 6,
    fields: { works: ['Rashi', 'Tosafot'], commentCount: 3, comments: [] },
  };
  it('renders the segment title, a counts meta line, and the primary-sources label', () => {
    const { container } = render(() => <RishonimBody instance={inst} tractate="Shabbat" page="125b" />);
    const h3 = container.querySelector('h3')!;
    expect(h3.textContent).toContain(t('rishonim.onSegment', { n: 7 }));
    // counts moved to the meta line below the title
    expect(container.textContent).toContain(t('rishonim.workCount.other', { count: 2 }));
    expect(container.textContent).toContain(t('rishonim.primarySources'));
  });
});
