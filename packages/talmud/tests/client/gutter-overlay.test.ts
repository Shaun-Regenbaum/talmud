// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { clustersFromEntries, gutterPreviewRange } from '../../src/client/GutterOverlay';
import type { GutterStackEntry } from '../../src/client/gutterStack';

const entry = (
  kind: GutterStackEntry['kind'],
  side: GutterStackEntry['side'],
  tops: number[],
): GutterStackEntry => ({
  kind,
  side,
  items: tops.map((top, index) => ({ kind, index, top, atEdge: false })),
  activeKey: null,
  onClick: () => {},
});

describe('clustersFromEntries', () => {
  it('puts icons from different kinds on one line into one pod, in a fixed order', () => {
    const clusters = clustersFromEntries({
      rishonim: entry('rishonim', 'right', [100]),
      aggadata: entry('aggadata', 'right', [104]),
      argument: entry('argument', 'left', [100]),
    });
    const right = clusters.find((c) => c.side === 'right');
    expect(right?.items.map((p) => p.item.kind)).toEqual(['aggadata', 'rishonim']);
    expect(right?.top).toBe(102);
    expect(clusters.filter((c) => c.side === 'left')).toHaveLength(1);
  });

  it('keeps a pod the same when icons load on another line', () => {
    const before = clustersFromEntries({ halacha: entry('halacha', 'left', [100]) });
    const after = clustersFromEntries({
      halacha: entry('halacha', 'left', [100]),
      argument: entry('argument', 'left', [40]),
      pesuk: entry('pesuk', 'left', [300]),
    });
    expect(after.map((c) => c.key)).toContain(before[0].key);
  });

  it('keeps separate lines apart', () => {
    const clusters = clustersFromEntries({ rishonim: entry('rishonim', 'right', [0, 8, 16, 60]) });
    expect(clusters.map((c) => c.items.length)).toEqual([2, 1, 1]);
  });
});

describe('gutterPreviewRange', () => {
  const daf = (html: string) => {
    const root = document.createElement('div');
    root.innerHTML = `<div class="daf-main"><div class="daf-text">${html}</div></div>`;
    document.body.append(root);
    return root;
  };
  const words = (n: number, from = 0) =>
    Array.from({ length: n }, (_, i) => `<span class="daf-word">w${from + i}</span>`).join(' ');

  it('covers the excerpt after the marker', () => {
    const root = daf(
      `${words(2)}<span class="daf-halacha-anchor" data-idx="0" data-excerpt-len="3"></span>${words(5, 2)}`,
    );
    expect(gutterPreviewRange(root, 'halacha', 0)?.toString()).toBe('w2 w3 w4');
  });

  it('stops at the end marker, which the reader places after the last word', () => {
    // As anchorMarkers.ts injects it: start marker, the story, then the end
    // marker right after its last word.
    const root = daf(
      `${words(1, 90)} <span class="daf-aggadata-anchor" data-idx="1" data-excerpt-len="1"></span>${words(4)}` +
        `<span class="daf-aggadata-end-anchor" data-idx="1" data-excerpt-len="2"></span> ${words(3, 4)}`,
    );
    expect(gutterPreviewRange(root, 'aggadata', 1)?.toString()).toBe('w0 w1 w2 w3');
  });

  it('returns nothing for an icon without a marker', () => {
    const root = daf(words(3));
    expect(gutterPreviewRange(root, 'pesuk', 4)).toBeNull();
  });
});
