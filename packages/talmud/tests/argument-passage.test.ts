import { layoutGraph } from '@corpus/ui/graph/model';
import { describe, expect, it } from 'vitest';
import type { FlowConnection } from '../src/client/ArgumentFlowGraph';
import {
  passageConnections,
  qualifyPage,
  savedPageGraph,
} from '../src/client/ArgumentPassageDialog';
import type { SpineViewDaf } from '../src/client/SpineFlowGraph';
import type { StatementSpine } from '../src/lib/typing/statementSpine';
import saved from './fixtures/berakhot-passage.json';

// Real saved sections and connections. No invented argument relations.
const pages = saved.pages.map((p) =>
  qualifyPage(
    savedPageGraph(p.page, {
      ...p,
      flow: p.flow as FlowConnection[],
      sections: p.sections as { index: number; title: string; spine: StatementSpine }[],
    }),
  ),
);
const boundaries = saved.boundaries as SpineViewDaf[];

describe('a passage across dapim', () => {
  it('keeps repeated section and statement IDs on their own daf', () => {
    const ids = pages.flatMap((p) =>
      p.groups.flatMap((g) => [g.id, ...(g.children ?? []).map((n) => n.id)]),
    );
    expect(new Set(ids).size).toBe(ids.length);
    const connections = passageConnections(pages, boundaries);
    expect(connections).toHaveLength(2);
    expect(
      connections.every((e) => e.from === '2a/section:0' && e.to.startsWith('2b/section:')),
    ).toBe(true);
    expect(connections.every((e) => ids.includes(e.from) && ids.includes(e.to))).toBe(true);
  });

  it('does not invent a link when a page or a saved boundary is missing', () => {
    expect(passageConnections(pages.slice(0, 1), boundaries)).toEqual([]);
    expect(passageConnections(pages, [])).toEqual([]);
  });

  it('keeps source order across columns and statement order down each column', () => {
    const groups = pages.flatMap((p) => p.groups);
    const edges = [...pages.flatMap((p) => p.edges), ...passageConnections(pages, boundaries)];
    const layout = layoutGraph(groups, edges, 1200, true);
    expect(layout.edges).toHaveLength(edges.length);
    const headers = layout.nodes.filter((n) => n.header);
    expect(headers.map((n) => n.node.id)).toEqual(groups.map((g) => g.id));
    expect(new Set(headers.map((n) => n.y)).size).toBe(1);
    for (let i = 1; i < headers.length; i++)
      expect(headers[i].x).toBeGreaterThan(headers[i - 1].x + headers[i - 1].width);
    for (const group of groups) {
      const members = layout.nodes.filter((n) => n.group === group.id);
      for (let i = 1; i < members.length; i++)
        expect(members[i].y).toBeGreaterThanOrEqual(members[i - 1].y + members[i - 1].height);
    }
    const crossPaths = layout.edges.filter((e) => e.edge.id.startsWith('cross:'));
    expect(new Set(crossPaths.map((e) => e.path.split(' L ')[0])).size).toBe(crossPaths.length);
  });
});
