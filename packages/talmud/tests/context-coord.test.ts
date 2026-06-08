/**
 * A4 — the cross-daf anchor coordinate (src/lib/context/coord.ts) and its
 * additive wiring into the grounding layer (placement `cross-daf` level,
 * applyMatches carrying `coord`). The in-daf behavior must be unchanged: every
 * existing single-arg placementOf call still resolves exactly as before.
 */
import { describe, it, expect } from 'vitest';
import {
  coordKey, sameDaf, coordForSeg, coordsForSegs, localSeg, isCrossDaf,
  normalizeSpan, spanByDaf, coordFromTarget, spineCoord, DAF_SEG,
} from '@corpus/core/context/coord';
import { coordLabel } from '../src/lib/context/types.ts';
import { placementOf } from '../src/lib/context/placement.ts';
import { applyMatches, type SegMatch } from '../src/lib/context/match.ts';
import type { ContextItem } from '../src/lib/context/types.ts';

const G68 = { tractate: 'Gittin', page: '68a' };
const G67 = { tractate: 'Gittin', page: '67b' };

describe('coord helpers', () => {
  it('coordKey / sameDaf / coordForSeg round-trip', () => {
    const c = coordForSeg(G68, 4);
    expect(c).toEqual({ tractate: 'Gittin', page: '68a', seg: 4 });
    expect(coordKey(c)).toBe('Gittin:68a:4');
    expect(sameDaf(c, G68)).toBe(true);
    expect(sameDaf(c, G67)).toBe(false);
  });

  it('spineCoord addresses a commentary spine; spine-less coords are byte-identical', () => {
    const daf = { tractate: 'Berakhot', page: '2a' };
    // A spine-less (Gemara) coord keys + labels EXACTLY as before.
    expect(coordKey(coordForSeg(daf, 3))).toBe('Berakhot:2a:3');
    // A spine coord defaults to whole-daf-of-the-work and keys distinctly so it
    // never collides with the Gemara segment at the same (tractate, page, seg).
    expect(spineCoord('Rashi', daf)).toEqual({ spine: 'Rashi', tractate: 'Berakhot', page: '2a', seg: DAF_SEG });
    expect(coordKey(spineCoord('Rashi', daf, 3))).toBe('Rashi::Berakhot:2a:3');
    expect(coordKey(spineCoord('Rashi', daf, 3))).not.toBe(coordKey(coordForSeg(daf, 3)));
    expect(coordLabel(spineCoord('Rashi', daf, 3))).toBe('Rashi · Berakhot 2a:3');
    expect(coordLabel(spineCoord('Tosafot', daf))).toBe('Tosafot · Berakhot 2a');
  });

  it('normalizeSpan/spanByDaf collapse mixed-spine coords deterministically', () => {
    const daf = { tractate: 'Berakhot', page: '2a' };
    // Same (tractate, page, seg) on the Gemara and two commentary spines.
    const span = [spineCoord('Tosafot', daf, 3), coordForSeg(daf, 3), spineCoord('Rashi', daf, 3)];
    // All three survive dedup (distinct keys) and sort deterministically by
    // seg then spine ('' < 'Rashi' < 'Tosafot').
    expect(normalizeSpan(span).map(coordKey)).toEqual(['Berakhot:2a:3', 'Rashi::Berakhot:2a:3', 'Tosafot::Berakhot:2a:3']);
    // spanByDaf collapses spine + dedupes the segment (no duplicate seg 3).
    expect(spanByDaf(span)).toEqual([{ tractate: 'Berakhot', page: '2a', segs: [3] }]);
  });

  it('localSeg returns the seg only on its own daf', () => {
    const c = coordForSeg(G67, 9);
    expect(localSeg(c, G67)).toBe(9);
    expect(localSeg(c, G68)).toBeNull();
    expect(isCrossDaf(c, G68)).toBe(true);
    expect(isCrossDaf(c, G67)).toBe(false);
  });

  it('coordsForSegs maps a local range to coordinates', () => {
    expect(coordsForSegs(G68, [1, 2])).toEqual([
      { tractate: 'Gittin', page: '68a', seg: 1 },
      { tractate: 'Gittin', page: '68a', seg: 2 },
    ]);
  });

  it('normalizeSpan dedupes and orders by (tractate, page, seg)', () => {
    const span = [coordForSeg(G68, 3), coordForSeg(G67, 5), coordForSeg(G68, 1), coordForSeg(G68, 3)];
    expect(normalizeSpan(span)).toEqual([
      { tractate: 'Gittin', page: '67b', seg: 5 },
      { tractate: 'Gittin', page: '68a', seg: 1 },
      { tractate: 'Gittin', page: '68a', seg: 3 },
    ]);
  });

  it('spanByDaf groups normalized coords into per-daf segment lists', () => {
    const span = [coordForSeg(G68, 3), coordForSeg(G67, 5), coordForSeg(G68, 1)];
    expect(spanByDaf(span)).toEqual([
      { tractate: 'Gittin', page: '67b', segs: [5] },
      { tractate: 'Gittin', page: '68a', segs: [1, 3] },
    ]);
  });

  it('coordFromTarget bridges the CrossDafAnchor target shape (segIdx default 0)', () => {
    expect(coordFromTarget({ tractate: 'Bava Metzia', page: '59b', segIdx: 2 })).toEqual({ tractate: 'Bava Metzia', page: '59b', seg: 2 });
    expect(coordFromTarget({ tractate: 'Bava Metzia', page: '59b' })).toEqual({ tractate: 'Bava Metzia', page: '59b', seg: 0 });
  });
});

