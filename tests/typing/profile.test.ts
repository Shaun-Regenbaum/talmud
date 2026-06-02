/**
 * Section typing P1 — the deterministic TypeProfile composition
 * (src/lib/typing/profile.ts). Covers the mechanics (coverage math, claim
 * inclusion, primary selection, nesting, tiebreaks) and the named validation
 * cases from docs/section-typing.md (Ashmedai → aggadata, כולכם → dispute,
 * Berakhot pure-dialectic, 67b remedies → aggadata).
 */
import { describe, it, expect } from 'vitest';
import {
  composeTypeProfile, overlayUncoveredSegs, hasOpposingVoices, registerOf, PRIMARY_FLOOR,
  type LayerInstance, type UnitRange,
} from '../../src/lib/typing/profile';

const unit = (startSegIdx: number, endSegIdx: number): UnitRange => ({ tractate: 'Gittin', page: '67b', startSegIdx, endSegIdx });
const inst = (layer: LayerInstance['layer'], instanceId: string, s: number, e: number, confidence?: number): LayerInstance =>
  ({ layer, instanceId, startSegIdx: s, endSegIdx: e, confidence });

describe('composeTypeProfile — mechanics', () => {
  it('computes coverage as the fraction of unit segments a claim covers', () => {
    // unit 0..3 (4 segs); halacha covers 1..2 → 2/4 = 0.5.
    const p = composeTypeProfile(unit(0, 3), [inst('halacha', 'h1', 1, 2)]);
    expect(p.claims).toHaveLength(1);
    expect(p.claims[0]).toMatchObject({ layer: 'halacha', segs: [1, 2], coverage: 0.5 });
  });

  it('excludes instances that do not touch the unit, clips those that overhang', () => {
    const p = composeTypeProfile(unit(2, 4), [
      inst('aggadata', 'a-out', 5, 9),   // entirely after the unit → excluded
      inst('halacha', 'h-over', 0, 3),   // overhangs start → clipped to {2,3}
    ]);
    expect(p.claims.map((c) => c.instanceId)).toEqual(['h-over']);
    expect(p.claims[0].segs).toEqual([2, 3]);
  });

  it('sorts claims by coverage descending', () => {
    const p = composeTypeProfile(unit(0, 9), [
      inst('pesukim', 'p', 0, 0),       // 0.1
      inst('aggadata', 'a', 0, 7),      // 0.8
      inst('halacha', 'h', 0, 3),       // 0.4
    ]);
    expect(p.claims.map((c) => c.instanceId)).toEqual(['a', 'h', 'p']);
  });
});

describe('composeTypeProfile — primary selection', () => {
  it('an overlay that materially covers the unit wins primary', () => {
    const p = composeTypeProfile(unit(0, 4), [inst('aggadata', 'story', 0, 4)]);
    expect(p.primary).toBe('aggadata');
  });

  it('falls back to pure-dialectic when no overlay clears the floor (nesting)', () => {
    // a 1-of-6 halacha span is a NESTED claim, not the primary type.
    const p = composeTypeProfile(unit(0, 5), [inst('halacha', 'h', 2, 2)]);
    expect(p.claims).toHaveLength(1);            // still recorded
    expect(p.claims[0].coverage).toBeLessThan(PRIMARY_FLOOR);
    expect(p.primary).toBe('pure-dialectic');     // but doesn't win primary
  });

  it('layer priority breaks ties when two overlays both clear the floor', () => {
    // both cover the whole unit; aggadata (3) outranks halacha (2).
    const p = composeTypeProfile(unit(0, 3), [
      inst('halacha', 'h', 0, 3),
      inst('aggadata', 'a', 0, 3),
    ]);
    expect(p.primary).toBe('aggadata');
  });

  it('confidence weights the primary score', () => {
    // halacha covers slightly less but is fully confident; aggadata barely
    // clears the floor with low confidence → halacha wins despite lower priority.
    const p = composeTypeProfile(unit(0, 9), [
      inst('aggadata', 'a', 0, 4, 0.2),  // coverage .5 × .2 × 3 = 0.30
      inst('halacha', 'h', 0, 8, 1.0),   // coverage .9 × 1 × 2 = 1.80
    ]);
    expect(p.primary).toBe('halacha');
  });

  it('rabbi/places entity layers never become primary', () => {
    const p = composeTypeProfile(unit(0, 3), [inst('rabbi', 'Rava', 0, 3), inst('places', 'Bavel', 0, 3)]);
    expect(p.primary).toBe('pure-dialectic');
    expect(p.claims).toHaveLength(2); // recorded as claims, just not primary-eligible
  });
});

