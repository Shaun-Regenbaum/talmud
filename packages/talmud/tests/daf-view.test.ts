import { describe, expect, it } from 'vitest';
import { dafViewCacheControl, dafViewCompleteness, pieceKey } from '../src/worker/daf-view';

describe('dafViewCacheControl', () => {
  it('caches a COMPLETE view hard at the edge (warm dapim served from the colo)', () => {
    const cc = dafViewCacheControl(true);
    expect(cc).toContain('public');
    expect(cc).toMatch(/max-age=3600/);
    expect(cc).toMatch(/stale-while-revalidate=86400/);
  });

  it('keeps a PARTIAL (still-warming) view short so it refreshes as pieces fill in', () => {
    const cc = dafViewCacheControl(false);
    expect(cc).toContain('public');
    expect(cc).toMatch(/max-age=20\b/);
    expect(cc).not.toContain('stale-while-revalidate'); // don't pin a stale partial
  });
});

describe('pieceKey', () => {
  it('uses the producer id for whole-daf / mark pieces', () => {
    expect(pieceKey('rabbi')).toBe('rabbi');
    expect(pieceKey('argument-overview')).toBe('argument-overview');
  });
  it('appends the instance id for per-instance pieces', () => {
    expect(pieceKey('pesukim.synthesis', 'abaye')).toBe('pesukim.synthesis::abaye');
  });
  it('does not collide a whole-daf piece with a per-instance one of the same producer', () => {
    expect(pieceKey('x')).not.toBe(pieceKey('x', 'i'));
  });
});

describe('dafViewCompleteness', () => {
  it('is complete only when nothing is cold', () => {
    const r = dafViewCompleteness([
      { producerId: 'rabbi', cold: false },
      { producerId: 'argument-overview', cold: false },
    ]);
    expect(r.complete).toBe(true);
    expect(r.cold).toEqual([]);
  });

  it('lists cold producers and flips complete to false', () => {
    const r = dafViewCompleteness([
      { producerId: 'rabbi', cold: false },
      { producerId: 'tidbit', cold: true },
      { producerId: 'geography', cold: true },
    ]);
    expect(r.complete).toBe(false);
    expect(r.cold.sort()).toEqual(['geography', 'tidbit']);
  });

  it('dedups a per-instance producer that contributes multiple entries', () => {
    // pesukim.synthesis enumerated once per instance; some cold, some warm.
    const r = dafViewCompleteness([
      { producerId: 'pesukim.synthesis', cold: false },
      { producerId: 'pesukim.synthesis', cold: true },
      { producerId: 'pesukim.synthesis', cold: true },
    ]);
    expect(r.cold).toEqual(['pesukim.synthesis']); // one entry, not three
    expect(r.complete).toBe(false);
  });

  it('an empty registry is trivially complete', () => {
    expect(dafViewCompleteness([])).toEqual({ complete: true, cold: [] });
  });

  it('IGNORES a cold demand-driven producer (lazy pin must not block completeness)', () => {
    // The real bug: rabbi.identity.pin is fetched on-demand, so it's uncached on
    // an otherwise fully-warm daf — it must not flip complete to false (which
    // would deny the daf its hard edge cache).
    const r = dafViewCompleteness([
      { producerId: 'rabbi', cold: false },
      { producerId: 'tidbit', cold: false },
      { producerId: 'rabbi.identity.pin', cold: true, demandDriven: true },
    ]);
    expect(r.complete).toBe(true);
    expect(r.cold).toEqual([]);
  });

  it('still flags a cold NON-demand-driven producer alongside a demand-driven one', () => {
    const r = dafViewCompleteness([
      { producerId: 'rabbi.identity.pin', cold: true, demandDriven: true },
      { producerId: 'tidbit', cold: true },
    ]);
    expect(r.complete).toBe(false);
    expect(r.cold).toEqual(['tidbit']);
  });
});
