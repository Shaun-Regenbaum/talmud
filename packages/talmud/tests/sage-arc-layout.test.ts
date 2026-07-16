import { describe, expect, it } from 'vitest';
import type { EgoRow } from '../src/client/egoNetwork';
import {
  ARC_MAX_PARTNERS,
  arcPath,
  barSegments,
  genOrder,
  layoutArcs,
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
    expect(genOrder('amora-ey-1')).toBeLessThan(genOrder('amora-bavel-8'));
    expect(genOrder(null)).toBeGreaterThan(genOrder('achronim'));
    expect(genOrder('nonsense')).toBe(genOrder(null));
  });
});

describe('layoutArcs', () => {
  const rows = [
    row('a', 'amora-bavel-4', 9, [
      { kind: 'opposes', direction: 'out', weight: 6 },
      { kind: 'cites', direction: 'in', weight: 3 },
    ]),
    row('b', 'tanna-2', 4),
    row('c', 'amora-bavel-4', 2),
  ];

  it('groups by generation in chronological order and places the center', () => {
    const l = layoutArcs('amora-bavel-4', rows);
    expect(l.ticks.map((t) => t.gen)).toEqual(['tanna-2', 'amora-bavel-4']);
    // center sits inside its own generation group's x-range
    const own = l.ticks[1];
    expect(l.center.x).toBeGreaterThanOrEqual(own.x);
    expect(l.center.x).toBeLessThanOrEqual(own.x + own.width);
    expect(l.dots).toHaveLength(3);
  });

  it('splits arcs by direction and scales stroke with weight', () => {
    const l = layoutArcs('amora-bavel-4', rows);
    const above = l.arcs.filter((a) => a.above);
    const below = l.arcs.filter((a) => !a.above);
    expect(above.length).toBe(3); // two out-rows + a's out chip
    expect(below.length).toBe(1); // a's in chip
    const heavy = l.arcs.find((a) => a.chip.weight === 6);
    const light = l.arcs.find((a) => a.chip.weight === 2);
    expect(heavy && light && heavy.stroke > light.stroke).toBe(true);
  });

  it('sums the per-generation kind breakdown', () => {
    const l = layoutArcs('amora-bavel-4', rows);
    const own = l.ticks.find((t) => t.gen === 'amora-bavel-4');
    expect(own?.total).toBe(11); // a(9) + c(2)
    expect(own?.byKind.find((k) => k.kind === 'opposes')?.weight).toBe(8);
    expect(own?.byKind.find((k) => k.kind === 'cites')?.weight).toBe(3);
  });

  it('caps drawn partners and reports overflow', () => {
    const many = Array.from({ length: ARC_MAX_PARTNERS + 7 }, (_, i) =>
      row(`s${i}`, 'amora-bavel-3', ARC_MAX_PARTNERS + 7 - i),
    );
    const l = layoutArcs('amora-bavel-4', many);
    expect(l.dots).toHaveLength(ARC_MAX_PARTNERS);
    expect(l.overflow).toBe(7);
  });

  it('places the heaviest earlier-generation partner nearest the center', () => {
    const l = layoutArcs('amora-bavel-4', [row('heavy', 'tanna-2', 9), row('light', 'tanna-2', 1)]);
    const hx = l.dots.find((d) => d.row.other.slug === 'heavy')?.x ?? 0;
    const lx = l.dots.find((d) => d.row.other.slug === 'light')?.x ?? 0;
    expect(hx).toBeGreaterThan(lx); // shortest arc for the strongest tie
  });

  it('creates the center generation group even with no partners in it', () => {
    const l = layoutArcs('savora', [row('x', 'tanna-1', 1)]);
    expect(l.ticks.map((t) => t.gen)).toEqual(['tanna-1', 'savora']);
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
  it('bulges up for above-axis arcs and down for below', () => {
    const base = {
      slug: 's',
      chip: { kind: 'opposes', direction: 'out' as const, weight: 1, strict: 0 },
      x1: 10,
      x2: 110,
      ry: 40,
      stroke: 2,
    };
    expect(arcPath({ ...base, above: true }, 100)).toBe('M 10 100 A 50 40 0 0 1 110 100');
    expect(arcPath({ ...base, above: false }, 100)).toBe('M 10 100 A 50 40 0 0 0 110 100');
    // mirrored when the partner sits left of center
    expect(arcPath({ ...base, above: true, x1: 110, x2: 10 }, 100)).toBe(
      'M 110 100 A 50 40 0 0 0 10 100',
    );
  });
});
