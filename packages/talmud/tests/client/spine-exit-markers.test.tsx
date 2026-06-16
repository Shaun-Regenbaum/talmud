// @vitest-environment jsdom
//
// Cross-text "exit markers" on the spine flow graph: a section with parallels
// elsewhere in Shas / the Yerushalmi shows a small ⤳N badge (collapsed default);
// clicking it expands a chip per parallel. Verifies the badge renders, chips are
// hidden until expansion, and a click reveals them (incl. the corpus badge).
import { fireEvent, render } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { setLang } from '../../src/client/i18n';
import SpineFlowGraph, { type SpineViewDaf } from '../../src/client/SpineFlowGraph';

function texts(container: HTMLElement, needle: string): SVGTextElement[] {
  return Array.from(container.querySelectorAll('text')).filter((t) =>
    (t.textContent ?? '').includes(needle),
  ) as unknown as SVGTextElement[];
}

const dapim: SpineViewDaf[] = [
  {
    page: '2a',
    nextPage: '2b',
    sections: [
      {
        index: 0,
        title: 'Evening Shema',
        rabbis: [],
        exits: [
          {
            ref: 'Shabbat 31a',
            relation: 'parallels',
            corpus: 'bavli',
            tractate: 'Shabbat',
            page: '31a',
          },
          {
            ref: 'Jerusalem Talmud Berakhot 1:1',
            relation: 'parallels',
            corpus: 'yeru',
            tractate: 'Jerusalem Talmud Berakhot',
            page: '1:1',
          },
        ],
      },
      { index: 1, title: 'Gemara source', rabbis: [], exits: [] },
    ],
    flow: [],
    cross: [],
  },
];

describe('SpineFlowGraph — cross-text exit markers', () => {
  it('shows a ⤳N badge for a section with parallels, collapsed by default', () => {
    const { container } = render(() => <SpineFlowGraph dapim={dapim} />);
    // badge present with the count
    expect(texts(container, '⤳').some((t) => (t.textContent ?? '').includes('2'))).toBe(true);
    // chips are hidden until expanded
    expect(texts(container, 'Shabbat 31a')).toHaveLength(0);
    expect(texts(container, 'Jerusalem Talmud Berakhot 1:1')).toHaveLength(0);
  });

  it('expands the chips (with corpus badges) when the badge is clicked', () => {
    const { container } = render(() => <SpineFlowGraph dapim={dapim} />);
    const badge = texts(container, '⤳')
      .find((t) => (t.textContent ?? '').includes('2'))
      ?.closest('[role="button"]');
    expect(badge).toBeTruthy();
    fireEvent.click(badge as Element);
    // both parallel chips now render, with their corpus tags
    expect(texts(container, 'Shabbat 31a').length).toBeGreaterThan(0);
    expect(texts(container, 'Jerusalem Talmud Berakhot 1:1').length).toBeGreaterThan(0);
    expect(texts(container, 'Bavli').length).toBeGreaterThan(0);
    expect(texts(container, 'ירושלמי').length).toBeGreaterThan(0);
    // a Bavli chip is navigable (opens in our reader); the Yerushalmi chip is
    // informative only — no in-app reader, so not a button.
    const bavliChip = texts(container, 'Shabbat 31a')[0]?.closest('g');
    const yeruChip = texts(container, 'Jerusalem Talmud Berakhot 1:1')[0]?.closest('g');
    expect(bavliChip?.getAttribute('role')).toBe('button');
    expect(yeruChip?.getAttribute('role')).toBeNull();
  });

  it('renders no badge for a section without parallels', () => {
    const noExits: SpineViewDaf[] = [
      {
        page: '5a',
        nextPage: null,
        sections: [{ index: 0, title: 'Lone section', rabbis: [], exits: [] }],
        flow: [],
        cross: [],
      },
    ];
    const { container } = render(() => <SpineFlowGraph dapim={noExits} />);
    expect(texts(container, '⤳')).toHaveLength(0);
  });

  it('shows a ⤳? marker on a daf whose parallels are not computed yet', () => {
    const cold: SpineViewDaf[] = [
      {
        page: '7a',
        nextPage: '7b',
        parallelsComputed: false,
        sections: [{ index: 0, title: 'X', rabbis: [], exits: [] }],
        flow: [],
        cross: [],
      },
    ];
    const { container } = render(() => <SpineFlowGraph dapim={cold} />);
    expect(texts(container, '⤳?').length).toBeGreaterThan(0);
  });

  it('shows no ⤳? marker once the daf is computed (even with zero parallels)', () => {
    const warm: SpineViewDaf[] = [
      {
        page: '7a',
        nextPage: '7b',
        parallelsComputed: true,
        sections: [{ index: 0, title: 'X', rabbis: [], exits: [] }],
        flow: [],
        cross: [],
      },
    ];
    const { container } = render(() => <SpineFlowGraph dapim={warm} />);
    expect(texts(container, '⤳?')).toHaveLength(0);
  });
});

// In Hebrew mode the daf labels, corpus tags, and exit refs read in Hebrew
// rather than leaking the English slug ("2a", "Bavli", "Shabbat 31a").
describe('SpineFlowGraph — Hebrew mode localization', () => {
  afterEach(() => setLang('en'));

  it('renders the daf label, corpus tag, and Bavli exit ref in Hebrew', () => {
    setLang('he');
    const { container } = render(() => <SpineFlowGraph dapim={dapim} />);
    // daf page label: '2a' -> 'ב.'
    expect(texts(container, 'ב.').length).toBeGreaterThan(0);
    expect(texts(container, '2a')).toHaveLength(0);
    // expand the parallels to reveal the chips
    const badge = texts(container, '⤳')
      .find((t) => (t.textContent ?? '').includes('2'))
      ?.closest('[role="button"]');
    fireEvent.click(badge as Element);
    // Bavli corpus tag localized; the English 'Bavli' gone
    expect(texts(container, 'בבלי').length).toBeGreaterThan(0);
    expect(texts(container, 'Bavli')).toHaveLength(0);
    // Bavli exit ref as the Hebrew daf form ('Shabbat 31a' -> 'שבת לא.')
    expect(texts(container, 'שבת לא.').length).toBeGreaterThan(0);
    expect(texts(container, 'Shabbat 31a')).toHaveLength(0);
  });
});
