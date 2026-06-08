import { describe, it, expect } from 'vitest';
import { spineLinks } from '../src/lib/context/spineLinks';
import type { DafLink } from '../src/lib/context/dafLinks';
import { dafCoord, coordForSeg, coordKey } from '@corpus/core/context/coord';

const t = 'berakhot';

// continuity edge: this daf → next daf (whole-daf coords)
function continues(page: string, next: string): DafLink {
  return { via: 'bridge', source: dafCoord({ tractate: t, page }), relation: 'continues', targets: [dafCoord({ tractate: t, page: next })] };
}
// flow edge: section seg a → section seg b on the same daf
function flow(page: string, a: number, b: number, relation: DafLink['relation'] = 'resolves'): DafLink {
  return { via: 'flow', source: coordForSeg({ tractate: t, page }, a), relation, targets: [coordForSeg({ tractate: t, page }, b)] };
}

describe('spineLinks aggregator', () => {
  it('unions per-daf links into one global graph with deduped nodes', () => {
    const g = spineLinks(t, [
      [flow('2a', 0, 3), continues('2a', '2b')],
      [flow('2b', 1, 4)],
    ]);
    // nodes: 2a:0, 2a:3, 2a(daf), 2b(daf), 2b:1, 2b:4 = 6 unique
    expect(g.nodes.length).toBe(6);
    expect(g.edges.length).toBe(3);
    expect(g.byRelation.resolves).toBe(2);
    expect(g.byRelation.continues).toBe(1);
    expect(g.byVia).toEqual({ flow: 2, bridge: 1 });
  });

  it('counts cross-daf edges under byVia.cross-flow', () => {
    const crossEdge: DafLink = { via: 'cross-flow', source: coordForSeg({ tractate: t, page: '4b' }, 3), relation: 'resolves', targets: [coordForSeg({ tractate: t, page: '5a' }, 1)] };
    const g = spineLinks(t, [[crossEdge]]);
    expect(g.byVia['cross-flow']).toBe(1);
    expect(g.edges[0].source).not.toBe(g.edges[0].target); // genuinely cross-daf
  });

  it('node keys are stable global coordinates', () => {
    const g = spineLinks(t, [[flow('5a', 2, 7)]]);
    const keys = g.nodes.map((n) => n.key).sort();
    expect(keys).toContain(coordKey(coordForSeg({ tractate: t, page: '5a' }, 2)));
    expect(keys).toContain(coordKey(coordForSeg({ tractate: t, page: '5a' }, 7)));
  });

  it('collapses continues edges into maximal backbone runs', () => {
    const g = spineLinks(t, [
      [continues('2a', '2b')],
      [continues('2b', '3a')],
      [continues('3a', '3b')],
      [], // 3b: new topic, no continuation
      [continues('4a', '4b')],
    ]);
    const runs = g.continuityRuns.map((r) => r.join('->')).sort();
    expect(runs).toEqual(['2a->2b->3a->3b', '4a->4b']);
  });

  it('backbone uses only bridge continuity, not the flow graph\'s intra-daf "continues"', () => {
    // A flow edge can carry kind 'continues' between two sections of the SAME
    // daf — that must NOT be mistaken for the daf->daf backbone.
    const flowContinues: DafLink = { via: 'flow', source: coordForSeg({ tractate: t, page: '2a' }, 0), relation: 'continues', targets: [coordForSeg({ tractate: t, page: '2a' }, 5)] };
    const g = spineLinks(t, [
      [flowContinues, continues('2a', '2b')],
      [continues('2b', '3a')],
    ]);
    expect(g.byRelation.continues).toBe(3); // 1 flow + 2 bridge, all counted as edges
    // but only the bridge chain forms the backbone:
    expect(g.continuityRuns.map((r) => r.join('->'))).toEqual(['2a->2b->3a']);
  });

  it('is idempotent — re-running over the same parts yields the same graph', () => {
    const parts = [[flow('2a', 0, 3), continues('2a', '2b')], [flow('2b', 1, 4)]];
    const a = spineLinks(t, parts);
    const b = spineLinks(t, parts);
    expect(b.nodes.length).toBe(a.nodes.length);
    expect(b.edges.length).toBe(a.edges.length);
    expect(b.byRelation).toEqual(a.byRelation);
  });

  it('dedupes identical edges contributed twice (safe to re-aggregate)', () => {
    const g = spineLinks(t, [[flow('2a', 0, 3)], [flow('2a', 0, 3)]]);
    expect(g.edges.length).toBe(1);
    expect(g.byRelation.resolves).toBe(1);
  });

  it('empty (cold) dapim contribute nothing', () => {
    const g = spineLinks(t, [[], [], []]);
    expect(g.nodes.length).toBe(0);
    expect(g.edges.length).toBe(0);
    expect(g.continuityRuns).toEqual([]);
  });
});
