import { describe, expect, it } from 'vitest';
import { buildSageOverview, workOf } from '../src/lib/sage-graph/overview';

const node = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  label: id,
  labelHe: null,
  generation: null,
  identityResolved: false,
  ...extra,
});
const edge = (a: string, b: string, extra: Record<string, unknown> = {}) => ({
  a,
  b,
  mode: 'stated',
  outcome: 'stated',
  ref: 'Shabbat 10a:3',
  passageId: `${a}-${b}`,
  ...extra,
});
const base = { revision: 'r1', createdAt: '2026-10-21T00:00:00Z', change: 'test' };

describe('workOf', () => {
  it('drops the page or chapter position and keeps the work', () => {
    expect(workOf('Sanhedrin 33a:6')).toBe('Sanhedrin');
    expect(workOf('Jerusalem Talmud Bava Batra 8:8:2')).toBe('Jerusalem Talmud Bava Batra');
    expect(workOf('Midrash Shmuel 15:2')).toBe('Midrash Shmuel');
  });
});

describe('buildSageOverview', () => {
  const counts = [
    { kind: 'passage', decision: null, n: 100 },
    { kind: 'name_occurrence', decision: 'accepted_local', n: 8 },
    { kind: 'name_occurrence', decision: 'page_placement_pending', n: 2 },
    { kind: 'identity_proposal', decision: 'needs_review', n: 40 },
    { kind: 'identity_assignment', decision: 'supported', n: 3 },
    { kind: 'identity_assignment', decision: 'uncertain', n: 1 },
    { kind: 'accepted_identity', decision: 'accepted', n: 2 },
  ];

  it('counts what is open and what is connected', () => {
    const out = buildSageOverview({
      ...base,
      counts,
      nodePayloads: [
        node('rava', { identityResolved: true, generation: 'amora-bavel-4' }),
        node('abaye', { identityResolved: true }),
        node('local:p/A'),
        node('local:q/A'),
        node('lonely'),
      ],
      edgePayloads: [
        edge('rava', 'abaye'),
        edge('rava', 'local:p/A', { outcome: 'occurred' }),
        edge('local:q/A', 'lonely', { ref: 'Eruvin 4b:1' }),
      ],
    });
    expect(out.stats).toMatchObject({
      passages: 100,
      connections: 3,
      connectionsStatedOnly: 2,
      nodes: 5,
      nodesNamed: 2,
      nodesWithEra: 1,
      components: 2,
      largestComponent: 3,
      nameMentions: 10,
      nameMentionsPlaced: 8,
      nameMentionsPending: 2,
      proposalsWaiting: 40,
      assignmentsSupported: 3,
      assignmentsUncertain: 1,
      identitiesAccepted: 2,
      worksWithConnections: 2,
    });
    expect(out.works).toEqual([
      { work: 'Shabbat', connections: 2 },
      { work: 'Eruvin', connections: 1 },
    ]);
  });

  it('draws only nodes that have a connection', () => {
    const out = buildSageOverview({
      ...base,
      counts,
      nodePayloads: [node('a'), node('b'), node('unused')],
      edgePayloads: [edge('a', 'b')],
    });
    expect(out.nodes.map((n) => n.id).sort()).toEqual(['a', 'b']);
    expect(out.stats.nodes).toBe(3);
  });

  it('drops a connection whose end is not a known node instead of guessing', () => {
    const out = buildSageOverview({
      ...base,
      counts,
      nodePayloads: [node('a'), node('b')],
      edgePayloads: [edge('a', 'b'), edge('a', 'ghost'), { a: 'a' }, null],
    });
    expect(out.edges).toHaveLength(1);
    expect(out.stats.connections).toBe(1);
  });

  it('does not expose the passage id on an edge', () => {
    const out = buildSageOverview({
      ...base,
      counts,
      nodePayloads: [node('a'), node('b')],
      edgePayloads: [edge('a', 'b')],
    });
    expect(out.edges[0]).not.toHaveProperty('passageId');
  });

  it('copes with an empty snapshot', () => {
    const out = buildSageOverview({ ...base, counts: [], nodePayloads: [], edgePayloads: [] });
    expect(out.stats.components).toBe(0);
    expect(out.stats.largestComponent).toBe(0);
    expect(out.nodes).toEqual([]);
  });
});
