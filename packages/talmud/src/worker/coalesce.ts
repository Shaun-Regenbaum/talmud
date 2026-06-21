/**
 * In-flight request coalescing.
 *
 * When a cold daf is opened the client fires many `/api/run` jobs at once, and
 * each one independently loads the daf's heavy source slices (the full rishonim
 * commentary bundle is multiple MB on a dense daf — Bava Metzia 2b et al.).
 * Parsing N copies of that into the SAME Cloudflare isolate blows the hard
 * 128 MB per-isolate memory limit, the isolate is killed, and every in-flight
 * request returns `error code: 1101` (which the client then can't JSON.parse).
 *
 * `coalesce` collapses concurrent loads of the same key onto ONE shared promise
 * (and thus ONE parsed object in memory) instead of N copies. The entry is
 * dropped the moment it settles, so this is a concurrency dedup, NOT a cache —
 * KV remains the cache, and a caller arriving after settle does its own (fast,
 * KV-backed) load. The returned value MUST be treated as read-only by callers,
 * since concurrent callers share the same object instance.
 */

const inflight = new Map<string, Promise<unknown>>();

export function coalesce<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = (async () => fn())().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, p);
  return p;
}

/** Test-only: number of loads currently in flight. */
export function inflightSize(): number {
  return inflight.size;
}
