import { describe, expect, it } from 'vitest';
import {
  buildStatementSpine,
  type StatementMoveLike,
  type VoicesGraphLike,
} from '../src/lib/typing/statementSpine';

// The statement spine folds the per-section VOICES diagram and the DIALECTIC
// move-flow into ONE graph (nodes = moves, links = role-derived + voices-mapped
// relations). These tests pin the topology that lets one renderer replace three:
//   - a linear sugya → a straight chain (no dispute)
//   - a named מחלוקת → branches with an `opposes` link (dispute)
//   - an anonymous Stam "dispute" → NEVER branches (anti-hallucination guard)

const move = (
  order: number,
  role: string,
  voice: string,
  rabbiNames: string[] = [],
  extra: Partial<StatementMoveLike['fields']> = {},
): StatementMoveLike => ({
  startSegIdx: order,
  endSegIdx: order,
  fields: { id: `s_${order}`, moveOrder: order, role, voice, rabbiNames, ...extra },
});

describe('buildStatementSpine — nodes', () => {
  it('makes one node per move, ordered by moveOrder', () => {
    const { nodes } = buildStatementSpine({
      moves: [move(2, 'answer', 'Rava'), move(0, 'opening', 'Abaye'), move(1, 'question', 'Stam')],
    });
    expect(nodes.map((n) => n.id)).toEqual(['s_0', 's_1', 's_2']);
    expect(nodes.map((n) => n.role)).toEqual(['opening', 'question', 'answer']);
  });

  it('flags named vs anonymous statements from rabbiNames', () => {
    const { nodes } = buildStatementSpine({
      moves: [move(0, 'question', 'the Gemara'), move(1, 'answer', 'Rava', ['Rava'])],
    });
    expect(nodes[0].named).toBe(false);
    expect(nodes[1].named).toBe(true);
    expect(nodes[1].rabbiNames).toEqual(['Rava']);
  });

  it('carries the text anchor (segment + token range) for click-to-highlight', () => {
    const { nodes } = buildStatementSpine({
      moves: [
        {
          startSegIdx: 4,
          endSegIdx: 6,
          fields: { id: 'x', moveOrder: 0, role: 'opening', tokenStart: 2, tokenEnd: 9 },
        },
      ],
    });
    expect(nodes[0]).toMatchObject({ startSegIdx: 4, endSegIdx: 6, tokenStart: 2, tokenEnd: 9 });
  });

  it('falls back to a synthesized id and order when fields are missing', () => {
    const { nodes } = buildStatementSpine({
      moves: [{ startSegIdx: 3, endSegIdx: 5, fields: {} }],
    });
    expect(nodes[0].id).toBe('3-5_0');
    expect(nodes[0].order).toBe(0);
    expect(nodes[0].role).toBe('other');
  });
});

describe('buildStatementSpine — role-derived links (deterministic, no model)', () => {
  it('an objection opposes the prior claim', () => {
    const { links } = buildStatementSpine({
      moves: [move(0, 'opening', 'Rava', ['Rava']), move(1, 'objection', 'Abaye', ['Abaye'])],
    });
    expect(links).toContainEqual({ from: 's_1', to: 's_0', relation: 'opposes', source: 'role' });
  });

  it('a resolution resolves the open question', () => {
    const { links } = buildStatementSpine({
      moves: [move(0, 'question', 'Stam'), move(1, 'resolution', 'Stam')],
    });
    expect(links).toContainEqual({
      from: 's_1',
      to: 's_0',
      relation: 'resolves',
      source: 'role',
    });
  });

  it('an answer responds to the question', () => {
    const { links } = buildStatementSpine({
      moves: [move(0, 'question', 'Stam'), move(1, 'answer', 'Rava', ['Rava'])],
    });
    expect(links).toContainEqual({
      from: 's_1',
      to: 's_0',
      relation: 'responds-to',
      source: 'role',
    });
  });

  it('a pure linear progression has no opposition → not a dispute', () => {
    const spine = buildStatementSpine({
      moves: [
        move(0, 'opening', 'Stam'),
        move(1, 'question', 'Stam'),
        move(2, 'answer', 'Rava', ['Rava']),
        move(3, 'resolution', 'Stam'),
      ],
    });
    expect(spine.dispute).toBe(false);
    expect(spine.links.some((l) => l.relation === 'opposes')).toBe(false);
  });
});

