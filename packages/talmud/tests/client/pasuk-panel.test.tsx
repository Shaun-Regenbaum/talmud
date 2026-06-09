// @vitest-environment jsdom
import { render } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PASUK_BLOCKS, PASUK_RECIPE, pasukInstance } from '../../src/client/ArgumentSidebar';
import { setLang, t } from '../../src/client/i18n';
import type { Pasuk } from '../../src/client/shapes';
import { SidebarCardFromHint } from '../../src/client/sidebar/primitives';

beforeEach(() => {
  setLang('en');
  // Verse + enrichment fetches both go through fetch; an empty payload lets
  // the card mount and fall back to the verseRef as the heading.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  setLang('en');
});

const pasuk: Pasuk = {
  verseRef: 'Genesis 1:1',
  excerpt: 'בראשית',
  summary: 'The opening verse.',
  startSegIdx: 2,
  endSegIdx: 2,
};

const renderCard = () =>
  render(() => (
    <SidebarCardFromHint
      recipe={PASUK_RECIPE}
      instance={pasukInstance(pasuk)}
      instanceKey={pasuk.verseRef}
      tractate="Shabbat"
      page="125b"
      specialBlocks={PASUK_BLOCKS}
    />
  ));

describe('Pasuk recipe card', () => {
  it('renders the verse ref as an RTL Hebrew heading (from the special verse block) + a tanakh-font verse paragraph', () => {
    const { container } = renderCard();

    const h3 = container.querySelector('h3')!;
    expect(h3.getAttribute('dir')).toBe('rtl');
    expect(h3.getAttribute('lang')).toBe('he');
    expect(h3.textContent).toContain('Genesis 1:1'); // fallback before fetch resolves

    // The verse paragraph uses the widened cantillation fallback chain.
    const versePara = Array.from(container.querySelectorAll('p[dir="rtl"]')).find((p) =>
      (p as HTMLElement).style.getPropertyValue('font-family').includes('Cardo'),
    ) as HTMLElement | undefined;
    expect(versePara).toBeTruthy();

    // Expand/collapse toggle + QA affordance both render synchronously.
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    expect(buttons.some((b) => b.textContent?.includes(t('qa.questions')))).toBe(true);
  });

  it('declares the four explainer leaves + Q&A in order', () => {
    const ids = PASUK_RECIPE.sections.flatMap((s) => (s.type === 'explainer' ? [s.dep] : []));
    expect(ids).toEqual([
      'pesukim.tanach-context',
      'pesukim.why-here',
      'pesukim.mechanism',
      'pesukim.landing',
    ]);
    expect(PASUK_RECIPE.sections.some((s) => s.type === 'qa')).toBe(true);
    expect(PASUK_RECIPE.titleField).toBeUndefined(); // header is the custom verse block
  });
});
