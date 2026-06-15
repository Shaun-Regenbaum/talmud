import { describe, expect, it } from 'vitest';
import {
  type ActivityLike,
  liveProducerCounts,
  liveProducerSet,
  producerIdOf,
  rowStatus,
} from '../src/client/runStatus';

// The waterfall stitches two INDEPENDENT sources — live run state (aiActivity)
// and the cached snapshot (/api/daf-runs). These pin the reconciliation so a
// finished, warmed row settles on 'hit' (not the old run -> miss bounce), and
// the producer-id extraction tolerates every warm path's id format.
describe('producerIdOf — id formats from every warm path', () => {
  it('reader path: producer id is the first segment', () => {
    expect(producerIdOf('pesukim.why-here:Berakhot:2a:deuteronomy_6_7:en')).toBe(
      'pesukim.why-here',
    );
  });
  it('dev MarksRegistryPanel path: strips the mark:/enrichment: prefix', () => {
    expect(producerIdOf('enrichment:pesukim.why-here:Berakhot:2a:en')).toBe('pesukim.why-here');
    expect(producerIdOf('mark:rabbi:Berakhot:2a:en')).toBe('rabbi');
  });
});

describe('liveProducerSet / counts — collapse instances to producer', () => {
  const acts: Record<string, ActivityLike> = {
    a: { id: 'pesukim.why-here:Berakhot:2a:i1:en', state: { kind: 'loading' } },
    b: { id: 'pesukim.why-here:Berakhot:2a:i2:en', state: { kind: 'queued' } },
    c: { id: 'rabbi.location:Berakhot:2a:abaye:en', state: { kind: 'ok' } },
    d: { id: 'aggadata.synthesis:Berakhot:2a:i1:en', state: { kind: 'loading' } },
  };
  it('only loading/queued count; instances collapse to one producer', () => {
    const set = liveProducerSet(acts);
    expect(set.has('pesukim.why-here')).toBe(true);
    expect(set.has('aggadata.synthesis')).toBe(true);
    expect(set.has('rabbi.location')).toBe(false); // terminal 'ok' is not live
    expect(set.size).toBe(2);
  });
  it('counts in-flight instances per producer (the "2 warming" signal)', () => {
    const counts = liveProducerCounts(acts);
    expect(counts.get('pesukim.why-here')).toBe(2);
    expect(counts.get('aggadata.synthesis')).toBe(1);
    expect(counts.has('rabbi.location')).toBe(false);
  });
});

describe('rowStatus — the loading <-> cache reconciliation', () => {
  it('live work wins; else the snapshot hit/miss', () => {
    expect(rowStatus({ loading: true, cached: false })).toBe('run');
    expect(rowStatus({ loading: true, cached: true })).toBe('run');
    expect(rowStatus({ loading: false, cached: true })).toBe('hit');
    expect(rowStatus({ loading: false, cached: false })).toBe('miss');
  });
});
