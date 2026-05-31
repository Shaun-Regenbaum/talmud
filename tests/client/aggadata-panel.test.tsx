// @vitest-environment jsdom
import { render } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AggadataStory } from '../../src/client/shapes';
import { AggadataPanel } from '../../src/client/ArgumentSidebar';
import { setLang, t } from '../../src/client/i18n';

// MarkEnrichmentCards fetches /api/enrichments on mount; stub it so the
// panel mounts cleanly and we can assert its synchronous structure (the leaf
// SectionCards arrive later via onResolved and are covered by the SectionCard
// unit test).
beforeEach(() => {
  setLang('en');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] }) as unknown as Response));
});
afterEach(() => {
  vi.unstubAllGlobals();
  setLang('en');
});

const story: AggadataStory = {
  title: "Rabbi's stone pile",
  titleHe: 'מעשה רבי בנידבך',
  summary: 'A short summary of the story.',
  excerpt: 'פעם אחת',
  theme: 'designation',
  startSegIdx: 3,
  endSegIdx: 5,
};

describe('AggadataPanel', () => {
  it('renders the accent title, Hebrew twin subtitle, theme chip, summary, and QA affordance', () => {
    const { container } = render(() => (
      <AggadataPanel story={story} index={0} tractate="Shabbat" page="125b" />
    ));

    const h3 = container.querySelector('h3')!;
    expect(h3.textContent).toBe("Rabbi's stone pile");
    expect(h3.getAttribute('dir')).toBeNull(); // English title is LTR primary

    const subtitle = container.querySelector('p[dir="rtl"]')!;
    expect(subtitle.getAttribute('lang')).toBe('he');
    expect(subtitle.textContent).toContain('מעשה רבי בנידבך');

    expect(container.textContent).toContain('designation'); // theme chip
    expect(container.textContent).toContain('A short summary of the story.');

    // QA toggle renders synchronously (its lists are lazy on expand).
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.some((b) => b.textContent?.includes(t('qa.questions')))).toBe(true);
  });

  it('aggadata does not flip names in Hebrew mode (English title stays primary)', () => {
    setLang('he');
    const { container } = render(() => (
      <AggadataPanel story={story} index={0} tractate="Shabbat" page="125b" />
    ));
    expect(container.querySelector('h3')!.textContent).toBe("Rabbi's stone pile");
    expect(container.querySelector('h3')!.getAttribute('dir')).toBeNull();
  });
});
