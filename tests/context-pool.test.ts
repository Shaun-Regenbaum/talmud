import { describe, it, expect } from 'vitest';
import {
  fromCommentaryPieces, fromRishonim, fromHalachaRefs, fromMishna, fromTopics,
} from '../src/lib/context/fromSefaria';
import { contextForAnchor, formatContextForPrompt, segsFromMarkInput } from '../src/lib/context/select';
import type { ContextItem } from '../src/lib/context/types';

describe('segsFromMarkInput — instance location → target segments', () => {
  it('expands a startSegIdx..endSegIdx range', () => {
    expect(segsFromMarkInput({ startSegIdx: 2, endSegIdx: 4 })).toEqual([2, 3, 4]);
  });
  it('treats a single segIdx as a one-segment target', () => {
    expect(segsFromMarkInput({ startSegIdx: 5 })).toEqual([5]);
    expect(segsFromMarkInput({ endSegIdx: 3 })).toEqual([3]);
  });
  it('returns [] for a whole-daf instance (no segment location) → contextForAnchor takes all', () => {
    expect(segsFromMarkInput({})).toEqual([]);
    expect(segsFromMarkInput(null)).toEqual([]);
    expect(segsFromMarkInput('nope')).toEqual([]);
  });
  it('clamps negatives and tolerates reversed bounds', () => {
    expect(segsFromMarkInput({ startSegIdx: -2, endSegIdx: 1 })).toEqual([0, 1]);
    expect(segsFromMarkInput({ startSegIdx: 4, endSegIdx: 2 })).toEqual([2, 3, 4]);
  });
});

describe('fromSefaria mappers', () => {
  it('places Rashi/Tosafot pieces on segments via pieceKeys (S:P, 1-based)', () => {
    const items = fromCommentaryPieces('rashi', {
      hebrew: '', english: '', pieces: ['רש"י one', 'רש"י two'], pieceKeys: ['3:1', '5:2'],
    });
    expect(items).toHaveLength(2);
    expect(items[0].segs).toEqual([2]);
    expect(items[1].segs).toEqual([4]);
    expect(items[0].source).toBe('sefaria-rashi');
    expect(items.every((i) => i.via === 'pieceKeys')).toBe(true);
  });

  it('places Mishnayot on segment ranges (already 0-indexed)', () => {
    const items = fromMishna([
      { ref: 'Mishnah Chullin 7:1', anchorRef: 'Chullin 76a:1-3', anchorStartSeg: 0, anchorEndSeg: 2, hebrew: 'משנה', english: 'M' },
    ]);
    expect(items[0].segs).toEqual([0, 1, 2]);
    expect(items[0].via).toBe('mishnah');
  });

  it('anchors Rishonim per comment to the linked segment (via sefaria-link)', () => {
    const rishonim = fromRishonim([
      { label: 'Rashba', ref: 'Rashba on Eruvin 102a:2', hebrew: 'רשב"א', english: 'Rashba text', segStart: 3, segEnd: 3 },
      { label: 'Rosh', ref: 'Rosh, Eruvin 10:5', hebrew: 'רא"ש', english: 'Rosh text', segStart: 5, segEnd: 6 },
    ]);
    expect(rishonim[0].segs).toEqual([3]);
    expect(rishonim[0].via).toBe('sefaria-link');
    expect(rishonim[0].sourceLabel).toBe('Rashba');
    expect(rishonim[1].segs).toEqual([5, 6]); // multi-segment anchor
  });

  it('anchors halacha refs to their linked segment, leaving anchorless ones unplaced', () => {
    const halacha = fromHalachaRefs({
      'Mishneh Torah, Sabbath': [
        { ref: 'Mishneh Torah, Sabbath 25:6', hebrew: 'ה', english: 'MT', segStart: 10, segEnd: 10 },
        { ref: 'Mishneh Torah, Sabbath 25:7', hebrew: 'ה', english: 'MT' }, // no anchorRef
      ],
    });
    expect(halacha).toHaveLength(2);
    expect(halacha[0].segs).toEqual([10]);
    expect(halacha[0].via).toBe('sefaria-link');
    expect(halacha[0].source).toBe('sefaria-halacha');
    expect(halacha[1].segs).toEqual([]);
    expect(halacha[1].via).toBeUndefined();
  });

  it('leaves topics whole-daf (no per-segment anchor)', () => {
    const topics = fromTopics([{ slug: 'tereifah', titleEn: 'Tereifah', sources: [{ ref: 'Chullin 42a' }] }]);
    expect(topics[0].segs).toEqual([]);
    expect(topics[0].via).toBeUndefined();
    expect(topics[0].body?.en).toContain('Sources: Chullin 42a');
  });
});

describe('contextForAnchor — the enrichment seam', () => {
  const items: ContextItem[] = [
    mk('sefaria-rashi', [5]),
    mk('sefaria-mishnah', [0, 1, 2]),
    mk('sefaria-topic', []),
  ];

  it('a segment target pulls overlapping items + whole-daf items', () => {
    const picked = contextForAnchor(items, [1]).map((p) => p.source);
    expect(picked).toContain('sefaria-mishnah'); // overlaps seg 1
    expect(picked).toContain('sefaria-topic');   // whole-daf always in
    expect(picked).not.toContain('sefaria-rashi'); // seg 5, no overlap
  });

  it('a whole-daf target ([]) pulls everything', () => {
    expect(contextForAnchor(items, [])).toHaveLength(3);
  });

  it('respects a source filter and can exclude whole-daf items', () => {
    const picked = contextForAnchor(items, [5], { sources: ['sefaria-rashi'], includeWholeDaf: false });
    expect(picked).toHaveLength(1);
    expect(picked[0].source).toBe('sefaria-rashi');
  });

  it('formats selected items as grouped prompt text', () => {
    const text = formatContextForPrompt(items);
    expect(text).toContain('## sefaria-rashi');
    expect(text).toContain('[seg 5]');
    expect(text).toContain('[whole daf]');
  });
});

function mk(source: ContextItem['source'], segs: number[]): ContextItem {
  return { source, sourceLabel: source, kind: 'x', key: `${source}:${segs.join(',')}`, title: { en: source }, body: { en: 'body' }, segs };
}
