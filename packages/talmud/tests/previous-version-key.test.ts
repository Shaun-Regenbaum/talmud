import { describe, it, expect } from 'vitest';
import { previousVersionKey } from '../src/worker/cache-keys';

describe('previousVersionKey — stale-while-revalidate key', () => {
  it('decrements a numeric enrichment version in the canonical key', () => {
    expect(previousVersionKey('enrich:argument.background:5:abc:berakhot:2a', 'argument.background', '5'))
      .toBe('enrich:argument.background:4:abc:berakhot:2a');
    expect(previousVersionKey('enrich:argument-overview.synthesis:3:abc:berakhot:2a', 'argument-overview.synthesis', '3'))
      .toBe('enrich:argument-overview.synthesis:2:abc:berakhot:2a');
  });
  it('returns null when there is no decrementable previous version', () => {
    expect(previousVersionKey('enrich:x:1:abc', 'x', '1')).toBeNull();   // no v0
    expect(previousVersionKey('enrich:x:5:abc', 'x', 'foo')).toBeNull(); // non-numeric
    expect(previousVersionKey('enrich:x:5:abc', 'x', '5.0')).toBeNull(); // not a plain integer
    expect(previousVersionKey(null, 'x', '5')).toBeNull();              // no key
    expect(previousVersionKey('enrich:y:5:abc', 'x', '5')).toBeNull();  // marker absent
  });
  it('handles :he and global keys (marker is in the prefix)', () => {
    expect(previousVersionKey('enrich:argument.background:5:he:abc:berakhot:2a', 'argument.background', '5'))
      .toBe('enrich:argument.background:4:he:abc:berakhot:2a');
    expect(previousVersionKey('enrich:rabbi.bio:3:abae', 'rabbi.bio', '3')).toBe('enrich:rabbi.bio:2:abae');
  });
});
