import {
  isAiGrounded,
  isLocated,
  isReferenceSource,
  placementLevel,
  placementOf,
} from '@corpus/core/context/placement';
import type { ContextItem } from '@corpus/core/context/types';
import { describe, expect, it } from 'vitest';

/** Minimal ContextItem with the placement-relevant fields overridden. */
function item(over: Partial<ContextItem> & { key: string }): ContextItem {
  return {
    source: 'dafyomi:insights',
    sourceLabel: 'Insights',
    kind: 'insights',
    title: { en: over.key },
    body: { en: 'x' },
    segs: [],
    ...over,
  };
}

describe('placementOf — derives the finest justified level', () => {
  it('words: a tight phrase/AI-quote landing', () => {
    const p = placementOf(
      item({ key: 'a', segs: [4], hbWords: [10, 11, 12], hbVia: 'ai-phrase', hbConfidence: 0.95 }),
    )!;
    expect(p.level).toBe('words');
    expect(p.words).toEqual([10, 11, 12]);
    expect(p.segs).toEqual([4]);
    expect(p.via).toBe('ai-phrase');
    expect(p.confidence).toBe(0.95);
  });

  it('segment: a whole-segment span (ai-segment / coarse fallback) is NOT word-precise', () => {
    const aiSeg = placementOf(
      item({
        key: 'b',
        segs: [4],
        hbWords: [10, 11, 12, 13],
        hbVia: 'ai-segment',
        hbConfidence: 0.8,
      }),
    )!;
    expect(aiSeg.level).toBe('segment');
    expect(aiSeg.confidence).toBe(0.8);
    const fallback = placementOf(
      item({ key: 'b2', segs: [4], hbWords: [10, 11], hbVia: 'segment', hbConfidence: 0.3 }),
    )!;
    expect(fallback.level).toBe('segment');
  });

  it('segment: server-side placement before HB word resolution', () => {
    const p = placementOf(item({ key: 'c', segs: [2, 3], via: 'tosfos-dh' }))!;
    expect(p.level).toBe('segment');
    expect(p.words).toBeUndefined();
    expect(p.via).toBe('tosfos-dh');
  });

  it('daf: an explicit whole-daf AI grounding (client-resolved or raw)', () => {
    expect(
      placementOf(item({ key: 'd', segs: [], via: 'ai', hbVia: 'ai-daf', hbConfidence: 0.8 }))!
        .level,
    ).toBe('daf');
    expect(placementOf(item({ key: 'd2', segs: [], via: 'ai', confidence: 0.7 }))!.level).toBe(
      'daf',
    );
  });

  it('amud: a known side with nothing finer', () => {
    const p = placementOf(item({ key: 'e', segs: [], amud: 'b' }))!;
    expect(p.level).toBe('amud');
    expect(p.amud).toBe('b');
    // AI returned whole-daf, but a known amud is more specific — keep it as amud,
    // not a whole-daf collapse (avoids clutter when bulk auto-grounding).
    expect(
      placementLevel(item({ key: 'e2', segs: [], via: 'ai', amud: 'a', confidence: 0.5 })),
    ).toBe('amud');
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

  it('isLocated = words|segment (the segment grounding downstream consumes)', () => {
    expect([words, seg, daf, none].map(isLocated)).toEqual([true, true, false, false]);
  });

  it('isAiGrounded flags anything the AI placer set', () => {
    expect(isAiGrounded(daf)).toBe(true);
    expect(isAiGrounded(item({ key: 'x', segs: [4], hbVia: 'ai-segment', hbWords: [1] }))).toBe(
      true,
    );
    expect(isAiGrounded(seg)).toBe(false); // deterministic 'mishnah'
  });

  it('isReferenceSource flags daf-level reference sources only', () => {
    expect(isReferenceSource(item({ key: 'h', source: 'sefaria-halacha' }))).toBe(true);
    expect(isReferenceSource(item({ key: 't', source: 'sefaria-topic' }))).toBe(true);
    expect(isReferenceSource(item({ key: 'r', source: 'sefaria-rishonim' }))).toBe(false);
    expect(isReferenceSource(item({ key: 'i', source: 'dafyomi:insights' }))).toBe(false);
  });
});
