// @vitest-environment jsdom
import { render } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HALACHA_BLOCKS, HALACHA_RECIPE, halachaInstance } from '../../src/client/ArgumentSidebar';
import { setLang, t } from '../../src/client/i18n';
import type { HalachaTopic } from '../../src/client/shapes';
import { SidebarCardFromHint } from '../../src/client/sidebar/primitives';

beforeEach(() => {
  setLang('en');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => [] }) as unknown as Response),
  );
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

const renderCard = () =>
  render(() => (
    <SidebarCardFromHint
      recipe={HALACHA_RECIPE}
      instance={halachaInstance(topic)}
      instanceKey={`Shabbat:125b:0:${topic.topic}`}
      tractate="Shabbat"
      page="125b"
      specialBlocks={HALACHA_BLOCKS}
    />
  ));

describe('Halacha recipe card', () => {
  it('renders the accent title, Hebrew twin subtitle, and no QA affordance', () => {
    const { container } = renderCard();
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

  it('declares synthesis + codification (map), practical, derivation; no qa', () => {
    // The standalone disputes block is retired — the Mechaber/Rema split now
    // lives in the codification map (see codeMapFromCodification). Derivation
    // ("where it comes from") reads the codifier refs off halacha.codification.
    const blocks = HALACHA_RECIPE.sections.flatMap((s) => (s.type === 'special' ? [s.block] : []));
    expect(blocks).toEqual([
      'halacha-codification',
      'halacha-dispute',
      'halacha-practical',
      'halacha-derivation',
    ]);
    expect(HALACHA_RECIPE.sections[0].type).toBe('synthesis');
    expect(HALACHA_RECIPE.sections.some((s) => s.type === 'qa')).toBe(false);
    // Every declared block is registered.
    for (const b of blocks) expect(HALACHA_BLOCKS[b]).toBeTypeOf('function');
  });
});
