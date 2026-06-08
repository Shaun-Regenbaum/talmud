// A Map with a maximum entry count and least-recently-used eviction.
//
// Drop-in for the subset of the Map API our session caches use (get / set /
// has / delete / clear / size). Reading OR writing a key marks it
// most-recently-used; once an insert pushes the size past `max`, the
// least-recently-used key is evicted. This keeps the instant-restore benefit of
// a session cache while bounding memory on a long browsing session that would
// otherwise accumulate one entry per (daf, lang) — or per (anchor, lang) —
// forever.
//
// Implementation leans on Map's insertion-order guarantee: the first key
// returned by keys() is the oldest, and re-inserting a key moves it to the end.
export class LruMap<K, V> {
  private map = new Map<K, V>();

  constructor(private readonly max: number) {
    if (max <= 0) throw new Error('LruMap: max must be > 0');
  }

  get size(): number {
    return this.map.size;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key) as V;
    // Bump to most-recently-used.
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): this {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value as K;
      this.map.delete(oldest);
    }
    return this;
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }
}
