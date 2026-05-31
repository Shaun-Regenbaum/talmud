import { describe, it, expect } from 'vitest';
import { dafLinks } from '../src/lib/context/dafLinks';
import { dafCoord, coordForSeg } from '../src/lib/context/coord';
import type { ContextItem } from '../src/lib/context/types';

const DAF = { tractate: 'Shabbat', page: '125b' };
const item = (over: Partial<ContextItem>): ContextItem => ({
  source: 'dafyomi:revach', sourceLabel: "Revach l'Daf", kind: 'revach', key: 'k', segs: [], ...over,
});

describe('dafLinks — the unified link layer of a daf', () => {
  it('is empty when there is nothing to link', () => {
    expect(dafLinks(DAF, { continuesTo: null, items: [], flowEdges: [], sectionStartSegs: [] })).toEqual([]);
  });

  it('emits a bridge link (continues) sourced at the whole daf', () => {
    const out = dafLinks(DAF, { continuesTo: { tractate: 'Shabbat', page: '126a' }, items: [], flowEdges: [], sectionStartSegs: [] });
    expect(out).toEqual([
      { via: 'bridge', source: dafCoord(DAF), relation: 'continues', targets: [dafCoord({ tractate: 'Shabbat', page: '126a' })] },
    ]);
  });

  it('emits a cites link per context item with refs, sourced at its first seg (else whole-daf)', () => {
    const placed = item({ key: 'a', segs: [7, 3], refs: [dafCoord({ tractate: 'Pesachim', page: '50a' })] });
    const unplaced = item({ key: 'b', segs: [], refs: [dafCoord({ tractate: 'Gittin', page: '6a' })] });
    const noRefs = item({ key: 'c', segs: [2] });
    const out = dafLinks(DAF, { continuesTo: null, items: [placed, unplaced, noRefs], flowEdges: [], sectionStartSegs: [] });
    expect(out).toEqual([
      { via: 'context', source: coordForSeg(DAF, 7), relation: 'cites', targets: [dafCoord({ tractate: 'Pesachim', page: '50a' })], note: "Revach l'Daf" },
      { via: 'context', source: dafCoord(DAF), relation: 'cites', targets: [dafCoord({ tractate: 'Gittin', page: '6a' })], note: "Revach l'Daf" },
    ]);
  });

  it('emits flow links by resolving section indices through sectionStartSegs', () => {
    // sections 0,1,2 start at segs 0, 5, 9. Edge 0->2 (depends-on), 1->2 (resolves).
    const out = dafLinks(DAF, {
      continuesTo: null, items: [],
      flowEdges: [{ from: 0, to: 2, kind: 'depends-on' }, { from: 1, to: 2, kind: 'resolves' }],
      sectionStartSegs: [0, 5, 9],
    });
    expect(out).toEqual([
      { via: 'flow', source: coordForSeg(DAF, 0), relation: 'depends-on', targets: [coordForSeg(DAF, 9)] },
      { via: 'flow', source: coordForSeg(DAF, 5), relation: 'resolves', targets: [coordForSeg(DAF, 9)] },
    ]);
  });

  it('combines all three sources in order: bridge, then cites, then flow', () => {
    const out = dafLinks(DAF, {
      continuesTo: { tractate: 'Shabbat', page: '126a' },
      items: [item({ segs: [4], refs: [dafCoord({ tractate: 'Pesachim', page: '50a' })] })],
      flowEdges: [{ from: 0, to: 1, kind: 'continues' }],
      sectionStartSegs: [4, 8],
    });
    expect(out.map((l) => l.via)).toEqual(['bridge', 'context', 'flow']);
  });
});
