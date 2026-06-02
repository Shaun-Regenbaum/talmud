import { describe, it, expect } from 'vitest';
import {
  sectionHasNamedSpeaker,
  voicesMapEligible,
  voicesShowMap,
  voicesShowFallback,
  type GateProfile,
  type MoveLike,
} from '../../src/lib/typing/profile';

/**
 * Regression guards for the VOICES dispute-map render gate. These lock the two
 * fixes from the June 2026 voices audit:
 *   (a) anti-hallucination — an `opposes` edge on a section with NO named
 *       move-speaker (Chullin 2a's anonymous "hakol shochtin" Mishnah, where the
 *       LLM fabricated a machloket from Chullin 27a) must NOT show the map.
 *   (b) warming race — the map decision reads the LIVE voices graph + the
 *       deterministic profile signals, never the cache-prone `isDispute`, so a
 *       real dispute (Gittin 90a's Beit Hillel/Shammai) is never hidden on a
 *       cold daf. A `resolved` flag distinguishes "still loading" from "settled
 *       without a dispute" so a missing/invalid voices graph still falls back.
 */

const OPPOSES = { edges: [{ kind: 'opposes' }] };
const NO_OPPOSITION = { edges: [{ kind: 'responds-to' }, { kind: 'supports' }] };

describe('sectionHasNamedSpeaker (anti-hallucination signal)', () => {
  const move = (start: number, end: number, rabbiNames: string[], section?: [number, number]): MoveLike => ({
    startSegIdx: start,
    endSegIdx: end,
    fields: {
      rabbiNames,
      sectionStartSegIdx: section?.[0],
      sectionEndSegIdx: section?.[1],
    },
  });

  it('true when a move inside the section names a speaker (parent-section match)', () => {
    const moves = [move(1, 1, ['Rabbi Meir'], [1, 2]), move(2, 2, ['Sages'], [1, 2])];
    expect(sectionHasNamedSpeaker(moves, 1, 2)).toBe(true);
  });

  it('true via segment containment when the parent-section range is absent', () => {
    expect(sectionHasNamedSpeaker([move(3, 3, ['Rava'])], 0, 5)).toBe(true);
  });

  it('false when every move in the section is anonymous (the Chullin 2a case)', () => {
    // seg0-0 "hakol shochtin" — an anonymous opening move, no named speaker.
    const moves = [move(0, 0, []), move(0, 0, [])];
    expect(sectionHasNamedSpeaker(moves, 0, 0)).toBe(false);
  });

  it('ignores named moves that belong to OTHER sections', () => {
    // A named move at seg4-5 must not make the anonymous seg0-0 section a dispute.
    const moves = [move(0, 0, []), move(4, 5, ['Rabbi Yehuda'], [4, 5])];
    expect(sectionHasNamedSpeaker(moves, 0, 0)).toBe(false);
  });

  it('false on an empty move list', () => {
    expect(sectionHasNamedSpeaker([], 0, 3)).toBe(false);
  });
});

describe('voicesMapEligible (deterministic precheck)', () => {
  it('unknown profile → eligible (safe default)', () => {
    expect(voicesMapEligible(undefined)).toBe(true);
  });

  it('aggadata story → ineligible (a narrative is not a dispute map)', () => {
    expect(voicesMapEligible({ primary: 'aggadata', hasNamedSpeaker: true })).toBe(false);
  });

  it('no named speaker → ineligible (anti-hallucination)', () => {
    expect(voicesMapEligible({ primary: 'halacha', hasNamedSpeaker: false })).toBe(false);
  });

  it('named, non-narrative section → eligible', () => {
    expect(voicesMapEligible({ primary: 'halacha', hasNamedSpeaker: true })).toBe(true);
  });

  it('missing hasNamedSpeaker is treated as permissive (only an explicit false suppresses)', () => {
    expect(voicesMapEligible({ primary: 'pure-dialectic' })).toBe(true);
  });
});

describe('voicesShowMap', () => {
  it('shows for an eligible section with live opposition (Gittin 90a Beit Hillel/Shammai)', () => {
    expect(voicesShowMap({ primary: 'halacha', hasNamedSpeaker: true }, OPPOSES)).toBe(true);
  });

  it('does NOT show the fabricated dispute on an anonymous section (Chullin 2a)', () => {
    // Live voices DO carry an opposes edge (the hallucination), but no named speaker.
    expect(voicesShowMap({ primary: 'halacha', hasNamedSpeaker: false }, OPPOSES)).toBe(false);
  });

  it('does not show while voices are still loading (null)', () => {
    expect(voicesShowMap({ primary: 'halacha', hasNamedSpeaker: true }, null)).toBe(false);
  });

  it('does not show when the loaded voices carry no opposition', () => {
    expect(voicesShowMap({ primary: 'halacha', hasNamedSpeaker: true }, NO_OPPOSITION)).toBe(false);
  });

  it('does not show on an aggadata story even with stray opposes edges', () => {
    expect(voicesShowMap({ primary: 'aggadata', hasNamedSpeaker: true }, OPPOSES)).toBe(false);
  });
});

describe('voicesShowFallback', () => {
  const eligible: GateProfile = { primary: 'halacha', hasNamedSpeaker: true };

  it('shows immediately for an ineligible section (aggadata / anonymous)', () => {
    expect(voicesShowFallback({ primary: 'aggadata', hasNamedSpeaker: true }, null, false)).toBe(true);
    expect(voicesShowFallback({ primary: 'halacha', hasNamedSpeaker: false }, null, false)).toBe(true);
  });

  it('shows once resolved without opposition', () => {
    expect(voicesShowFallback(eligible, NO_OPPOSITION, true)).toBe(true);
  });

  it('shows when the synthesis resolved but voices were missing/invalid (no bare render)', () => {
    expect(voicesShowFallback(eligible, null, true)).toBe(true);
  });

  it('does NOT show while an eligible section is still loading', () => {
    expect(voicesShowFallback(eligible, null, false)).toBe(false);
  });

  it('does NOT show when the map is showing (a real dispute)', () => {
    expect(voicesShowFallback(eligible, OPPOSES, true)).toBe(false);
  });
});

describe('map and fallback are mutually exclusive', () => {
  const profiles: (GateProfile | undefined)[] = [
    undefined,
    { primary: 'halacha', hasNamedSpeaker: true },
    { primary: 'halacha', hasNamedSpeaker: false },
    { primary: 'aggadata', hasNamedSpeaker: true },
    { primary: 'pure-dialectic' },
  ];
  const graphs = [null, OPPOSES, NO_OPPOSITION];

  it('never renders both the map and the fallback for any state', () => {
    for (const p of profiles) {
      for (const g of graphs) {
        for (const resolved of [true, false]) {
          const both = voicesShowMap(p, g) && voicesShowFallback(p, g, resolved);
          expect(both, `profile=${JSON.stringify(p)} graph=${JSON.stringify(g)} resolved=${resolved}`).toBe(false);
        }
      }
    }
  });
});
