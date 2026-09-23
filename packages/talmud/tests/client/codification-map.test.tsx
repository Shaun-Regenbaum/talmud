// @vitest-environment jsdom
import { render } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import CodificationMap, {
  type CodeMapEdge,
  type CodeMapNode,
} from '../../src/client/CodificationMap';

// Kitniyot lineage (the v6 mockup shape): gemara source + two disputing codifiers.
const nodes: CodeMapNode[] = [
  {
    id: 'gem',
    label: 'Gemara',
    ref: 'Pesachim 35a',
    era: 'source',
    side: 'source',
    ruling: "Kitniyot isn't one of the five grains.",
  },
  {
    id: 'mech',
    label: 'Mechaber',
    ref: 'SA, OC 453:1',
    side: 'a',
    ruling: 'Permits.',
    practice: { en: 'eats kitniyot', he: 'ספרד', tone: 'sef' },
  },
  {
    id: 'rema',
    label: 'Rema',
    ref: 'gloss',
    side: 'b',
    ruling: 'Prohibits.',
    practice: { en: 'avoids kitniyot', he: 'אשכנז', tone: 'ashk' },
  },
];
const edges: CodeMapEdge[] = [
  { from: 'gem', to: 'mech', kind: 'cites' },
  { from: 'mech', to: 'rema', kind: 'disagrees' },
];

describe('CodificationMap', () => {
  it('renders one positioned card per node, carrying ref + ruling + practice', () => {
    const { container, getByText } = render(() => <CodificationMap nodes={nodes} edges={edges} />);
    const cards = container.querySelectorAll('[data-graph-node]');
    expect(cards).toHaveLength(3);
    expect(Array.from(cards).map((c) => c.getAttribute('data-graph-node'))).toEqual([
      'gem',
      'mech',
      'rema',
    ]);
    expect(Array.from(cards).map((c) => c.querySelector('.ui-graph-badge')?.textContent)).toEqual([
      undefined,
      'A',
      'B',
    ]);
    getByText("Kitniyot isn't one of the five grains.");
    getByText('Permits.');
    getByText('Prohibits.');
    getByText('SA, OC 453:1', { exact: false, selector: '.ui-graph-label' });
    getByText('eats kitniyot', { exact: false });
    getByText('avoids kitniyot', { exact: false });
  });

  it('builds the legend from the edge kinds plus the transmits spine', () => {
    const { getByText } = render(() => <CodificationMap nodes={nodes} edges={edges} />);
    getByText('passes on');
    getByText('cites', { selector: 'span' });
    getByText('disagrees', { selector: 'span' });
  });

  it('renders without edges (the agree case) and still draws cards', () => {
    const agree: CodeMapNode[] = [
      { id: 'g', label: 'Gemara', ref: 'Berakhot 2a', side: 'source' },
      { id: 'ram', label: 'Rambam', ref: 'Krias Shema 1:9', side: 'neutral' },
      {
        id: 'sa',
        label: 'Shulchan Aruch',
        ref: 'OC 235:3',
        side: 'neutral',
        practice: { en: 'accepted by all', tone: 'both' },
      },
    ];
    const { container } = render(() => <CodificationMap nodes={agree} />);
    expect(container.querySelectorAll('[data-graph-node]')).toHaveLength(3);
  });
});
