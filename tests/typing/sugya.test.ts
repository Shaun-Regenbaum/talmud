/**
 * Sugya stitching (src/lib/typing/sugya.ts): group argument sections into
 * connected discussion units across daf boundaries, over the binding flow edges.
 */
import { describe, it, expect } from 'vitest';
import { stitchSugyot, SUGYA_BINDING_KINDS, type SugyaFlowEdge } from '../../src/lib/typing/sugya';
import { coordForSeg } from '../../src/lib/context/coord';

const S125 = { tractate: 'Shabbat', page: '125b' };
const S126 = { tractate: 'Shabbat', page: '126a' };

describe('stitchSugyot', () => {
  it('returns no units for no sections', () => {
    expect(stitchSugyot([], [])).toEqual([]);
  });

  it('makes each section its own singleton sugya when there are no edges', () => {
    const units = stitchSugyot([coordForSeg(S125, 0), coordForSeg(S125, 5)], []);
    expect(units).toHaveLength(2);
    expect(units.every((u) => !u.crossesDaf)).toBe(true);
  });

  it('joins sections across a daf boundary on a "continues" edge', () => {
    const a = coordForSeg(S125, 0), b = coordForSeg(S125, 5), c = coordForSeg(S126, 0);
    const units = stitchSugyot([a, b, c], [{ from: b, to: c, kind: 'continues' }]);
    expect(units).toHaveLength(2); // {a} and {b,c}
    const cross = units.find((u) => u.crossesDaf)!;
    expect(cross.span).toEqual([
      { tractate: 'Shabbat', page: '125b', seg: 5 },
      { tractate: 'Shabbat', page: '126a', seg: 0 },
    ]);
    expect(cross.dapim).toEqual([
      { tractate: 'Shabbat', page: '125b', segs: [5] },
      { tractate: 'Shabbat', page: '126a', segs: [0] },
    ]);
  });

  it('merges a transitive chain into one sugya', () => {
    const a = coordForSeg(S125, 0), b = coordForSeg(S125, 3), c = coordForSeg(S126, 0);
    const edges: SugyaFlowEdge[] = [
      { from: a, to: b, kind: 'continues' },
      { from: b, to: c, kind: 'resolves' },
    ];
    const units = stitchSugyot([a, b, c], edges);
    expect(units).toHaveLength(1);
    expect(units[0].span).toHaveLength(3);
    expect(units[0].crossesDaf).toBe(true);
  });

  it('binds on resolves / depends-on but NOT on parallels / contrasts / cites', () => {
    const a = coordForSeg(S125, 0), b = coordForSeg(S125, 5);
    expect(stitchSugyot([a, b], [{ from: a, to: b, kind: 'depends-on' }])).toHaveLength(1);
    expect(stitchSugyot([a, b], [{ from: a, to: b, kind: 'parallels' }])).toHaveLength(2);
    expect(stitchSugyot([a, b], [{ from: a, to: b, kind: 'cites' }])).toHaveLength(2);
    expect(stitchSugyot([a, b], [{ from: a, to: b, kind: 'contrasts' }])).toHaveLength(2);
  });

  it('ignores edges whose endpoints are not in the section set', () => {
    const a = coordForSeg(S125, 0), b = coordForSeg(S125, 5);
    const ghost = coordForSeg(S126, 9);
    const units = stitchSugyot([a, b], [{ from: a, to: ghost, kind: 'continues' }]);
    expect(units).toHaveLength(2); // ghost not a node → no merge
  });

  it('respects a custom binding-kinds set', () => {
    const a = coordForSeg(S125, 0), b = coordForSeg(S125, 5);
    const units = stitchSugyot([a, b], [{ from: a, to: b, kind: 'cites' }], { bindingKinds: new Set(['cites']) });
    expect(units).toHaveLength(1);
  });

  it('default binding kinds are continues/resolves/depends-on', () => {
    expect([...SUGYA_BINDING_KINDS].sort()).toEqual(['continues', 'depends-on', 'resolves']);
  });
});
