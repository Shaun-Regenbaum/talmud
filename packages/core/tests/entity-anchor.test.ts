import { describe, expect, it } from 'vitest';
import { slugId } from '../src/cache/keys.ts';
import { anchorKey, entityAnchor } from '../src/model/anchor.ts';

describe('entityAnchor — the anchor for an entity-spine piece', () => {
  it('is a one-level address: spine + [id] path, precision unit', () => {
    expect(entityAnchor('entity:rabbi', 'rav_huna')).toEqual({
      spine: 'entity:rabbi',
      span: [{ path: ['rav_huna'] }],
      precision: 'unit',
      via: 'entity',
    });
  });

  it('via defaults to "entity" and can be overridden', () => {
    expect(entityAnchor('entity:place', 'sura', 'human').via).toBe('human');
  });

  it('anchorKey is stable and reflects the spine + id (provenance/display excluded)', () => {
    const a = entityAnchor('entity:rabbi', 'abaye');
    const b = entityAnchor('entity:rabbi', 'abaye', 'human'); // different via, same LOCATION
    expect(anchorKey(a)).toBe(anchorKey(b));
    expect(anchorKey(a)).toContain('entity:rabbi');
    expect(anchorKey(a)).not.toBe(anchorKey(entityAnchor('entity:rabbi', 'rava')));
  });

  it('the id is taken verbatim — callers pass the canonical slug', () => {
    // entityAnchor does NOT slug; that is the caller's job (via slugId), so the
    // id stays byte-identical to the cache instance_id it must match.
    expect(entityAnchor('entity:rabbi', slugId('Rav Huna')).span).toEqual([{ path: ['rav_huna'] }]);
  });
});
