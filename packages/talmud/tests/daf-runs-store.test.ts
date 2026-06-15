import { describe, expect, it } from 'vitest';
import {
  type AnchorPiece,
  cacheProgressOf,
  type DafRun,
  isEagerRow,
  pieceToRun,
} from '../src/client/dafRunsProgress';

describe('pieceToRun — adapt an anchor piece to the RunRow shape', () => {
  const piece = (o: Partial<AnchorPiece> & { producerId: string }): AnchorPiece => ({
    label: o.producerId,
    kind: 'llm',
    cached: true,
    cost: null,
    cold_ms: null,
    tokens: null,
    ...o,
  });
  it('maps producerId->id and derives producer from the dot in the id', () => {
    expect(pieceToRun(piece({ producerId: 'pesukim.why-here', cost: 0.001 }))).toMatchObject({
      id: 'pesukim.why-here',
      producer: 'enrichment',
      cached: true,
      cost: 0.001,
    });
    // a bare mark id (no dot) -> 'mark'
    expect(pieceToRun(piece({ producerId: 'rabbi' })).producer).toBe('mark');
  });
});

// The load bar and the Inspect waterfall now read ONE snapshot (dafRunsStore).
// These pin the reducer the load bar grounds its completion in — the shared
// "what's cached on this daf" fraction — so the two surfaces can't disagree.
const row = (o: Partial<DafRun> & { id: string }): DafRun => ({
  id: o.id,
  label: o.id,
  kind: 'llm',
  producer: 'enrichment',
  cached: false,
  cold_ms: null,
  cost: null,
  tokens: null,
  ...o,
});

describe('isEagerRow — the load bar denominator', () => {
  it('excludes experimental + lazy on-demand leaves (they never auto-warm)', () => {
    expect(isEagerRow(row({ id: 'pesukim.why-here' }))).toBe(true);
    expect(isEagerRow(row({ id: 'daf-background.synthesis' }))).toBe(true);
    expect(isEagerRow(row({ id: 'chart', experimental: true }))).toBe(false);
    expect(isEagerRow(row({ id: 'pesukim.qa' }))).toBe(false);
    expect(isEagerRow(row({ id: 'aggadata.suggested-questions' }))).toBe(false);
  });
});

describe('cacheProgressOf — shared cache fraction (load bar grounding)', () => {
  it('counts per-instance producers by instance units, whole-daf as one', () => {
    const p = cacheProgressOf([
      row({ id: 'pesukim.why-here', instances: { total: 3, cached: 3 } }),
      row({ id: 'rabbi.location', instances: { total: 2, cached: 1 } }),
      row({ id: 'daf-background.synthesis', cached: true }),
    ]);
    // (3+2+1) units, (3+1+1) cached -> 5/6
    expect(p).toEqual({ total: 6, cached: 5, pct: 83 });
  });
  it('drops experimental + lazy rows from BOTH numerator and denominator', () => {
    const p = cacheProgressOf([
      row({ id: 'pesukim.why-here', instances: { total: 2, cached: 2 } }),
      row({ id: 'chart', experimental: true, instances: { total: 5, cached: 0 } }),
      row({ id: 'pesukim.qa', cached: false }),
    ]);
    expect(p).toEqual({ total: 2, cached: 2, pct: 100 });
  });
  it('empty snapshot -> 0% (load bar then rides the live engine alone)', () => {
    expect(cacheProgressOf([])).toEqual({ total: 0, cached: 0, pct: 0 });
  });
});
