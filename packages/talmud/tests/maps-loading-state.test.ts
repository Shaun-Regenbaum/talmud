/**
 * mapsState (ArgumentSidebar): the overview's flow-graph maps must NOT render
 * until the daf-level flow enrichment has resolved. Before resolution there are
 * no connections, so the maps would show as disconnected, link-less nodes — a
 * "map without its links". The gate shows a loading state instead. This locks
 * that gate against regression.
 */
import { describe, expect, it } from 'vitest';
import { mapsState } from '../src/client/ArgumentSidebar';

describe('mapsState — maps wait for the flow to resolve', () => {
  it('is loading while the flow has not resolved (no links yet)', () => {
    // The bug: sections exist, so the maps used to render immediately — as
    // disconnected nodes — before any connections arrived. Must be loading.
    expect(mapsState(6, false)).toBe('loading');
    expect(mapsState(1, false)).toBe('loading');
  });

  it('is ready once the flow resolves — even with zero edges', () => {
    // A daf can legitimately have no flow edges; resolution (not edge count)
    // is what unblocks the maps.
    expect(mapsState(6, true)).toBe('ready');
    expect(mapsState(1, true)).toBe('ready');
  });

  it('is empty when the daf has no sections, regardless of resolution', () => {
    expect(mapsState(0, false)).toBe('empty');
    expect(mapsState(0, true)).toBe('empty');
    expect(mapsState(-1, true)).toBe('empty');
  });
});
