/**
 * groupSectionsBySugya (ArgumentSidebar): split a daf's argument sections into
 * CONTIGUOUS discussion maps. The key property is that maps are runs in daf
 * order — a section the flow "skips over" (a 2->4 edge) must stay inside the
 * surrounding discussion, never get orphaned into a trailing singleton map.
 */
import { describe, it, expect } from 'vitest';
import { groupSectionsBySugya } from '../src/client/ArgumentSidebar';
import type { FlowConnection } from '../src/client/ArgumentFlowGraph';

const e = (from: number, to: number, kind: FlowConnection['kind'] = 'continues'): FlowConnection => ({ from, to, kind });

describe('groupSectionsBySugya — contiguous discussion maps', () => {
  it('a fully-bound run is one map', () => {
    expect(groupSectionsBySugya(4, [e(0, 1), e(1, 2), e(2, 3)])).toEqual([[0, 1, 2, 3]]);
  });

  it('splits where no binding edge crosses (clean cut)', () => {
    // 0-1 a discussion; 2-3 another; nothing crosses the 1|2 gap.
    expect(groupSectionsBySugya(4, [e(0, 1), e(2, 3)])).toEqual([[0, 1], [2, 3]]);
  });

  it('keeps a skipped-over section inside the run (2->4 spans section 3)', () => {
    // The Berakhot 2b case: section 3 has no edge of its own, but 2->4 spans it,
    // so it stays in the contradiction run instead of orphaning after it.
    const conns = [e(0, 1, 'parallels'), e(2, 4, 'depends-on'), e(4, 5), e(5, 6)];
    // parallels doesn't bind, so 0 and 1 are their own clean cuts; 2..6 is one run.
    expect(groupSectionsBySugya(7, conns)).toEqual([[0], [1], [2, 3, 4, 5, 6]]);
  });

  it('orphaned middle section never renders out of order', () => {
    // Even if only 2 and 4 bind (skipping 3), the result is contiguous + ordered.
    const groups = groupSectionsBySugya(5, [e(0, 1), e(2, 4, 'depends-on')]);
    expect(groups).toEqual([[0, 1], [2, 3, 4]]);
    // every group is a contiguous ascending run
    for (const g of groups) {
      for (let i = 1; i < g.length; i++) expect(g[i]).toBe(g[i - 1] + 1);
    }
  });

  it('non-binding kinds do not merge sections', () => {
    expect(groupSectionsBySugya(3, [e(0, 1, 'contrasts'), e(1, 2, 'cites')])).toEqual([[0], [1], [2]]);
  });

  it('single section / empty', () => {
    expect(groupSectionsBySugya(1, [])).toEqual([[0]]);
    expect(groupSectionsBySugya(0, [])).toEqual([]);
  });
});
