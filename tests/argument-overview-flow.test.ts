import { describe, it, expect } from 'vitest';
import { filterFlowConnections, assignLanes, type FlowConnection } from '../src/client/ArgumentFlowGraph';
import { tokenizeRabbiMentions } from '../src/client/rabbiLinks';

const conn = (from: number, to: number): FlowConnection => ({ from, to, kind: 'continues', note: '' });

describe('assignLanes — connectors that overlap vertically get different lanes', () => {
  it('puts non-overlapping (sequential) connectors in the same lane', () => {
    // 0→1 ends at row 1; 2→3 starts at row 2 — no overlap, reuse lane 0.
    expect(assignLanes([conn(0, 1), conn(2, 3)])).toEqual([0, 0]);
  });
  it('separates connectors whose row-spans overlap', () => {
    // 0→3 spans rows 0..3; 1→2 sits inside it — must be a different lane.
    expect(assignLanes([conn(0, 3), conn(1, 2)])).toEqual([0, 1]);
  });
  it('reuses a freed lane once a run has ended', () => {
    // 0→2 and 1→4 overlap (lanes 0,1); 3→5 starts after 0→2 ended → lane 0 again.
    expect(assignLanes([conn(0, 2), conn(1, 4), conn(3, 5)])).toEqual([0, 1, 0]);
  });
  it('handles reversed (upward) connectors by row extent, not direction', () => {
    expect(assignLanes([conn(3, 0), conn(1, 2)])).toEqual([0, 1]);
  });
  it('empty in -> empty out', () => {
    expect(assignLanes([])).toEqual([]);
  });
});

describe('filterFlowConnections — overview flow graph edges', () => {
  it('keeps valid in-range connections', () => {
    expect(filterFlowConnections([conn(0, 1), conn(1, 3)], 5)).toHaveLength(2);
  });
  it('drops endpoints outside the section range (LLM hallucinated an index)', () => {
    expect(filterFlowConnections([conn(0, 9)], 5)).toHaveLength(0);
    expect(filterFlowConnections([conn(-1, 2)], 5)).toHaveLength(0);
  });
  it('drops self-loops', () => {
    expect(filterFlowConnections([conn(3, 3)], 5)).toHaveLength(0);
  });
  it('drops non-integer indices', () => {
    expect(filterFlowConnections([{ from: 0.5, to: 2, kind: 'resolves', note: '' }], 5)).toHaveLength(0);
  });
  it('empty in -> empty out', () => {
    expect(filterFlowConnections([], 5)).toEqual([]);
  });
});

describe('tokenizeRabbiMentions — guards the blank-name regression', () => {
  it('every matched name yields a NON-EMPTY link part', () => {
    const parts = tokenizeRabbiMentions(
      'Rabbi Yochanan rules like Rabban Shimon ben Gamliel.',
      ['Rabbi Yochanan', 'Rabban Shimon ben Gamliel'],
    );
    const links = parts.filter((p) => p.kind === 'link');
    expect(links).toHaveLength(2);
    expect(links.every((l) => l.value.trim().length > 0)).toBe(true);
    expect(links.map((l) => l.value)).toContain('Rabban Shimon ben Gamliel');
  });
  it('matches a name right before a curly-apostrophe possessive (the exact case that looked blank)', () => {
    const parts = tokenizeRabbiMentions('to Rabbi Eliezer’s view', ['Rabbi Eliezer']);
    const link = parts.find((p) => p.kind === 'link');
    expect(link?.value).toBe('Rabbi Eliezer');
  });
  it('prefers the longest matching name (no truncated/blank link)', () => {
    const parts = tokenizeRabbiMentions(
      'Rabbi Yochanan ben Zakkai taught',
      ['Rabbi Yochanan', 'Rabbi Yochanan ben Zakkai'],
    );
    const link = parts.find((p) => p.kind === 'link');
    expect(link?.value).toBe('Rabbi Yochanan ben Zakkai');
  });
  it('passes unmatched prose through as a single text part', () => {
    expect(tokenizeRabbiMentions('no names here', ['Rava'])).toEqual([{ kind: 'text', value: 'no names here' }]);
  });
});
