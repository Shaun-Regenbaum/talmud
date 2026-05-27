import { describe, it, expect } from 'vitest';
import {
  fromCommentaryPieces, fromRishonim, fromHalachaRefs, fromMishna, fromTopics,
} from '../src/lib/context/fromSefaria';
import { contextForAnchor, formatContextForPrompt } from '../src/lib/context/select';
import type { ContextItem } from '../src/lib/context/types';

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

  it('maps Rishonim, halacha refs, and topics as whole-daf (segs:[])', () => {
    const rishonim = fromRishonim({ Ramban: { hebrew: 'רמב"ן', english: 'Ramban text', ref: 'Ramban on Chullin 76a' } });
    const halacha = fromHalachaRefs({ 'Shulchan Arukh, YD 55:1': [{ ref: 'Shulchan Arukh, YD 55:1', hebrew: 'ה', english: 'SA' }] });
    const topics = fromTopics([{ slug: 'tereifah', titleEn: 'Tereifah', sources: [{ ref: 'Chullin 42a' }] }]);
    for (const it of [rishonim[0], halacha[0], topics[0]]) {
      expect(it.segs).toEqual([]);
      expect(it.via).toBeUndefined();
    }
    expect(rishonim[0].sourceLabel).toBe('Ramban');
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
