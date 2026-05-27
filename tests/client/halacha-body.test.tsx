// @vitest-environment jsdom
import { render } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HalachaTopic } from '../../src/client/shapes';
import { HalachaBody } from '../../src/client/ArgumentSidebar';
import { setLang, t } from '../../src/client/i18n';

beforeEach(() => {
  setLang('en');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] }) as unknown as Response));
});
afterEach(() => {
  vi.unstubAllGlobals();
  setLang('en');
});

const topic: HalachaTopic = {
  topic: 'Muktzeh on Shabbat',
  topicHe: 'מוקצה בשבת',
  excerpt: 'אבן שעל פי החבית',
  rulings: {},
};

describe('HalachaBody', () => {
  it('renders the accent title, Hebrew twin subtitle, and no QA affordance', () => {
    const { container } = render(() => (
      <HalachaBody topic={topic} index={0} tractate="Shabbat" page="125b" />
    ));
    const h3 = container.querySelector('h3')!;
    expect(h3.textContent).toBe('Muktzeh on Shabbat');
    expect(h3.getAttribute('dir')).toBeNull();

    const subtitle = container.querySelector('p[dir="rtl"]')!;
    expect(subtitle.getAttribute('lang')).toBe('he');
    expect(subtitle.textContent).toContain('מוקצה בשבת');

    // Halacha has no Q&A panel.
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.some((b) => b.textContent?.includes(t('qa.questions')))).toBe(false);
  });
});
