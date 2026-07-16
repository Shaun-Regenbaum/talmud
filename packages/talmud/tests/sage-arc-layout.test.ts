import { describe, expect, it } from 'vitest';
import type { EgoRow } from '../src/client/egoNetwork';
import {
  ARC_MAX_PARTNERS_PER_GEN,
  AUTO_EXPAND_MAX,
  arcPath,
  barSegments,
  genOrder,
  layoutSageArcs,
  shortGenLabel,
} from '../src/client/sageArcLayout';

const row = (
  slug: string,
  generation: string | null,
  weight: number,
  chips: Partial<EgoRow['chips'][number]>[] = [{ kind: 'opposes', direction: 'out' }],
): EgoRow => ({
  other: { slug, name: slug, generation },
  chips: chips.map((c) => ({
    kind: c.kind ?? 'opposes',
    direction: c.direction ?? 'out',
    weight: c.weight ?? weight,
    strict: c.strict ?? 0,
  })),
  totalWeight: weight,
  totalStrict: 0,
  dafs: [],
});

describe('genOrder', () => {
  it('orders chronologically with unknown last', () => {
    expect(genOrder('tanna-2')).toBeLessThan(genOrder('amora-bavel-4'));
    expect(genOrder(null)).toBeGreaterThan(genOrder('achronim'));
    expect(genOrder('nonsense')).toBe(genOrder(null));
  });
});

describe('layoutSageArcs — L1 trunks', () => {
  // 10 partners across two generations => above the auto-expand threshold.
  const many = [
    ...Array.from({ length: 6 }, (_, i) =>
      row(`b${i}`, 'amora-bavel-3', 6, [
        { kind: 'opposes', direction: 'out', weight: 4 },
        { kind: 'cites', direction: 'in', weight: 2 },
      ]),
    ),
    ...Array.from({ length: 4 }, (_, i) => row(`t${i}`, 'tanna-2', 2)),
  ];

  it('collapses generations into pills with ONE total-volume trunk each', () => {
    const l = layoutSageArcs('amora-bavel-4', many, null);
    expect(l.autoExpanded).toBe(false);
    const bavel3 = l.groups.find((g) => g.gen === 'amora-bavel-3');
    expect(bavel3?.pill?.partnerCount).toBe(6);
    expect(bavel3?.dots).toHaveLength(0);
    const trunks = l.edges.filter((e) => e.kind === 'trunk' && e.gen === 'amora-bavel-3');
    expect(trunks).toHaveLength(1); // direction is row detail, not a diagram dimension
    expect(trunks[0].weight).toBe(36); // 6 partners x (4 opposes + 2 cites)
    expect(trunks[0].rel).toBe('opposes'); // the DOMINANT kind colors the trunk
    expect(trunks[0].relWeight).toBe(24);
    const t2 = l.edges.filter((e) => e.kind === 'trunk' && e.gen === 'tanna-2');
    expect(t2).toHaveLength(1);
  });

  it('expanding one generation fans it while others stay trunked', () => {
    const l = layoutSageArcs('amora-bavel-4', many, 'amora-bavel-3');
    const bavel3 = l.groups.find((g) => g.gen === 'amora-bavel-3');
    expect(bavel3?.expanded).toBe(true);
    expect(bavel3?.dots).toHaveLength(6);
    // the trunk splits into CATEGORY lines: 6 partners x 2 relation kinds
    const fans = l.edges.filter((e) => e.kind === 'fan');
    expect(fans).toHaveLength(12);
    expect(new Set(fans.map((f) => f.rel))).toEqual(new Set(['opposes', 'cites']));
    const t2 = l.groups.find((g) => g.gen === 'tanna-2');
    expect(t2?.pill?.partnerCount).toBe(4);
  });

  it('caps the fan inside one generation and reports overflow', () => {
    const big = Array.from({ length: ARC_MAX_PARTNERS_PER_GEN + 5 }, (_, i) =>
      row(`x${i}`, 'amora-bavel-2', 50 - i),
    );
    const l = layoutSageArcs('amora-bavel-4', big, 'amora-bavel-2');
    const g = l.groups.find((x) => x.gen === 'amora-bavel-2');
    expect(g?.dots).toHaveLength(ARC_MAX_PARTNERS_PER_GEN);
    expect(l.fanOverflow).toBe(5);
  });
});

describe('layoutSageArcs — unknown generation', () => {
  it("the null-generation group expands under the '?' key", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      row(`u${i}`, i < 10 ? 'amora-bavel-2' : null, 2),
    );
    const l = layoutSageArcs('amora-bavel-4', many, '?');
    const unknown = l.groups.find((g) => g.gen === null);
    expect(unknown?.expanded).toBe(true);
    expect(unknown?.dots).toHaveLength(2);
    // and null means: nothing expanded
    const l2 = layoutSageArcs('amora-bavel-4', many, null);
    expect(l2.groups.every((g) => !g.expanded)).toBe(true);
  });
});

