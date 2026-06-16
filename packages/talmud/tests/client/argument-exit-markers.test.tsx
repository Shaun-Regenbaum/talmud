// @vitest-environment jsdom
//
// ArgumentFlowGraph exit markers: a section node carrying off-node connections
// (the spine's links projected onto it) shows a collapsed ⤳N badge that expands
// to a chip per connection. The chips read their label/navigation from the
// shared linkTarget resolver.
import { fireEvent, render } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ArgumentFlowGraph from '../../src/client/ArgumentFlowGraph';
import { setLang } from '../../src/client/i18n';
import type { SectionExit } from '../../src/lib/context/sectionExits';

beforeEach(() => setLang('en'));
afterEach(() => setLang('en'));

const exits: SectionExit[] = [
  {
    family: 'scripture',
    relation: 'cites',
    via: 'pesuk',
    target: { spine: 'tanach', tractate: 'Genesis', page: '19', seg: 5 },
  },
  {
    family: 'parallel',
    relation: 'parallels',
    via: 'mesorah',
    target: { tractate: 'Shabbat', page: '31a', seg: 3 },
  },
];

function texts(container: HTMLElement, needle: string): SVGTextElement[] {
  return Array.from(container.querySelectorAll('text')).filter((t) =>
    (t.textContent ?? '').includes(needle),
  ) as unknown as SVGTextElement[];
}

const props = {
  nodes: [{ index: 0, title: 'The Gemara cites a verse', exits }],
  connections: [],
  activeIndex: null,
  onSelect: () => {},
};

describe('ArgumentFlowGraph — exit markers', () => {
  it('shows a collapsed ⤳N badge with no chips until clicked', () => {
    const { container } = render(() => <ArgumentFlowGraph {...props} />);
    expect(texts(container, '⤳ 2')).toHaveLength(1);
    expect(texts(container, 'Genesis 19:5')).toHaveLength(0);
  });

  it('expands the chip band on badge click', () => {
    const { container } = render(() => <ArgumentFlowGraph {...props} />);
    const badge = texts(container, '⤳ 2')[0].closest('g');
    expect(badge).toBeTruthy();
    fireEvent.click(badge as Element);
    expect(texts(container, 'Genesis 19:5').length).toBeGreaterThan(0);
    expect(texts(container, 'Shabbat 31a:3').length).toBeGreaterThan(0);
  });

  it('renders no badge when a node has no exits', () => {
    const { container } = render(() => (
      <ArgumentFlowGraph {...props} nodes={[{ index: 0, title: 'plain section' }]} />
    ));
    expect(texts(container, '⤳')).toHaveLength(0);
  });

  it('calls onPickExit when a chip is clicked', () => {
    let picked: SectionExit | null = null;
    const { container } = render(() => (
      <ArgumentFlowGraph
        {...props}
        onPickExit={(ex) => {
          picked = ex;
        }}
      />
    ));
    fireEvent.click(texts(container, '⤳ 2')[0].closest('g') as Element);
    const chip = texts(container, 'Genesis 19:5')[0].closest('g');
    fireEvent.click(chip as Element);
    expect(picked).not.toBeNull();
    expect((picked as SectionExit | null)?.family).toBe('scripture');
  });
});
