import { describe, expect, it } from 'vitest';
import {
  dafGenSentinelKey,
  perInstanceEnrichments,
  wholeDafEnrichmentIds,
} from '../src/worker/workflow-warm';

const MARKS = [
  { id: 'argument-overview', anchor: 'whole-daf' },
  { id: 'daf-background', anchor: 'whole-daf' },
  { id: 'tidbit', anchor: 'whole-daf' },
  { id: 'argument', anchor: 'segment' },
  { id: 'pesukim', anchor: 'segment' },
  { id: 'rabbi', anchor: 'name' },
];

// The two selectors must PARTITION the local enrichments: whole-daf vs
// per-instance, with `argument` excluded from both. If a producer leaked into
// both (or neither), the Workflow would double-run or skip it.
describe('perInstanceEnrichments', () => {
  it('returns {id,targetMark} for non-whole-daf, non-argument local enrichments', () => {
    const out = perInstanceEnrichments(MARKS, [
      { id: 'pesukim.synthesis', scope: 'local', target_mark: 'pesukim' },
      { id: 'rabbi.synthesis', scope: 'local', target_mark: 'rabbi' },
    ]);
    expect(out).toEqual([
      { id: 'pesukim.synthesis', targetMark: 'pesukim' },
      { id: 'rabbi.synthesis', targetMark: 'rabbi' },
    ]);
  });

  it('EXCLUDES whole-daf, argument, global, and no-target enrichments', () => {
    const out = perInstanceEnrichments(MARKS, [
      { id: 'tidbit.essay', scope: 'local', target_mark: 'tidbit' }, // whole-daf
      { id: 'argument.synthesis', scope: 'local', target_mark: 'argument' }, // argument
      { id: 'rabbi.identity', scope: 'global', target_mark: 'rabbi' }, // global
      { id: 'standalone', scope: 'local' }, // no target
    ]);
    expect(out).toEqual([]);
  });

  it('partitions cleanly vs wholeDafEnrichmentIds (no overlap, argument in neither)', () => {
    const enrichments = [
      { id: 'argument-overview.synthesis', scope: 'local', target_mark: 'argument-overview' },
      { id: 'pesukim.synthesis', scope: 'local', target_mark: 'pesukim' },
      { id: 'argument.synthesis', scope: 'local', target_mark: 'argument' },
    ];
    const whole = new Set(wholeDafEnrichmentIds(MARKS, enrichments));
    const perInst = new Set(perInstanceEnrichments(MARKS, enrichments).map((e) => e.id));
    // disjoint
    for (const id of whole) expect(perInst.has(id)).toBe(false);
    // argument excluded from both
    expect(whole.has('argument.synthesis')).toBe(false);
    expect(perInst.has('argument.synthesis')).toBe(false);
    // each non-argument piece is in exactly one bucket
    expect(whole.has('argument-overview.synthesis')).toBe(true);
    expect(perInst.has('pesukim.synthesis')).toBe(true);
  });
});

// The warm Workflow's step list. It must include exactly the WHOLE-DAF
// enrichments (target mark is whole-daf, or none) and exclude per-instance ones —
// the same bucketing the daf-view uses, so the warm surface stays in sync.
describe('wholeDafEnrichmentIds', () => {
  const marks = [
    { id: 'argument-overview', anchor: 'whole-daf' },
    { id: 'daf-background', anchor: 'whole-daf' },
    { id: 'tidbit', anchor: 'whole-daf' },
    { id: 'argument', anchor: 'segment' },
    { id: 'pesukim', anchor: 'segment' },
    { id: 'rabbi', anchor: 'name' },
  ];

  it('includes enrichments whose target mark is whole-daf', () => {
    const ids = wholeDafEnrichmentIds(marks, [
      { id: 'argument-overview.synthesis', scope: 'local', target_mark: 'argument-overview' },
      { id: 'daf-background.synthesis', scope: 'local', target_mark: 'daf-background' },
      { id: 'tidbit.essay', scope: 'local', target_mark: 'tidbit' },
    ]);
    expect(ids.sort()).toEqual([
      'argument-overview.synthesis',
      'daf-background.synthesis',
      'tidbit.essay',
    ]);
  });

  it('EXCLUDES per-instance enrichments (target mark is segment/name)', () => {
    const ids = wholeDafEnrichmentIds(marks, [
      { id: 'pesukim.synthesis', scope: 'local', target_mark: 'pesukim' },
      { id: 'rabbi.synthesis', scope: 'local', target_mark: 'rabbi' },
      { id: 'argument.synthesis', scope: 'local', target_mark: 'argument' },
    ]);
    expect(ids).toEqual([]);
  });

  it('includes enrichments with NO target mark', () => {
    const ids = wholeDafEnrichmentIds(marks, [{ id: 'standalone.synthesis', scope: 'local' }]);
    expect(ids).toEqual(['standalone.synthesis']);
  });

  it('excludes non-local (global/entity) enrichments', () => {
    const ids = wholeDafEnrichmentIds(marks, [
      { id: 'rabbi.identity', scope: 'global', target_mark: 'rabbi' },
      { id: 'daf-background.synthesis', scope: 'local', target_mark: 'daf-background' },
    ]);
    expect(ids).toEqual(['daf-background.synthesis']);
  });

  it('treats an unknown target mark as NOT whole-daf (excluded — safe default)', () => {
    const ids = wholeDafEnrichmentIds(marks, [
      { id: 'x.synthesis', scope: 'local', target_mark: 'does-not-exist' },
    ]);
    expect(ids).toEqual([]);
  });

  it('is empty for an empty registry', () => {
    expect(wholeDafEnrichmentIds([], [])).toEqual([]);
  });
});

// The /api/daf-generate single-flight sentinel. N concurrent readers of the
// same daf+lang MUST land on the same key (so they coalesce onto one Workflow),
// and EN/HE must differ (they generate distinct pieces). A silent prefix/format
// change here would break single-flight (every reader starts its own Workflow),
// so the format is pinned byte-for-byte.
describe('dafGenSentinelKey', () => {
  it('is byte-stable per (tractate, page, lang)', () => {
    expect(dafGenSentinelKey('Berakhot', '2a', 'en')).toBe('dafgen:v1:Berakhot:2a:en');
    expect(dafGenSentinelKey('Chullin', '52a', 'he')).toBe('dafgen:v1:Chullin:52a:he');
  });

  it('is identical for the same daf+lang (so concurrent readers coalesce)', () => {
    expect(dafGenSentinelKey('Shabbat', '21b', 'en')).toBe(
      dafGenSentinelKey('Shabbat', '21b', 'en'),
    );
  });

  it('differs by language (EN and HE generate distinct pieces)', () => {
    expect(dafGenSentinelKey('Shabbat', '21b', 'en')).not.toBe(
      dafGenSentinelKey('Shabbat', '21b', 'he'),
    );
  });

  it('differs by daf (no cross-daf coalescing)', () => {
    expect(dafGenSentinelKey('Shabbat', '21a', 'en')).not.toBe(
      dafGenSentinelKey('Shabbat', '21b', 'en'),
    );
  });
});
