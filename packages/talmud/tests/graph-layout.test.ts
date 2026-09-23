import { assignLanes, CONNECTOR, routeConnector, type Side } from '@corpus/ui/graph/geometry';
import { layoutGraph } from '@corpus/ui/graph/model';
import { describe, expect, it } from 'vitest';
import { edges, groups } from './fixtures/argument-graph';

const radii = (path: string) =>
  [...path.matchAll(/A ([\d.]+) ([\d.]+)/g)].flatMap((r) => [Number(r[1]), Number(r[2])]);

describe('shared graph routing', () => {
  it.each(['left', 'right', 'top', 'bottom'] as Side[])(
    'preserves minimum bends and arrow clearance on the %s',
    (side) => {
      for (const delta of [-90, -24, -4, 0, 4, 24, 90]) {
        const horizontal = side === 'left' || side === 'right';
        const from = { x: 100, y: 100 };
        const to = horizontal ? { x: 100, y: 100 + delta } : { x: 100 + delta, y: 100 };
        const route = routeConnector(from, to, side);
        expect(radii(route.path).every((r) => r >= 12)).toBe(true);
        const last = route.points.at(-1)!;
        const corner = route.points.at(-2)!;
        expect(
          Math.hypot(last.x - corner.x, last.y - corner.y) - CONNECTOR.radius,
        ).toBeGreaterThanOrEqual(16);
        expect(Math.hypot(last.x - to.x, last.y - to.y)).toBe(2);
        for (let i = 1; i < route.points.length; i++) {
          const a = route.points[i - 1],
            b = route.points[i];
          expect(a.x === b.x || a.y === b.y).toBe(true);
        }
      }
    },
  );

  it('separates touching, reversed, and parallel connections but reuses clear lanes', () => {
    const lanes = assignLanes([
      { lo: 0, hi: 3 },
      { lo: 3, hi: 0 },
      { lo: 3, hi: 5 },
      { lo: 6, hi: 8 },
    ]);
    expect(new Set(lanes.slice(0, 3)).size).toBe(3);
    expect(lanes[3]).toBe(lanes[0]);
  });
});

describe('Berakhot 2a graph layout', () => {
  it.each([320, 600, 1200])(
    'keeps the real nodes and connections in bounds at width %i',
    (width) => {
      for (const horizontal of [false, true]) {
        const layout = layoutGraph(groups, edges, width, horizontal);
        expect(layout.nodes).toHaveLength(
          groups.length + groups.flatMap((g) => g.children ?? []).length,
        );
        expect(layout.edges).toHaveLength(edges.length);
        for (const node of layout.nodes) {
          expect(node.x).toBeGreaterThanOrEqual(0);
          expect(node.y).toBeGreaterThanOrEqual(0);
          expect(node.x + node.width).toBeLessThanOrEqual(layout.width);
          expect(node.y + node.height).toBeLessThanOrEqual(layout.height);
        }
        expect(layout.edges.every((e) => radii(e.path).every((r) => r >= 12))).toBe(true);
      }
    },
  );

  it('expands all statements horizontally without changing the compact selection', () => {
    const collapsed = groups.map((g) => ({ ...g, expanded: false }));
    const compact = layoutGraph(collapsed, edges, 360);
    const horizontal = layoutGraph(collapsed, edges, 360, true);
    expect(compact.nodes).toHaveLength(groups.length);
    expect(compact.edges).toHaveLength(0);
    expect(horizontal.nodes.length).toBeGreaterThan(compact.nodes.length);
    expect(horizontal.width).toBeGreaterThan(1000);
    expect(collapsed.every((g) => !g.expanded)).toBe(true);
  });

  it('omits unavailable endpoints instead of drawing a connection to a wrong card', () => {
    const remaining = groups.slice(2);
    const available = new Set(remaining.flatMap((g) => [g.id, ...g.children!.map((n) => n.id)]));
    const layout = layoutGraph(remaining, edges, 360);
    expect(
      layout.edges.every(({ edge }) => available.has(edge.from) && available.has(edge.to)),
    ).toBe(true);
    expect(layout.edges.length).toBeLessThan(edges.length);
  });
});