const item = (over: Partial<ContextItem>): ContextItem => ({
  source: 'sefaria-rashi', sourceLabel: 'Rashi', kind: 'rishon', key: 'k', segs: [], ...over,
});

describe('placementOf cross-daf derivation', () => {
  it('derives cross-daf only when a current daf is supplied and the coord is off it', () => {
    const it = item({ segs: [], coord: coordForSeg(G67, 4), via: 'parallel-sugya', confidence: 0.9 });
    const p = placementOf(it, G68);
    expect(p).toEqual({ level: 'cross-daf', segs: [], coord: coordForSeg(G67, 4), via: 'parallel-sugya', confidence: 0.9 });
  });

  it('does not derive cross-daf without a current daf (existing single-arg callers unchanged)', () => {
    const it = item({ segs: [2], coord: coordForSeg(G67, 4) });
    expect(placementOf(it)?.level).toBe('segment');
  });

  it('a coord on the current daf is not cross-daf (falls through to in-daf levels)', () => {
    const it = item({ segs: [2], coord: coordForSeg(G68, 2) });
    expect(placementOf(it, G68)?.level).toBe('segment');
  });

  it('an item with no coord is unaffected by passing a current daf', () => {
    const it = item({ segs: [], amud: 'a' });
    expect(placementOf(it, G68)?.level).toBe('amud');
  });
});

describe('applyMatches carries a cross-daf coord', () => {
  it('places an item with an empty local segs but a coord (no longer a no-op)', () => {
    const items = [item({ key: 'x', segs: [] })];
    const matches: SegMatch[] = [{ key: 'x', segs: [], via: 'parallel-sugya', coord: coordForSeg(G67, 4) }];
    const changed = applyMatches(items, matches);
    expect(changed).toBe(1);
    expect(items[0].coord).toEqual(coordForSeg(G67, 4));
    expect(items[0].segs).toEqual([]);
  });

  it('still treats an empty match with no coord as a no-op', () => {
    const items = [item({ key: 'y', segs: [7], via: 'ai' })];
    const changed = applyMatches(items, [{ key: 'y', segs: [], via: 'ai' }]);
    expect(changed).toBe(0);
    expect(items[0].coord).toBeUndefined();
    expect(items[0].segs).toEqual([7]);
  });

  it('writes BOTH local segs and a cross-daf coord from one match', () => {
    // An item placed in-daf that ALSO anchors cross-daf (a parallel sugya). The
    // two anchors are orthogonal; applyMatches must persist both.
    const items = [item({ key: 'z', segs: [] })];
    const changed = applyMatches(items, [{ key: 'z', segs: [3, 1, 3], via: 'ai', confidence: 0.7, coord: coordForSeg(G67, 9) }]);
    expect(changed).toBe(1);
    expect(items[0].segs).toEqual([1, 3]); // deduped + sorted
    expect(items[0].coord).toEqual(coordForSeg(G67, 9));
  });

  it('a wholeDaf match clears segs yet still carries a coord', () => {
    const items = [item({ key: 'w', segs: [4] })];
    const changed = applyMatches(items, [{ key: 'w', segs: [], via: 'ai', wholeDaf: true, coord: coordForSeg(G67, 2) }]);
    expect(changed).toBe(1);
    expect(items[0].segs).toEqual([]);
    expect(items[0].coord).toEqual(coordForSeg(G67, 2));
  });
});

// These pin the CURRENT branch order + provenance precedence in placementOf's
// cross-daf path, which the happy-path tests above leave unspecified. They are a
// deliberate lock of today's behaviour, not a claim it is the final semantics: a
// future change to which anchor a mixed (segs + off-daf coord) item resolves to
// should update these tests on purpose rather than slip through silently.
describe('placementOf cross-daf — precedence guards', () => {
  it('cross-daf currently wins over local segs when the coord is off-daf and a current daf is given', () => {
    // segs[2] would resolve 'segment' single-arg, but the cross-daf branch is
    // evaluated first, so an off-daf coord + currentDaf takes precedence today.
    const it = item({ segs: [2], coord: coordForSeg(G67, 4), via: 'parallel-sugya' });
    expect(placementOf(it, G68)).toEqual({ level: 'cross-daf', segs: [], coord: coordForSeg(G67, 4), via: 'parallel-sugya', confidence: undefined });
  });

  it('the cross-daf placement reports hbVia/hbConfidence over via/confidence', () => {
    // placementOf prefers the client-resolved HB provenance (hbVia ?? via).
    const it = item({ segs: [], coord: coordForSeg(G67, 4), via: 'ai', confidence: 0.4, hbVia: 'ai-phrase', hbConfidence: 0.95 });
    const p = placementOf(it, G68);
    expect(p?.via).toBe('ai-phrase');
    expect(p?.confidence).toBe(0.95);
  });
});
