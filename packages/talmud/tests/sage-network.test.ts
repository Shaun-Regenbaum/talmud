import { describe, expect, it } from 'vitest';
import { buildSageNetwork, type NetworkInput } from '../src/lib/sage-graph/network';

const base = (over: Partial<NetworkInput> = {}): NetworkInput => ({
  revision: 'r1',
  hierarchy: {
    rava: {
      canonical: 'Rava',
      canonicalHe: 'רבא',
      generation: 'amora-bavel-4',
      students: ['rav-pappa'],
    },
    'rav-pappa': {
      canonical: 'Rav Pappa',
      generation: 'amora-bavel-5',
      teachers: ['rava', 'abaye'],
    },
    abaye: { canonical: 'Abaye', generation: 'amora-bavel-4', colleagues: ['rava'] },
    nobody: { canonical: 'Nobody', generation: 'unknown' },
  },
  voice: null,
  checkedNodes: [],
  checkedEdges: [],
  ...over,
});

describe('buildSageNetwork', () => {
  it('reads teachers and students once, however they are listed', () => {
    const out = buildSageNetwork(base());
    const teacher = out.edges.filter((e) => e[3] === 'teacher');
    // rava -> rav-pappa is listed from both sides, abaye -> rav-pappa from one.
    expect(teacher).toHaveLength(2);
    expect(out.stats.edgesByLayer.curated).toBe(3);
  });

  it('stores a colleague pair once whichever way it was read', () => {
    const out = buildSageNetwork(
      base({
        hierarchy: {
          a: { canonical: 'A', colleagues: ['b'] },
          b: { canonical: 'B', colleagues: ['a'] },
        },
      }),
    );
    expect(out.edges.filter((e) => e[3] === 'colleague')).toHaveLength(1);
  });

  it('draws only people who have a link, and counts the rest', () => {
    const out = buildSageNetwork(base());
    expect(out.nodes.map((n) => n.id).sort()).toEqual(['abaye', 'rav-pappa', 'rava']);
    expect(out.stats.registryPeople).toBe(4);
    expect(out.stats.registryNoEra).toBe(1);
  });

  it('adds learned links, and takes an era the registry lacked from them', () => {
    const out = buildSageNetwork(
      base({
        hierarchy: { a: { canonical: 'A', generation: 'unknown' }, b: { canonical: 'B' } },
        voice: {
          builtAt: 5,
          nodes: { a: { name: 'A', generation: 'tanna-2' } },
          edges: { x: { from: 'a', to: 'b', kind: 'opposes', weight: 4 } },
        },
      }),
    );
    expect(out.stats.edgesByLayer.learned).toBe(1);
    expect(out.edges[0][4]).toBe(4);
    expect(out.nodes.find((n) => n.id === 'a')?.generation).toBe('tanna-2');
    expect(out.voiceBuiltAt).toBe(5);
  });

  it('keeps the same pair in two layers, and tells which layers touch a person', () => {
    const out = buildSageNetwork(
      base({
        hierarchy: { a: { canonical: 'A', students: ['b'] }, b: { canonical: 'B' } },
        voice: { builtAt: 1, nodes: {}, edges: { x: { from: 'a', to: 'b', kind: 'cites' } } },
        checkedNodes: [],
        checkedEdges: [{ a: 'a', b: 'b', mode: 'reported_exchange' }],
      }),
    );
    expect(out.edges.map((e) => e[2]).sort()).toEqual(['checked', 'curated', 'learned']);
    expect(out.nodes[0].layers.sort()).toEqual(['checked', 'curated', 'learned']);
  });

  it('leaves out checked names not matched to a person, and says how many', () => {
    const out = buildSageNetwork(
      base({
        checkedNodes: [
          { id: 'local:p/A', label: 'A', labelHe: null, generation: null },
          { id: 'local:p/B', label: 'B', labelHe: null, generation: null },
        ],
        checkedEdges: [{ a: 'local:p/A', b: 'rava', mode: 'stated' }],
      }),
    );
    expect(out.stats.checkedUnplaced).toBe(2);
    expect(out.stats.edgesByLayer.checked).toBe(0);
  });

  it('adds a checked person the registry never had', () => {
    const out = buildSageNetwork(
      base({
        checkedNodes: [
          { id: 'new-sage', label: 'New Sage', labelHe: 'חדש', generation: 'tanna-3' },
        ],
        checkedEdges: [{ a: 'new-sage', b: 'rava', mode: 'stated' }],
      }),
    );
    expect(out.nodes.find((n) => n.id === 'new-sage')?.generation).toBe('tanna-3');
    expect(out.stats.edgesByLayer.checked).toBe(1);
  });

  it('drops a link to someone not in the registry and counts it', () => {
    const out = buildSageNetwork(
      base({
        hierarchy: { a: { canonical: 'A', students: ['ghost', 'b'] }, b: { canonical: 'B' } },
      }),
    );
    expect(out.stats.dropped).toBe(1);
    expect(out.edges).toHaveLength(1);
  });

  it('gives the same answer every time', () => {
    expect(buildSageNetwork(base())).toEqual(buildSageNetwork(base()));
  });
});
