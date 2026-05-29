/**
 * Hadran / perek-boundary markers (src/lib/typing/markers.ts): deterministic
 * detection of the closing formula + splitting the daf into perek runs.
 */
import { describe, it, expect } from 'vitest';
import { findHadranSegments, findMarkers, perekRuns } from '../../src/lib/typing/markers';

const segs = [
  'תנו רבנן המביא גט',
  'אמר רבא הלכה כרבי',
  'הדרן עלך פרק קמא וסליקא לה מסכתא',   // perek boundary
  'מתני׳ בשלמא',
  'גמרא מאי טעמא',
];

describe('findHadranSegments', () => {
  it('finds the segment with the Hadran formula', () => {
    expect(findHadranSegments(segs)).toEqual([2]);
  });
  it('ignores nikud (normalized match)', () => {
    expect(findHadranSegments(['הֲדַרַן עֲלָךְ פֶּרֶק'])).toEqual([0]);
  });
  it('returns [] when there is no Hadran', () => {
    expect(findHadranSegments(['תנו רבנן', 'אמר רבא'])).toEqual([]);
  });
});

describe('findMarkers', () => {
  it('emits a hadran marker span per boundary', () => {
    expect(findMarkers(segs)).toEqual([{ startSegIdx: 2, endSegIdx: 2, kind: 'hadran' }]);
  });
});

describe('perekRuns', () => {
  it('splits the daf at the Hadran (run ends on the boundary segment)', () => {
    expect(perekRuns(segs)).toEqual([{ start: 0, end: 2 }, { start: 3, end: 4 }]);
  });
  it('a daf with no Hadran is one run', () => {
    expect(perekRuns(['a', 'b', 'c'])).toEqual([{ start: 0, end: 2 }]);
  });
  it('handles a Hadran as the last segment (no trailing run)', () => {
    expect(perekRuns(['a', 'b', 'הדרן עלך'])).toEqual([{ start: 0, end: 2 }]);
  });
  it('empty daf -> no runs', () => {
    expect(perekRuns([])).toEqual([]);
  });
});
