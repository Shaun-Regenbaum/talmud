import { describe, expect, it } from 'vitest';
import { keyForEnrichment, slugDaf, slugTractate } from '../src/worker/cache-keys';

// The 'spine' scope is the foundation for tractate-wide pieces that fill in
// incrementally: one shelf per tractate, keyed by tractate only (no page).

const SPINE = { id: 'spine-links', cache_version: '1', scope: 'spine' as const };
const LOCAL = { id: 'argument-overview.flow', cache_version: '1', scope: 'local' as const };
const GLOBAL = { id: 'rabbi.bio', cache_version: '4', scope: 'global' as const };

describe('spine-scope cache key', () => {
  it('keys a spine-scope enrichment by tractate only (no page segment)', () => {
    const k = keyForEnrichment(SPINE, 'links', { tractate: 'Bava Metzia', page: '10b' });
    expect(k).toBe('enrich:spine-links:1:links:bava_metzia');
  });

  it('ignores the page for spine scope (same key regardless of which daf triggered it)', () => {
    const a = keyForEnrichment(SPINE, 'links', { tractate: 'Berakhot', page: '2a' });
    const b = keyForEnrichment(SPINE, 'links', { tractate: 'Berakhot', page: '63b' });
    expect(a).toBe(b);
    expect(a).toBe('enrich:spine-links:1:links:berakhot');
  });

  it('throws when a spine-scope enrichment gets no daf (needs the tractate)', () => {
    expect(() => keyForEnrichment(SPINE, 'links')).toThrow(/spine/);
  });

  it('appends :q_<qualifier> for spine scope too', () => {
    const k = keyForEnrichment(SPINE, 'links', { tractate: 'Berakhot', page: '2a' }, 'abc');
    expect(k).toBe('enrich:spine-links:1:links:berakhot:q_abc');
  });

  it('leaves local + global key shapes unchanged', () => {
    expect(keyForEnrichment(LOCAL, 'ovw', { tractate: 'Berakhot', page: '3b' })).toBe(
      'enrich:argument-overview.flow:1:ovw:berakhot:3b',
    );
    expect(keyForEnrichment(GLOBAL, 'abaye')).toBe('enrich:rabbi.bio:4:abaye');
  });

  it('slugTractate is the tail of slugDaf (shared normalization)', () => {
    expect(slugDaf('Bava Metzia', '10b').split(':')[0]).toBe(slugTractate('Bava Metzia'));
    expect(slugTractate('Bava Metzia')).toBe('bava_metzia');
  });
});
