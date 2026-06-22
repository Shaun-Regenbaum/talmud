import { describe, expect, it } from 'vitest';
import {
  ancestorsOf,
  assignLayers,
  buildGraph,
  connectedClosure,
  depRef,
  descendantsOf,
  parseDeps,
  type RawEnrichment,
  type RawMark,
} from '../src/client/howItWorks/graphModel';

// A small registry that exercises every edge kind:
//  - a mark on raw text (rabbi, argument)
//  - a mark built on another mark (argument-move)
//  - a global enrichment with no declared deps (rabbi.bio — target edge only)
//  - an enrichment on an enrichment (rabbi.synthesis, argument.synthesis)
//  - an enrichment on a mark (argument.voices)
const MARKS: RawMark[] = [
  { id: 'rabbi', label: 'Rabbi', dependencies: ['gemara'] },
  { id: 'argument', label: 'Argument', dependencies: ['gemara'] },
  { id: 'argument-move', label: 'Move', dependencies: ['gemara', { mark: 'argument' }] },
];
const ENRICHMENTS: RawEnrichment[] = [
  { id: 'rabbi.bio', mark: 'rabbi', mode: 'augment-content', scope: 'global' },
  {
    id: 'rabbi.synthesis',
    mark: 'rabbi',
    mode: 'aggregate',
    scope: 'local',
    dependencies: ['gemara', { enrichment: 'rabbi.bio' }, { mark: 'rabbi' }],
  },
  {
    id: 'argument.voices',
    mark: 'argument',
    mode: 'augment-content',
    scope: 'local',
    dependencies: [{ mark: 'argument-move' }],
  },
  {
    id: 'argument.synthesis',
    mark: 'argument',
    mode: 'aggregate',
    scope: 'local',
    dependencies: [{ enrichment: 'argument.voices' }],
  },
];

const built = () => assignLayers(buildGraph(MARKS, ENRICHMENTS));

describe('depRef / parseDeps', () => {
  it('classifies each dependency shape', () => {
    expect(depRef('gemara')).toEqual({ id: 'gemara', kind: 'source' });
    expect(depRef({ mark: 'rabbi' })).toEqual({ id: 'rabbi', kind: 'mark' });
    expect(depRef({ enrichment: 'rabbi.bio' })).toEqual({ id: 'rabbi.bio', kind: 'enrichment' });
    expect(depRef({} as never)).toBeNull();
    expect(depRef('')).toBeNull();
  });
  it('drops unrecognized entries', () => {
    expect(parseDeps(['gemara', {} as never, { mark: 'x' }])).toEqual([
      { id: 'gemara', kind: 'source' },
      { id: 'x', kind: 'mark' },
    ]);
    expect(parseDeps(undefined)).toEqual([]);
  });
});

describe('buildGraph', () => {
  it('synthesizes a source node for string deps and keeps producer nodes', () => {
    const g = built();
    expect(g.byId.get('gemara')?.kind).toBe('source');
    expect(g.byId.get('rabbi')?.kind).toBe('mark');
    expect(g.byId.get('rabbi.bio')?.kind).toBe('enrichment');
    // enrichment family is its target mark
    expect(g.byId.get('argument.voices')?.family).toBe('argument');
  });

  it('wires declared deps and a soft edge to each enrichment target mark', () => {
    const g = built();
    const has = (from: string, to: string) => g.edges.some((e) => e.from === from && e.to === to);
    expect(has('gemara', 'rabbi')).toBe(true);
    expect(has('argument', 'argument-move')).toBe(true);
    expect(has('rabbi.bio', 'rabbi.synthesis')).toBe(true);
    // rabbi.bio declares no deps, so the only edge into it is the target-mark edge
    const intoBio = g.edges.filter((e) => e.to === 'rabbi.bio');
    expect(intoBio).toHaveLength(1);
    expect(intoBio[0]).toMatchObject({ from: 'rabbi', target: true });
  });

  it('does not double-count a target edge already declared as a dep', () => {
    const g = built();
    const rabbiToSynthesis = g.edges.filter(
      (e) => e.from === 'rabbi' && e.to === 'rabbi.synthesis',
    );
    expect(rabbiToSynthesis).toHaveLength(1);
    // declared {mark:'rabbi'} wins, so it is NOT flagged as a soft target edge
    expect(rabbiToSynthesis[0].target).toBe(false);
  });
});

describe('assignLayers — longest-path depth', () => {
  it('places every node one column past its deepest input', () => {
    const g = built();
    const layer = (id: string) => g.byId.get(id)?.layer;
    expect(layer('gemara')).toBe(0);
    expect(layer('rabbi')).toBe(1);
    expect(layer('argument')).toBe(1);
    expect(layer('argument-move')).toBe(2);
    expect(layer('rabbi.bio')).toBe(2);
    expect(layer('rabbi.synthesis')).toBe(3);
    expect(layer('argument.voices')).toBe(3);
    expect(layer('argument.synthesis')).toBe(4);
  });

  it('guarantees every edge runs strictly left to right', () => {
    const g = built();
    for (const e of g.edges) {
      const from = g.byId.get(e.from)?.layer ?? 0;
      const to = g.byId.get(e.to)?.layer ?? 0;
      expect(to).toBeGreaterThan(from);
    }
  });
});

describe('closures', () => {
  it('ancestorsOf returns the full upstream chain', () => {
    const g = built();
    expect(ancestorsOf(g, 'rabbi.synthesis')).toEqual(new Set(['gemara', 'rabbi', 'rabbi.bio']));
  });
  it('descendantsOf returns everything downstream', () => {
    const g = built();
    const d = descendantsOf(g, 'gemara');
    expect(d.size).toBe(7);
    expect(d.has('argument.synthesis')).toBe(true);
  });
  it('connectedClosure includes the node itself plus both directions', () => {
    const g = built();
    const c = connectedClosure(g, 'rabbi.bio');
    expect(c.has('rabbi.bio')).toBe(true);
    expect(c.has('rabbi')).toBe(true); // ancestor
    expect(c.has('rabbi.synthesis')).toBe(true); // descendant
  });
});