describe('register (mishnah/gemara axis)', () => {
  it('is gemara when no mishnah segments are supplied (the default)', () => {
    expect(composeTypeProfile(unit(0, 3), []).register).toBe('gemara');
    expect(registerOf(unit(0, 3))).toBe('gemara');
    expect(registerOf(unit(0, 3), new Set())).toBe('gemara');
  });

  it('is mishnah when the majority of the unit segments are mishnah', () => {
    // unit 0..3; segs 0,1,2 are mishnah → 3/4 ≥ 0.5.
    const mishnaSegs = new Set([0, 1, 2]);
    expect(composeTypeProfile(unit(0, 3), [], { mishnaSegs }).register).toBe('mishnah');
    expect(registerOf(unit(0, 3), mishnaSegs)).toBe('mishnah');
  });

  it('stays gemara when only a minority brushes the mishnah range', () => {
    // unit 0..3; only seg 0 is mishnah → 1/4 < 0.5.
    expect(registerOf(unit(0, 3), new Set([0]))).toBe('gemara');
  });

  it('is orthogonal to primary: a mishnah unit can be halacha-primary', () => {
    const p = composeTypeProfile(unit(0, 4), [inst('halacha', 'h', 0, 4)], { mishnaSegs: new Set([0, 1, 2, 3, 4]) });
    expect(p.primary).toBe('halacha');
    expect(p.register).toBe('mishnah');
  });
});

describe('isDispute', () => {
  it('is true when the voices graph has an opposes edge', () => {
    expect(hasOpposingVoices({ edges: [{ kind: 'responds-to' }, { kind: 'opposes' }] })).toBe(true);
    const p = composeTypeProfile(unit(0, 3), [], { voices: { edges: [{ kind: 'opposes' }] } });
    expect(p.isDispute).toBe(true);
  });

  it('is false with no opposition or no voices supplied', () => {
    expect(hasOpposingVoices({ edges: [{ kind: 'supports' }, { kind: 'responds-to' }] })).toBe(false);
    expect(composeTypeProfile(unit(0, 3), []).isDispute).toBe(false);
  });

  it('requires a named speaker: an opposes edge on an anonymous section is NOT a dispute', () => {
    // The Chullin 2a pathology — the voices graph fabricates a מחלוקת (an
    // `opposes` edge) on the anonymous "hakol shochtin" Mishnah, which has no
    // named move-speaker. Without a named speaker to ground it, that opposition
    // is a hallucination and must not register as a dispute.
    const p = composeTypeProfile(unit(0, 0), [], { voices: { edges: [{ kind: 'opposes' }] }, hasNamedSpeaker: false });
    expect(p.hasNamedSpeaker).toBe(false);
    expect(p.isDispute).toBe(false);
  });

  it('a named speaker + opposition IS a dispute', () => {
    const p = composeTypeProfile(unit(0, 4), [], { voices: { edges: [{ kind: 'opposes' }] }, hasNamedSpeaker: true });
    expect(p.hasNamedSpeaker).toBe(true);
    expect(p.isDispute).toBe(true);
  });

  it('hasNamedSpeaker defaults to true (permissive) when unknown', () => {
    expect(composeTypeProfile(unit(0, 3), []).hasNamedSpeaker).toBe(true);
  });
});

describe('overlayUncoveredSegs (P0 coverage)', () => {
  it('returns unit segments covered by no content overlay (pure dialectic)', () => {
    // unit 0..5; aggadata covers 0..2 → 3,4,5 are pure-dialectic.
    const segs = overlayUncoveredSegs(unit(0, 5), [inst('aggadata', 'a', 0, 2), inst('rabbi', 'r', 4, 4)]);
    expect(segs).toEqual([3, 4, 5]); // rabbi is an entity layer, not content → doesn't cover
  });
});

describe('named validation cases from the design doc', () => {
  it('Ashmedai unit (story spanning the unit) → primary aggadata', () => {
    const p = composeTypeProfile(
      { tractate: 'Gittin', page: '68a', startSegIdx: 2, endSegIdx: 6 },
      [inst('aggadata', 'ashmedai', 2, 6), inst('rabbi', 'Rav Ashi', 3, 3)],
      { voices: { edges: [{ kind: 'responds-to' }] } }, // a story rendered with responds-to, NOT opposes
    );
    expect(p.primary).toBe('aggadata');
    expect(p.isDispute).toBe(false); // the fix: a story is not a dispute
  });

  it('כולכם unit (dispute, no content overlay) → pure-dialectic primary but isDispute', () => {
    const p = composeTypeProfile(unit(0, 2), [inst('argument', 'sec', 0, 2)], { voices: { edges: [{ kind: 'opposes' }, { kind: 'supports' }] } });
    expect(p.primary).toBe('pure-dialectic');
    expect(p.isDispute).toBe(true);
  });

  it('Berakhot 2a Stam Q&A segments → pure-dialectic, not untyped', () => {
    // segments 5,6,9,10 covered by no content overlay and no opposition.
    const p = composeTypeProfile({ tractate: 'Berakhot', page: '2a', startSegIdx: 5, endSegIdx: 6 }, []);
    expect(p.primary).toBe('pure-dialectic');
    expect(p.isDispute).toBe(false);
  });

  it('67b remedies unit (aggadata covers the majority) → aggadata', () => {
    const p = composeTypeProfile(unit(10, 16), [
      inst('aggadata', 'remedies', 10, 15),  // 6/7 ≈ 0.86
      inst('rabbi', 'Abaye', 11, 11),
    ]);
    expect(p.primary).toBe('aggadata');
  });
});
