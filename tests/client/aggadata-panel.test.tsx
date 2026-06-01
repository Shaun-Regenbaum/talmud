// @vitest-environment jsdom
import { render } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AggadataStory } from '../../src/client/shapes';
import { AGGADATA_RECIPE, AGGADATA_BLOCKS, aggadataInstance } from '../../src/client/ArgumentSidebar';
import { SidebarCardFromHint } from '../../src/client/sidebar/primitives';
import { setLang, t } from '../../src/client/i18n';

// MarkEnrichmentCards fetches /api/enrichments on mount; stub it so the card
// mounts cleanly and we can assert its synchronous structure (the leaf
// SectionCards arrive later via onResolved and are covered elsewhere).
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

// The aggadata card is now described by AGGADATA_RECIPE and rendered by the
// generic SidebarCardFromHint — these assert it stays equivalent to the old
// bespoke AggadataPanel: accent title, Hebrew twin, theme tag, summary, Q&A.
const renderCard = () =>
  render(() => (
    <SidebarCardFromHint
      recipe={AGGADATA_RECIPE}
      instance={aggadataInstance(story)}
      instanceKey={`Shabbat:125b:0:${story.title}`}
      qaInstanceId={`${story.title}|${story.excerpt}`}
      tractate="Shabbat"
      page="125b"
      specialBlocks={AGGADATA_BLOCKS}
    />
  ));

describe('aggadata card (recipe-driven)', () => {
  it('renders the accent title, Hebrew twin subtitle, theme tag, summary, and QA affordance', () => {
    const { container } = renderCard();

    const h3 = container.querySelector('h3')!;
    expect(h3.textContent).toBe("Rabbi's stone pile");
    expect(h3.getAttribute('dir')).toBeNull(); // English title is LTR primary

    const subtitle = container.querySelector('p[dir="rtl"]')!;
    expect(subtitle.getAttribute('lang')).toBe('he');
    expect(subtitle.textContent).toContain('מעשה רבי בנידבך');

    expect(container.textContent).toContain('designation'); // theme tag
    expect(container.textContent).toContain('A short summary of the story.'); // prose

    // QA toggle renders synchronously (its lists are lazy on expand).
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.some((b) => b.textContent?.includes(t('qa.questions')))).toBe(true);
  });

  it('does not flip names in Hebrew mode (English title stays primary)', () => {
    setLang('he');
    const { container } = renderCard();
    expect(container.querySelector('h3')!.textContent).toBe("Rabbi's stone pile");
    expect(container.querySelector('h3')!.getAttribute('dir')).toBeNull();
  });
});
