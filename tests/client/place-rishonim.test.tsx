// @vitest-environment jsdom
import { render } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLACES_HINT, PlaceChips, RISHONIM_RECIPE, RISHONIM_BLOCKS, rishonimDisplayInstance, rishonimSynthInstance, type PlaceInstance, type RishonimInstance } from '../../src/client/ArgumentSidebar';
import { SidebarPanelFromHint, SidebarCardFromHint } from '../../src/client/sidebar/primitives';
import { setLang, t } from '../../src/client/i18n';

beforeEach(() => {
  setLang('en');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] }) as unknown as Response));
});
afterEach(() => {
  vi.unstubAllGlobals();
  setLang('en');
});

describe('place panel (generic hint adapter + place chips)', () => {
  const place: PlaceInstance = {
    fields: { name: 'Tiberias', nameHe: 'טבריה', kind: 'city', region: 'israel', knownAs: ['Tveria'] },
  };
  it('renders the accent title, Hebrew twin, and region/kind chips via SidebarPanelFromHint', () => {
    const { container } = render(() => (
      <SidebarPanelFromHint hint={PLACES_HINT} instance={place} tractate="Shabbat" page="125b" chips={<PlaceChips place={place} />} />
    ));
    expect(container.querySelector('h3')!.textContent).toBe('Tiberias');
    const sub = container.querySelector('p[dir="rtl"]')!;
    expect(sub.textContent).toContain('טבריה');
    expect(container.textContent).toContain('city');
    expect(container.textContent).toContain(t('geography.eretzYisrael'));
  });
});

describe('Rishonim recipe card', () => {
  const inst: RishonimInstance = {
    segIdx: 6,
    fields: { works: ['Rashi', 'Tosafot'], commentCount: 3, comments: [] },
  };
  it('renders the segment title, a counts meta line, and the primary-sources label', () => {
    const { container } = render(() => (
      <SidebarCardFromHint
        recipe={RISHONIM_RECIPE}
        instance={rishonimDisplayInstance(inst)}
        synthInstance={rishonimSynthInstance(inst)}
        instanceKey={`rishonim:Shabbat:125b:${inst.segIdx}`}
        tractate="Shabbat"
        page="125b"
        specialBlocks={RISHONIM_BLOCKS}
      />
    ));
    const h3 = container.querySelector('h3')!;
    expect(h3.textContent).toContain(t('rishonim.onSegment', { n: 7 }));
    // counts moved to the meta line below the title
    expect(container.textContent).toContain(t('rishonim.workCount.other', { count: 2 }));
    expect(container.textContent).toContain(t('rishonim.primarySources'));
  });
});
