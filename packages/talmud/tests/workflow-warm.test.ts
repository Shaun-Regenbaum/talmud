import { describe, expect, it } from 'vitest';
import { wholeDafEnrichmentIds } from '../src/worker/workflow-warm';

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
