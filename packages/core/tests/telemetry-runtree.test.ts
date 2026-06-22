import { describe, expect, it } from 'vitest';
import { buildRunTree, isExpandable, type ProducerDef } from '../src/telemetry/runtree.ts';

// A talmud-shaped registry: synthesis composes other PRODUCERS (a real DAG).
const TALMUD: ProducerDef[] = [
  {
    id: 'rabbi.synthesis',
    label: 'Rabbi synthesis',
    producerKind: 'enrichment',
    dependencies: ['gemara', { mark: 'rabbi' }, { enrichment: 'rabbi.bio' }],
  },
  { id: 'rabbi', label: 'Rabbis', producerKind: 'mark', dependencies: ['gemara'] },
  { id: 'rabbi.bio', label: 'Bio', producerKind: 'enrichment', dependencies: ['gemara'] },
];

// A tanach-shaped registry: producers depend ONLY on sources, never each other.
const TANACH: ProducerDef[] = [
  { id: 'tidbit', label: 'Tidbit', producerKind: 'enrichment', dependencies: ['chapter-verses'] },
  {
    id: 'synthesis',
    label: 'Synthesis',
    producerKind: 'enrichment',
    dependencies: ['verse-text', 'commentaries'],
  },
];

const meta = { tractate: 'Berakhot', page: '2', lang: 'en' };

describe('buildRunTree — DERIVED from the registry + telemetry', () => {
  it('walks the dependency subgraph and attaches telemetry', () => {
    const tree = buildRunTree(
      TALMUD,
      {
        'rabbi.synthesis': { cached: true, cold_ms: 5000, cost: 0.015, model: 'deepseek' },
        rabbi: { cached: true, cold_ms: 45000, cost: 0.08 },
        'rabbi.bio': { cached: false },
      },
      'rabbi.synthesis',
      meta,
    );
    expect(tree.root).toBe('rabbi.synthesis');
    expect(new Set(Object.keys(tree.nodes))).toEqual(
      new Set(['rabbi.synthesis', 'gemara', 'rabbi', 'rabbi.bio']),
    );
    // gemara is a SOURCE leaf (not a registry producer) — derived, not declared
    expect(tree.nodes.gemara.kind).toBe('source');
    expect(tree.nodes['rabbi.synthesis'].kind).toBe('llm');
    expect(tree.nodes['rabbi.synthesis'].producer).toBe('enrichment');
    expect(tree.nodes.rabbi.producer).toBe('mark');
    // telemetry draped on
    expect(tree.nodes['rabbi.synthesis'].cost).toBe(0.015);
    expect(tree.nodes['rabbi.bio'].cached).toBe(false);
    // edges include the fan-in to the shared source
    expect(tree.edges).toContainEqual(['rabbi.synthesis', 'rabbi']);
    expect(tree.edges).toContainEqual(['rabbi', 'gemara']);
    // totals are DERIVED (3 producers + 1 source; 2 cached; cost summed)
    expect(tree.totals).toMatchObject({ count: 4, llm: 3, source: 1, cached: 2 });
    expect(tree.totals.cost).toBeCloseTo(0.095, 6);
    expect(tree.totals.cold_ms).toBe(50000);
  });

  it('a tanach producer is just itself + its source leaves', () => {
    const tree = buildRunTree(TANACH, { synthesis: { cached: true, cost: 0.0003 } }, 'synthesis', {
      tractate: 'Genesis',
      page: '22',
      lang: 'en',
    });
    expect(new Set(Object.keys(tree.nodes))).toEqual(
      new Set(['synthesis', 'verse-text', 'commentaries']),
    );
    expect(tree.nodes['verse-text'].kind).toBe('source');
    expect(tree.totals).toMatchObject({ count: 3, llm: 1, source: 2 });
  });
});

describe('isExpandable — DERIVED, flips with the registry (not a per-app flag)', () => {
  it('true when the root composes other producers (talmud)', () => {
    expect(isExpandable(TALMUD, 'rabbi.synthesis')).toBe(true);
    expect(isExpandable(TALMUD, 'rabbi')).toBe(false); // only depends on a source
  });

  it('false when the root depends only on sources (tanach today)', () => {
    expect(isExpandable(TANACH, 'tidbit')).toBe(false);
    expect(isExpandable(TANACH, 'synthesis')).toBe(false);
  });

  it('flips to true the moment a tanach producer starts composing another', () => {
    const composed: ProducerDef[] = [
      { id: 'overview', producerKind: 'enrichment', dependencies: ['chapter-verses'] },
      {
        id: 'tidbit',
        producerKind: 'enrichment',
        // now built on the overview producer, not just a source
        dependencies: ['chapter-verses', { enrichment: 'overview' }],
      },
    ];
    expect(isExpandable(composed, 'tidbit')).toBe(true);
  });
});
