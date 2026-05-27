// @vitest-environment jsdom
import { render } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pasuk } from '../../src/client/shapes';
import { PasukPanel } from '../../src/client/ArgumentSidebar';
import { setLang, t } from '../../src/client/i18n';

beforeEach(() => {
  setLang('en');
  // Verse + enrichment fetches both go through fetch; an empty payload lets
  // the panel mount and fall back to the verseRef as title.
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response));
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

describe('PasukPanel', () => {
  it('renders the verse reference as an RTL Hebrew-mode title and a tanakh-font verse block', () => {
    const { container } = render(() => <PasukPanel pasuk={pasuk} tractate="Shabbat" page="125b" />);

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
});
