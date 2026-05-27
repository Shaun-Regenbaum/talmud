import { describe, it, expect } from 'vitest';
import {
  placementOf, placementLevel, isLocated, isPrecise, isGrounded, isAiGrounded, contextForTarget,
} from '../src/lib/context/placement';
import type { ContextItem } from '../src/lib/context/types';

/** Minimal ContextItem with the placement-relevant fields overridden. */
function item(over: Partial<ContextItem> & { key: string }): ContextItem {
  return {
    source: 'dafyomi:insights', sourceLabel: 'Insights', kind: 'insights',
    title: { en: over.key }, body: { en: 'x' }, segs: [], ...over,
  };
}

describe('placementOf — derives the finest justified level', () => {
  it('words: a tight phrase/AI-quote landing', () => {
    const p = placementOf(item({ key: 'a', segs: [4], hbWords: [10, 11, 12], hbVia: 'ai-phrase', hbConfidence: 0.95 }))!;
    expect(p.level).toBe('words');
    expect(p.words).toEqual([10, 11, 12]);
    expect(p.segs).toEqual([4]);
    expect(p.via).toBe('ai-phrase');
    expect(p.confidence).toBe(0.95);
  });

  it('segment: a whole-segment span (ai-segment / coarse fallback) is NOT word-precise', () => {
    const aiSeg = placementOf(item({ key: 'b', segs: [4], hbWords: [10, 11, 12, 13], hbVia: 'ai-segment', hbConfidence: 0.8 }))!;
    expect(aiSeg.level).toBe('segment');
    expect(aiSeg.confidence).toBe(0.8);
    const fallback = placementOf(item({ key: 'b2', segs: [4], hbWords: [10, 11], hbVia: 'segment', hbConfidence: 0.3 }))!;
    expect(fallback.level).toBe('segment');
  });

  it('segment: server-side placement before HB word resolution', () => {
    const p = placementOf(item({ key: 'c', segs: [2, 3], via: 'tosfos-dh' }))!;
    expect(p.level).toBe('segment');
    expect(p.words).toBeUndefined();
    expect(p.via).toBe('tosfos-dh');
  });

  it('daf: an explicit whole-daf AI grounding (client-resolved or raw)', () => {
    expect(placementOf(item({ key: 'd', segs: [], via: 'ai', hbVia: 'ai-daf', hbConfidence: 0.8 }))!.level).toBe('daf');
    expect(placementOf(item({ key: 'd2', segs: [], via: 'ai', confidence: 0.7 }))!.level).toBe('daf');
  });

  it('amud: a known side with nothing finer', () => {
    const p = placementOf(item({ key: 'e', segs: [], amud: 'b' }))!;
    expect(p.level).toBe('amud');
    expect(p.amud).toBe('b');
    // AI returned whole-daf, but a known amud is more specific — keep it as amud,
    // not a whole-daf collapse (avoids clutter when bulk auto-grounding).
    expect(placementLevel(item({ key: 'e2', segs: [], via: 'ai', amud: 'a', confidence: 0.5 }))).toBe('amud');
  });

  it('null: nothing grounded at all', () => {
    expect(placementOf(item({ key: 'f' }))).toBeNull();
    expect(placementLevel(item({ key: 'f' }))).toBeNull();
  });
});

describe('grounding predicates', () => {
  const words = item({ key: 'w', segs: [4], hbWords: [1], hbVia: 'phrase-in-seg' });
  const seg = item({ key: 's', segs: [4], via: 'mishnah' });
  const daf = item({ key: 'd', segs: [], via: 'ai', hbVia: 'ai-daf' });
  const none = item({ key: 'n' });

  it('isLocated = words|segment; isPrecise = words; isGrounded = any level', () => {
    expect([words, seg, daf, none].map(isLocated)).toEqual([true, true, false, false]);
    expect([words, seg, daf, none].map(isPrecise)).toEqual([true, false, false, false]);
    expect([words, seg, daf, none].map(isGrounded)).toEqual([true, true, true, false]);
  });

  it('isAiGrounded flags anything the AI placer set', () => {
    expect(isAiGrounded(daf)).toBe(true);
    expect(isAiGrounded(item({ key: 'x', segs: [4], hbVia: 'ai-segment', hbWords: [1] }))).toBe(true);
    expect(isAiGrounded(seg)).toBe(false); // deterministic 'mishnah'
  });
});

describe('contextForTarget — the enrichment-facing query', () => {
  const onSeg4 = item({ key: 'words4', segs: [4], hbWords: [1], hbVia: 'ai-phrase', hbConfidence: 0.9 });
  const segOnly4 = item({ key: 'seg4', segs: [4], via: 'tosfos-dh', confidence: 0.6 });
  const elsewhere = item({ key: 'seg9', segs: [9], via: 'mishnah' });
  const wholeDaf = item({ key: 'daf', segs: [], via: 'ai', hbVia: 'ai-daf', hbConfidence: 0.5 });
  const unplaced = item({ key: 'none' });
  const all = [segOnly4, onSeg4, elsewhere, wholeDaf, unplaced];

  it('segment target: items on that seg + whole-daf, finest & most-confident first', () => {
    const got = contextForTarget(all, { seg: 4 }).map((i) => i.key);
    // words (0.9) > segment (0.6) > daf (0.5); seg9 excluded; unplaced excluded
    expect(got).toEqual(['words4', 'seg4', 'daf']);
  });

  it('daf target: everything grounded, unplaced excluded', () => {
    const got = contextForTarget(all, { daf: true }).map((i) => i.key).sort();
    expect(got).toEqual(['daf', 'seg4', 'seg9', 'words4']);
  });
});
