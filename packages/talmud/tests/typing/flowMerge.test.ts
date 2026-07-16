/**
 * mergeFlows (src/lib/typing/flowMerge.ts) — merges deterministic derived
 * section edges UNDER the AI flow: AI edges pass through untouched, a derived
 * edge is appended only when no edge already covers its unordered section pair.
 * The exact semantics the reader's Overview maps used inline; now shared with
 * the #argument page.
 */
import { describe, expect, it } from 'vitest';
import { mergeFlows } from '../../src/lib/typing/flowMerge';

type Edge = { from: number; to: number; kind: string; derived?: boolean };

describe('mergeFlows', () => {
  it('appends derived edges for pairs the AI flow left silent', () => {
    const ai: Edge[] = [{ from: 1, to: 0, kind: 'resolves' }];
    const det: Edge[] = [{ from: 2, to: 1, kind: 'continues', derived: true }];
    expect(mergeFlows(ai, det)).toEqual([
      { from: 1, to: 0, kind: 'resolves' },
      { from: 2, to: 1, kind: 'continues', derived: true },
    ]);
  });

  it('drops a derived edge whose pair the AI flow covers — in either orientation', () => {
    const ai: Edge[] = [{ from: 0, to: 1, kind: 'continues' }];
    expect(mergeFlows(ai, [{ from: 1, to: 0, kind: 'resolves', derived: true }])).toEqual(ai);
    expect(mergeFlows(ai, [{ from: 0, to: 1, kind: 'resolves', derived: true }])).toEqual(ai);
  });

  it('keeps only the first derived edge per pair', () => {
    const det: Edge[] = [
      { from: 2, to: 0, kind: 'resolves', derived: true },
      { from: 0, to: 2, kind: 'continues', derived: true },
    ];
    expect(mergeFlows([], det)).toEqual([det[0]]);
  });

  it('preserves AI edge order and passes empty inputs through', () => {
    const ai: Edge[] = [
      { from: 3, to: 0, kind: 'cites' },
      { from: 1, to: 0, kind: 'continues' },
    ];
    expect(mergeFlows(ai, [])).toEqual(ai);
    expect(mergeFlows<Edge>([], [])).toEqual([]);
  });
});