describe('layoutSageArcs — small networks', () => {
  it('auto-expands everything at or below the threshold', () => {
    const few = Array.from({ length: AUTO_EXPAND_MAX }, (_, i) =>
      row(`s${i}`, 'amora-ey-2', i + 1),
    );
    const l = layoutSageArcs('amora-bavel-1', few, null);
    expect(l.autoExpanded).toBe(true);
    expect(l.groups.every((g) => g.expanded)).toBe(true);
    expect(l.edges.every((e) => e.kind === 'fan')).toBe(true);
  });

  it('places the heaviest earlier-generation partner nearest the center', () => {
    const l = layoutSageArcs('amora-bavel-4', [
      row('heavy', 'tanna-2', 9),
      row('light', 'tanna-2', 1),
    ]);
    const dots = l.groups.find((g) => g.gen === 'tanna-2')?.dots ?? [];
    const hx = dots.find((d) => d.row.other.slug === 'heavy')?.x ?? 0;
    const lx = dots.find((d) => d.row.other.slug === 'light')?.x ?? 0;
    expect(hx).toBeGreaterThan(lx);
  });

  it('always renders the full fixed timeline (zugim through savora)', () => {
    const l = layoutSageArcs('savora', [row('x', 'tanna-1', 1)]);
    const gens = l.groups.map((g) => g.gen);
    expect(gens[0]).toBe('zugim');
    expect(gens[gens.length - 1]).toBe('savora');
    expect(gens).toContain('amora-bavel-8');
    expect(l.groups.length).toBeGreaterThanOrEqual(21);
  });

  it('the ruler is identical across sages in the default view', () => {
    const a = layoutSageArcs('tanna-2', [row('p1', 'tanna-4', 3)], null);
    const b = layoutSageArcs('amora-bavel-6', [row('p2', 'amora-ey-1', 5)], null);
    // autoExpanded kicks in for tiny networks, so force-collapse comparison:
    // both have <= AUTO_EXPAND_MAX rows, so compare group geometry only for
    // larger synthetic sets.
    const many = (gen: string) =>
      Array.from({ length: 10 }, (_, i) => row(`m${i}`, 'amora-ey-2', i + 1));
    const bigA = layoutSageArcs('tanna-2', many('a'), null);
    const bigB = layoutSageArcs('amora-bavel-6', many('b'), null);
    expect(bigA.groups.map((g) => [g.gen, g.x, g.width])).toEqual(
      bigB.groups.map((g) => [g.gen, g.x, g.width]),
    );
    expect(bigA.width).toBe(bigB.width);
    expect(a.groups.length).toBe(b.groups.length);
    // …and an auto-expanded (small) page shares the exact same ruler as a
    // trunked page whenever no generation holds 3+ partners.
    const small = layoutSageArcs('amora-bavel-6', [row('s1', 'amora-bavel-4', 2)], null);
    expect(small.autoExpanded).toBe(true);
    expect(small.groups.map((g) => [g.gen, g.x, g.width])).toEqual(
      bigA.groups.map((g) => [g.gen, g.x, g.width]),
    );
  });
});

describe('barSegments', () => {
  it('never overlaps: x advances by rendered width + gap even with clamped minis', () => {
    const segs = barSegments(
      [
        { kind: 'a', weight: 96 },
        { kind: 'b', weight: 2 },
        { kind: 'c', weight: 2 },
      ],
      100,
      60,
    );
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].x).toBeGreaterThanOrEqual(segs[i - 1].x + segs[i - 1].w + 2);
    }
    expect(segs.every((s) => s.w >= 1.5)).toBe(true);
  });
  it('is empty for zero totals', () => {
    expect(barSegments([], 0, 60)).toEqual([]);
  });
});

describe('arcPath', () => {
  it('always bulges above the axis, mirrored for leftward partners', () => {
    const base = { x1: 10, x2: 110, ry: 40 };
    expect(arcPath(base, 100)).toBe('M 10 100 A 50 40 0 0 1 110 100');
    expect(arcPath({ ...base, x1: 110, x2: 10 }, 100)).toBe('M 110 100 A 50 40 0 0 0 10 100');
  });
});

describe('shortGenLabel', () => {
  it('produces compact collision-safe labels', () => {
    expect(shortGenLabel('amora-bavel-2', false)).toBe('Bavel 2');
    expect(shortGenLabel('amora-ey-1', false)).toBe('E.Y. 1');
    expect(shortGenLabel('tanna-4', false)).toBe('Tanna 4');
    expect(shortGenLabel('savora', false)).toBe('Savora');
    expect(shortGenLabel(null, false)).toBe('?');
    expect(shortGenLabel('amora-bavel-2', true)).toBe('בבל 2');
  });
});