describe('buildStatementSpine — voices overlay', () => {
  const voices: VoicesGraphLike = {
    voices: [
      { name: 'R. Ashi', side: 'A' },
      { name: 'R. Huna', side: 'B' },
    ],
    edges: [{ from: 'R. Huna', to: 'R. Ashi', kind: 'opposes' }],
  };

  it('maps a voice opposes-edge onto the speakers’ statements and marks a dispute', () => {
    const spine = buildStatementSpine({
      moves: [
        move(0, 'opening', 'R. Ashi', ['R. Ashi']),
        move(1, 'objection', 'R. Huna', ['R. Huna']),
      ],
      voices,
    });
    expect(spine.dispute).toBe(true);
    expect(spine.links).toContainEqual({
      from: 's_1',
      to: 's_0',
      relation: 'opposes',
      source: 'voices',
    });
  });

  it('assigns the position side from the voices graph onto the statements', () => {
    const { nodes } = buildStatementSpine({
      moves: [
        move(0, 'opening', 'R. Ashi', ['R. Ashi']),
        move(1, 'objection', 'R. Huna', ['R. Huna']),
      ],
      voices,
    });
    expect(nodes.find((n) => n.id === 's_0')?.side).toBe('A');
    expect(nodes.find((n) => n.id === 's_1')?.side).toBe('B');
  });

  it('maps supports / cites edges too (not gated, but still requires matching statements)', () => {
    const spine = buildStatementSpine({
      moves: [
        move(0, 'opening', 'Marimar', ['Marimar']),
        move(1, 'supporting-evidence', 'Rava', ['Rava']),
      ],
      voices: { edges: [{ from: 'Rava', to: 'Marimar', kind: 'supports' }] },
    });
    expect(spine.links).toContainEqual({
      from: 's_1',
      to: 's_0',
      relation: 'supports',
      source: 'voices',
    });
  });

  it('drops a voice edge whose voice speaks no statement in this section', () => {
    const spine = buildStatementSpine({
      moves: [move(0, 'opening', 'Rava', ['Rava'])],
      voices: { edges: [{ from: 'Abaye', to: 'Rava', kind: 'opposes' }] },
    });
    expect(spine.links.some((l) => l.source === 'voices')).toBe(false);
  });
});

describe('buildStatementSpine — anti-hallucination dispute gate', () => {
  it('does NOT count an opposition between anonymous (Stam) voices as a dispute', () => {
    const spine = buildStatementSpine({
      moves: [move(0, 'opening', 'Stam'), move(1, 'objection', 'the Gemara')],
      voices: { edges: [{ from: 'the Gemara', to: 'Stam', kind: 'opposes' }] },
    });
    // The role-derived objection link is dropped onto unnamed nodes, so it never
    // counts as a real מחלוקת.
    expect(spine.dispute).toBe(false);
    // And the voices opposes-edge is suppressed entirely (both ends anonymous).
    expect(spine.links.some((l) => l.relation === 'opposes' && l.source === 'voices')).toBe(false);
  });

  it('does not branch when only one side is named', () => {
    const spine = buildStatementSpine({
      moves: [move(0, 'opening', 'Rava', ['Rava']), move(1, 'objection', 'Stam')],
      voices: { edges: [{ from: 'Stam', to: 'Rava', kind: 'opposes' }] },
    });
    expect(spine.dispute).toBe(false);
  });
});

describe('buildStatementSpine — edge cases', () => {
  it('handles an empty section', () => {
    expect(buildStatementSpine({ moves: [] })).toEqual({ nodes: [], links: [], dispute: false });
  });

  it('round-trips a large section (>=15 statements) with no loss and stable order', () => {
    const roles = ['opening', 'question', 'answer', 'objection', 'resolution'];
    const big = Array.from({ length: 18 }, (_, i) =>
      move(
        i,
        roles[i % roles.length],
        i % 3 === 0 ? `Rabbi ${i}` : 'Stam',
        i % 3 === 0 ? [`Rabbi ${i}`] : [],
      ),
    );
    const { nodes } = buildStatementSpine({ moves: big });
    expect(nodes).toHaveLength(18);
    expect(nodes.map((n) => n.order)).toEqual(Array.from({ length: 18 }, (_, i) => i));
    expect(new Set(nodes.map((n) => n.id)).size).toBe(18); // all ids distinct, none dropped
  });

  it('never emits a self-loop', () => {
    // A degenerate voices edge pointing a voice at itself must not survive.
    const spine = buildStatementSpine({
      moves: [move(0, 'opening', 'Rava', ['Rava'])],
      voices: { edges: [{ from: 'Rava', to: 'Rava', kind: 'opposes' }] },
    });
    expect(spine.links.every((l) => l.from !== l.to)).toBe(true);
  });
});
