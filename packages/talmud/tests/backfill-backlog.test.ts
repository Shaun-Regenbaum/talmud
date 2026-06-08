import { describe, it, expect } from 'vitest';
import { dafFromCacheKey } from '../src/worker/backfill-backlog';
import { slugDaf } from '../src/worker/cache-keys';

// The backfill recovers the display daf from a cached key's trailing slugDaf so
// backfilled `dafs` labels match the live-recorded `${tractate} ${page}` form.
// These guard that inverse mapping + the EN-only (skip :he:) rule.

describe('dafFromCacheKey', () => {
  it('recovers the daf from an enrichment key (instance_id segment in the middle)', () => {
    // enrich:{id}:{ver}:{instance_id}:{slugDaf}
    const key = `enrich:daf-background.concepts:5:abc123:${slugDaf('Berakhot', '2a')}`;
    expect(dafFromCacheKey(key)).toEqual({ tractate: 'Berakhot', page: '2a' });
  });

  it('recovers the daf from a mark key', () => {
    const key = `mark:places:3:${slugDaf('Shabbat', '21b')}`;
    expect(dafFromCacheKey(key)).toEqual({ tractate: 'Shabbat', page: '21b' });
  });

  it('handles multi-word tractates (slug underscores round-trip via the map)', () => {
    const key = `mark:rabbi:2:${slugDaf('Bava Metzia', '59a')}`;
    expect(dafFromCacheKey(key)).toEqual({ tractate: 'Bava Metzia', page: '59a' });
  });

  it('skips the Hebrew namespace (EN is the canonical sighting — no double count)', () => {
    const key = `enrich:daf-background.concepts:5:he:abc123:${slugDaf('Berakhot', '2a')}`;
    expect(dafFromCacheKey(key)).toBeNull();
  });

  it('returns null for a slug that is not a real daf', () => {
    expect(dafFromCacheKey('mark:places:3:not_a_tractate:999z')).toBeNull();
  });
});
