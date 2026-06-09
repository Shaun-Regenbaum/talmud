import { applyMatches, type SegMatch, segRange } from '@corpus/core/context/match';
import type { ContextItem } from '@corpus/core/context/types';
import { describe, expect, it } from 'vitest';
import { buildMatchPrompt, parseMatchResponse } from '../src/lib/context/anchor/ai-prompt';

function wholeDafItem(key: string): ContextItem {
  return {
    source: 'dafyomi:insights',
    sourceLabel: 'Insights',
    kind: 'insights',
    key,
    title: { en: key },
    body: { en: 'text' },
    segs: [],
  };
}

describe('segRange', () => {
  it('builds inclusive ranges and single segments', () => {
    expect(segRange(4)).toEqual([4]);
    expect(segRange(2, 5)).toEqual([2, 3, 4, 5]);
    expect(segRange(3, 3)).toEqual([3]);
  });
});

describe('applyMatches', () => {
  it('places matched items (incl. whole-daf); ignores empty-seg no-ops', () => {
    const items = [wholeDafItem('a'), wholeDafItem('b'), wholeDafItem('c'), wholeDafItem('d')];
    const matches: SegMatch[] = [
      { key: 'a', segs: [4], via: 'ai', confidence: 0.9 },
      { key: 'b', segs: [2, 3, 4, 5], via: 'ai', confidence: 0.6 },
      { key: 'c', segs: [], via: 'ai' }, // empty + not wholeDaf -> no-op
      { key: 'd', segs: [], via: 'ai', wholeDaf: true, confidence: 0.4 }, // deliberate whole-daf
    ];
    const changed = applyMatches(items, matches);
    expect(changed).toBe(3);
    expect(items[0].segs).toEqual([4]);
    expect(items[0].via).toBe('ai');
    expect(items[0].confidence).toBe(0.9);
    expect(items[1].segs).toEqual([2, 3, 4, 5]);
    expect(items[2].segs).toEqual([]); // empty no-op: stays unplaced
    expect(items[2].via).toBeUndefined();
    expect(items[3].segs).toEqual([]); // whole-daf: placed, segs stay empty
    expect(items[3].via).toBe('ai');
    expect(items[3].confidence).toBe(0.4);
  });
});

describe('AI match prompt + parse', () => {
  it('builds a prompt listing numbered segments and keyed items', () => {
    const { system, user } = buildMatchPrompt(
      ['סגמנט אפס', 'סגמנט אחד'],
      ['segment zero', 'segment one'],
      [{ key: 'ins:0', label: 'Insights', title: 'Tzomes', text: 'discusses the sinews' }],
    );
    expect(system).toContain('JSON');
    expect(user).toContain('[0]');
    expect(user).toContain('[1]');
    expect(user).toContain('key=ins:0');
    expect(user).toContain('segment zero');
  });

  it('captures an optional Hebrew quote', () => {
    const content = JSON.stringify({
      matches: [
        { key: 'ins:0', segStart: 1, segEnd: 1, confidence: 0.7, quote: 'מן הארכובה ולמטה' },
      ],
    });
    const m = parseMatchResponse(content, new Set(['ins:0']), 5);
    expect(m[0].quote).toBe('מן הארכובה ולמטה');
  });

  it('parses matches: keeps null as whole-daf, drops unknown keys / out-of-range', () => {
    const content = JSON.stringify({
      matches: [
        { key: 'ins:0', segStart: 3, segEnd: 3, confidence: 0.8 },
        { key: 'ins:1', segStart: 2, segEnd: 4, confidence: 0.5 },
        { key: 'ins:2', segStart: null, confidence: 0.1 }, // whole-daf -> kept
        { key: 'ghost', segStart: 1, confidence: 0.9 }, // unknown key -> dropped
        { key: 'ins:3', segStart: 99, confidence: 0.9 }, // out of range -> dropped
      ],
    });
    const matches = parseMatchResponse(content, new Set(['ins:0', 'ins:1', 'ins:2', 'ins:3']), 10);
    expect(matches).toHaveLength(3);
    expect(matches[0]).toEqual({ key: 'ins:0', segs: [3], via: 'ai', confidence: 0.8 });
    expect(matches[1].segs).toEqual([2, 3, 4]);
    expect(matches[2]).toEqual({
      key: 'ins:2',
      segs: [],
      via: 'ai',
      wholeDaf: true,
      confidence: 0.1,
    });
  });

  it('returns [] on non-JSON', () => {
    expect(parseMatchResponse('not json', new Set(['x']), 5)).toEqual([]);
  });
});
