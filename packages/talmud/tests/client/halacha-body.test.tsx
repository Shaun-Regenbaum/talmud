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

  it('declares synthesis + codes, dispute, practical; no qa', () => {
    const blocks = HALACHA_RECIPE.sections.flatMap((s) => (s.type === 'special' ? [s.block] : []));
    expect(blocks).toEqual(['halacha-codification', 'halacha-dispute', 'halacha-practical']);
    expect(HALACHA_RECIPE.sections[0].type).toBe('synthesis');
    expect(HALACHA_RECIPE.sections.some((s) => s.type === 'qa')).toBe(false);
    // Every declared block is registered.
    for (const b of blocks) expect(HALACHA_BLOCKS[b]).toBeTypeOf('function');
  });

  it("sends the topic's real daf lines", () => {
    expect(halachaInstance({ ...topic, startSegIdx: 4, endSegIdx: 6 })).toMatchObject({
      startSegIdx: 4,
      endSegIdx: 6,
    });
  });
});

describe('Halacha codes list', () => {
  const codes = [
    {
      id: 'mishneh-torah',
      label: 'Mishneh Torah',
      short: 'Rambam',
      order: 1,
      refs: [
        {
          ref: 'Mishneh Torah, Reading the Shema 1:9',
          match: 'on-lines',
          einMishpat: true,
          hebrew: 'איזה הוא זמן קריאת שמע בלילה',
          english: 'When is the time for Shema at night?',
        },
      ],
    },
    {
      id: 'shulchan-aruch',
      label: 'Shulchan Aruch',
      short: 'Mechaber',
      order: 3,
      refs: [
        {
          ref: 'Shulchan Arukh, Orach Chayim 235:3',
          match: 'near',
          einMishpat: true,
          hebrew: 'לכתחלה צריך לקרות ק"ש מיד בצאת הככבים',
          english: '',
          rema: ['ומיהו לא יחזור ויתפלל'],
        },
      ],
    },
  ];
  const urls: string[] = [];
  beforeEach(() => {
    urls.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (u: string) => {
        urls.push(String(u));
        return { ok: true, json: async () => ({ codes }) } as unknown as Response;
      }),
    );
  });

  const renderCodes = (codification: unknown) =>
    render(() =>
      HALACHA_BLOCKS['halacha-codification']({
        deps: { 'halacha.codification': codification },
        anchors: {},
        synthesisResolved: true,
        instance: halachaInstance({ ...topic, startSegIdx: 0, endSegIdx: 3 }),
        tractate: 'Berakhot',
        page: '2a',
        instanceKey: 'k',
      }),
    );

  it("fetches the codes for the topic's lines and shows their real text", async () => {
    const { findByText, getByText } = renderCodes(undefined);
    await findByText('Mishneh Torah, Reading the Shema 1:9');
    expect(urls[0]).toBe('/api/halacha-text/Berakhot/2a?start=0&end=3');
    expect(getByText('איזה הוא זמן קריאת שמע בלילה')).toBeTruthy();
    expect(getByText('ומיהו לא יחזור ויתפלל')).toBeTruthy();
    expect(getByText(t('halacha.codes.near'))).toBeTruthy();
  });

  it('attaches an AI summary only to the row whose ref it names', async () => {
    const { findByText, queryByText } = renderCodes({
      mishnehTorah: { ref: 'Mishneh Torah, Reading the Shema 1:9', ruling: 'From nightfall.' },
      tur: null,
      // Cites a seif Sefaria does not link to these lines: never shown.
      shulchanAruch: { ref: 'Orach Chayim 235:1', ruling: 'Wrong seif summary.' },
      rema: null,
      prose: '',
    });
    await findByText('From nightfall.');
    expect(queryByText('Wrong seif summary.')).toBeNull();
  });

  it('says so when nothing is linked to the lines', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ codes: [] }) }) as unknown as Response),
    );
    const { findByText } = renderCodes(undefined);
    await findByText(t('halacha.codes.none'));
  });
});
