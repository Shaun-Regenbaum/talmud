import { describe, it, expect } from 'vitest';
import { buildCrossFlowPrompt, parseCrossFlowEdges, crossFlowToLinks } from '../src/lib/typing/crossFlow';
import { coordForSeg, coordKey } from '@corpus/core/context/coord';

const from = { tractate: 'berakhot', page: '4b' };
const to = { tractate: 'berakhot', page: '5a' };

describe('parseCrossFlowEdges', () => {
  it('keeps valid in-range edges and types them', () => {
    const edges = parseCrossFlowEdges(
      { edges: [{ fromSection: 0, toSection: 1, relation: 'resolves', note: 'n' }] },
      2, 3,
    );
    expect(edges).toEqual([{ fromSection: 0, toSection: 1, relation: 'resolves', note: 'n' }]);
  });

  it('drops edges whose indices fall outside the real section lists (precision)', () => {
    const edges = parseCrossFlowEdges(
      { edges: [
        { fromSection: 5, toSection: 0, relation: 'resolves', note: '' }, // from out of range
        { fromSection: 0, toSection: 9, relation: 'resolves', note: '' }, // to out of range
        { fromSection: -1, toSection: 0, relation: 'resolves', note: '' }, // negative
      ] },
      2, 2,
    );
    expect(edges).toEqual([]);
  });

  it('drops unknown relations and dedupes identical edges', () => {
    const edges = parseCrossFlowEdges(
      { edges: [
        { fromSection: 0, toSection: 0, relation: 'opposes', note: '' }, // not a flow relation
        { fromSection: 1, toSection: 1, relation: 'parallels', note: 'a' },
        { fromSection: 1, toSection: 1, relation: 'parallels', note: 'dup' },
      ] },
      2, 2,
    );
    expect(edges.length).toBe(1);
    expect(edges[0].relation).toBe('parallels');
  });

  it('returns [] for malformed input', () => {
    expect(parseCrossFlowEdges(null, 2, 2)).toEqual([]);
    expect(parseCrossFlowEdges({}, 2, 2)).toEqual([]);
    expect(parseCrossFlowEdges({ edges: 'nope' }, 2, 2)).toEqual([]);
  });
});

describe('crossFlowToLinks', () => {
  it('projects edges onto cross-daf coordinates (source on from-daf, target on to-daf)', () => {
    const links = crossFlowToLinks(
      from, to,
      [{ fromSection: 1, toSection: 0, relation: 'resolves' }],
      [2, 9],   // from-daf section startSegs
      [3, 14],  // to-daf section startSegs
    );
    expect(links.length).toBe(1);
    expect(links[0].via).toBe('cross-flow');
    expect(links[0].relation).toBe('resolves');
    expect(coordKey(links[0].source)).toBe(coordKey(coordForSeg(from, 9)));   // fromSection 1 -> seg 9
    expect(coordKey(links[0].targets[0])).toBe(coordKey(coordForSeg(to, 3))); // toSection 0 -> seg 3
  });

  it('skips edges whose index exceeds the available startSegs', () => {
    const links = crossFlowToLinks(from, to, [{ fromSection: 2, toSection: 0, relation: 'parallels' }], [2, 9], [3]);
    expect(links).toEqual([]);
  });
});

describe('buildCrossFlowPrompt', () => {
  it('lists both dapim\'s sections with indices and the precision instruction', () => {
    const p = buildCrossFlowPrompt(from, to, [{ title: 'A', summary: 'sa' }], [{ title: 'B', summary: 'sb' }]);
    expect(p).toContain('[0] A — sa');
    expect(p).toContain('[0] B — sb');
    expect(p).toContain('PRECISION over recall');
    expect(p).toContain('4b → 5a');
  });
});
