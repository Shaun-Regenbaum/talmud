import { describe, it, expect } from 'vitest';
import { sampleAligned } from '../src/worker/cache-stats';

// Prefix-aware in-memory KV with cursor paging, so the sampleSize bound is
// actually exercised (list returns up to `limit` per page).
function makeKV(entries: Record<string, unknown>) {
  const store = new Map<string, string | null>(
    Object.entries(entries).map(([k, v]) => [k, v === null ? null : JSON.stringify(v)]),
  );
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => { store.set(k, v); },
    delete: async (k: string) => { store.delete(k); },
    list: async ({ prefix = '', cursor, limit = 1000 }: { prefix?: string; cursor?: string; limit?: number } = {}) => {
      const all = [...store.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const page = all.slice(start, start + limit);
      const next = start + limit;
      const complete = next >= all.length;
      return { keys: page.map((name) => ({ name })), list_complete: complete, cursor: complete ? undefined : String(next) };
    },
    getWithMetadata: async () => ({ value: null, metadata: null }),
  } as unknown as KVNamespace;
}

// Stand-in for the gemara predicate: aligned iff segments_he is non-empty.
const isAligned = (v: unknown): boolean => {
  const d = v as { segments_he?: unknown[]; __failed?: boolean } | null;
  if (!d || d.__failed) return false;
  return Array.isArray(d.segments_he) && d.segments_he.length > 0;
};

describe('sampleAligned', () => {
  it('counts aligned vs not, skipping __failed and empty values', async () => {
    const kv = makeKV({
      'ctx:gemara:v1:a': { segments_he: ['x', 'y'] },     // aligned
      'ctx:gemara:v1:b': { segments_he: ['z'] },           // aligned
      'ctx:gemara:v1:c': { segments_he: [] },              // cached but not aligned
      'ctx:gemara:v1:d': { __failed: true },               // negative-cache marker -> not aligned
      'other:e': { segments_he: ['nope'] },                // different prefix -> ignored
    });
    const r = await sampleAligned(kv, 'ctx:gemara:v1:', isAligned);
    expect(r).not.toBeNull();
    expect(r!.sampled).toBe(4);   // 4 under the prefix
    expect(r!.aligned).toBe(2);
    expect(r!.pct).toBe(50);
  });

  it('returns null when nothing is cached under the prefix', async () => {
    const kv = makeKV({ 'other:x': { segments_he: ['a'] } });
    expect(await sampleAligned(kv, 'ctx:gemara:v1:', isAligned)).toBeNull();
  });

  it('respects the sample-size bound (does not read the whole prefix)', async () => {
    const entries: Record<string, unknown> = {};
    for (let i = 0; i < 50; i++) entries[`p:${String(i).padStart(3, '0')}`] = { segments_he: ['x'] };
    const kv = makeKV(entries);
    const r = await sampleAligned(kv, 'p:', isAligned, 10);
    expect(r!.sampled).toBe(10);
    expect(r!.aligned).toBe(10);
    expect(r!.pct).toBe(100);
  });

  it('rounds pct to one decimal', async () => {
    const kv = makeKV({
      'p:a': { segments_he: ['x'] },
      'p:b': { segments_he: [] },
      'p:c': { segments_he: [] },
    });
    const r = await sampleAligned(kv, 'p:', isAligned);
    expect(r!.pct).toBeCloseTo(33.3, 5); // 1/3
  });
});
