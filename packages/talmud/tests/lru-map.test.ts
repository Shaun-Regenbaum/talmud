import { describe, it, expect } from 'vitest';
import { LruMap } from '../src/lib/lruMap';

describe('LruMap', () => {
  it('behaves like a Map under the cap', () => {
    const m = new LruMap<string, number>(3);
    m.set('a', 1).set('b', 2);
    expect(m.size).toBe(2);
    expect(m.get('a')).toBe(1);
    expect(m.has('b')).toBe(true);
    expect(m.get('missing')).toBeUndefined();
  });

  it('evicts the least-recently-used key when over the cap', () => {
    const m = new LruMap<string, number>(2);
    m.set('a', 1);
    m.set('b', 2);
    m.set('c', 3); // pushes past cap → 'a' (oldest) evicted
    expect(m.size).toBe(2);
    expect(m.has('a')).toBe(false);
    expect(m.has('b')).toBe(true);
    expect(m.has('c')).toBe(true);
  });

  it('a get() bumps recency so the touched key survives eviction', () => {
    const m = new LruMap<string, number>(2);
    m.set('a', 1);
    m.set('b', 2);
    m.get('a');     // 'a' is now most-recently-used
    m.set('c', 3);  // 'b' is now the LRU → evicted, 'a' survives
    expect(m.has('a')).toBe(true);
    expect(m.has('b')).toBe(false);
    expect(m.has('c')).toBe(true);
  });

  it('re-setting an existing key updates its value and bumps recency', () => {
    const m = new LruMap<string, number>(2);
    m.set('a', 1);
    m.set('b', 2);
    m.set('a', 11); // update + bump
    m.set('c', 3);  // 'b' evicted, not 'a'
    expect(m.get('a')).toBe(11);
    expect(m.has('b')).toBe(false);
    expect(m.has('c')).toBe(true);
  });

  it('delete and clear work', () => {
    const m = new LruMap<string, number>(3);
    m.set('a', 1).set('b', 2);
    expect(m.delete('a')).toBe(true);
    expect(m.has('a')).toBe(false);
    m.clear();
    expect(m.size).toBe(0);
  });

  it('rejects a non-positive cap', () => {
    expect(() => new LruMap<string, number>(0)).toThrow();
  });
});
