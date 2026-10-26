import { describe, expect, it } from 'vitest';
import { layoutOverview, placeLabels } from '../src/client/sageOverviewLayout';

const ring = (n: number, prefix = 'n') =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}` }));
const chain = (n: number, prefix = 'n') =>
  Array.from({ length: n - 1 }, (_, i) => ({ a: `${prefix}${i}`, b: `${prefix}${i + 1}` }));

describe('layoutOverview', () => {
  it('gives every name its own place inside the page width', () => {
    const nodes = [...ring(30, 'a'), ...ring(5, 'b'), ...ring(2, 'c')];
    const edges = [...chain(30, 'a'), ...chain(5, 'b'), ...chain(2, 'c')];
    const out = layoutOverview(nodes, edges, 900);
    expect(out.positions.size).toBe(37);
    for (const p of out.positions.values()) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(900);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(out.height);
    }
    const spots = new Set(
      [...out.positions.values()].map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`),
    );
    expect(spots.size).toBe(37);
  });

  it('keeps each cluster in its own box and puts the biggest first', () => {
    const nodes = [...ring(4, 'small'), ...ring(20, 'big')];
    const edges = [...chain(4, 'small'), ...chain(20, 'big')];
    const out = layoutOverview(nodes, edges, 900);
    expect(out.boxes[0].ids).toHaveLength(20);
    for (const box of out.boxes) {
      for (const id of box.ids) {
        const p = out.positions.get(id)!;
        expect(p.x).toBeGreaterThanOrEqual(box.x);
        expect(p.x).toBeLessThanOrEqual(box.x + box.w);
        expect(p.y).toBeGreaterThanOrEqual(box.y);
        expect(p.y).toBeLessThanOrEqual(box.y + box.h);
      }
    }
    for (const a of out.boxes) {
      for (const b of out.boxes) {
        if (a === b) continue;
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  it('draws the same picture for the same input', () => {
    const nodes = ring(12);
    const edges = chain(12);
    const a = layoutOverview(nodes, edges, 800);
    const b = layoutOverview(nodes, edges, 800);
    expect([...a.positions]).toEqual([...b.positions]);
  });

  it('ignores a connection to a name that is not there', () => {
    const out = layoutOverview(ring(3), [...chain(3), { a: 'n0', b: 'ghost' }], 600);
    expect(out.positions.size).toBe(3);
    expect(out.positions.has('ghost')).toBe(false);
  });

  it('handles no names at all', () => {
    const out = layoutOverview([], [], 600);
    expect(out.positions.size).toBe(0);
    expect(out.height).toBe(0);
  });
});

describe('small clusters', () => {
  it('draw one to three names as a compact row with the best-connected in the middle', () => {
    const out = layoutOverview(ring(3, 'm'), chain(3, 'm'), 900);
    expect(out.boxes[0].compact).toBe(true);
    const xs = ['m0', 'm1', 'm2'].map((id) => out.positions.get(id)!.x);
    expect(xs[1]).toBeGreaterThan(Math.min(xs[0], xs[2]));
    expect(xs[1]).toBeLessThan(Math.max(xs[0], xs[2]));
    const ys = new Set(['m0', 'm1', 'm2'].map((id) => out.positions.get(id)!.y));
    expect(ys.size).toBe(1);
  });

  it('leaves a larger cluster as a free layout', () => {
    const out = layoutOverview(ring(6), chain(6), 900);
    expect(out.boxes[0].compact).toBe(false);
  });
});

describe('larger clusters', () => {
  it('keep names apart and inside a disc', () => {
    const nodes = ring(40);
    const edges = [
      ...chain(40),
      ...Array.from({ length: 10 }, (_, i) => ({ a: 'n0', b: `n${i + 20}` })),
    ];
    const out = layoutOverview(nodes, edges, 960);
    const box = out.boxes[0];
    const points = box.ids.map((id) => out.positions.get(id)!);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    for (const p of points)
      expect(Math.hypot(p.x - cx, p.y - cy)).toBeLessThanOrEqual(box.w / 2 + 0.5);
    let closest = Infinity;
    for (let i = 0; i < points.length; i++)
      for (let j = i + 1; j < points.length; j++)
        closest = Math.min(
          closest,
          Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y),
        );
    expect(closest).toBeGreaterThan(6);
  });
});

describe('placeLabels', () => {
  it('keeps the higher priority label when two would overlap', () => {
    const kept = placeLabels([
      { id: 'a', x: 100, y: 50, text: 'Rav Ashi', priority: 5 },
      { id: 'b', x: 105, y: 52, text: 'Rava', priority: 9 },
      { id: 'c', x: 400, y: 50, text: 'Abaye', priority: 1 },
    ]);
    expect(kept.has('b')).toBe(true);
    expect(kept.has('a')).toBe(false);
    expect(kept.has('c')).toBe(true);
  });

  it('is the same every time', () => {
    const items = [
      { id: 'x', x: 10, y: 10, text: 'Same', priority: 1 },
      { id: 'y', x: 12, y: 10, text: 'Same', priority: 1 },
    ];
    expect([...placeLabels(items)]).toEqual([...placeLabels([...items].reverse())]);
  });
});
