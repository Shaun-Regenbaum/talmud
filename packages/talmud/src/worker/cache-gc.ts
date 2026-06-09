/**
 * Garbage-collect orphaned cache entries — KV entries left behind at a
 * SUPERSEDED cache_version after a def bump.
 *
 * Cache keys are `mark:<id>:<version>:<rest>` / `enrich:<id>:<version>:<rest>`
 * (see cache-keys.ts). A read always builds the key with the def's CURRENT
 * cache_version, so any entry whose version segment differs is unreachable —
 * dead weight that persists forever (the result cache has no TTL). Bumping a
 * def's cache_version (the project does this often) orphans its whole previous
 * generation. This GC deletes exactly those entries and nothing else.
 *
 * Safety: it only ever deletes keys whose parsed version segment is NOT the
 * current version. The `:he` language marker is a LATER segment, so a current
 * Hebrew entry (`<id>:<current>:he:…`) still has version === current and is
 * kept. The version-staleness predicate is unit-tested (the one thing that
 * must never be wrong). Dry-run by default; deletion is bounded by maxDeletes.
 */

/** Minimal KV surface this module needs (a subset of KVNamespace) — keeps it
 *  unit-testable with a fake. */
export interface GcKV {
  list(opts: { prefix: string; cursor?: string; limit?: number }): Promise<{
    keys: Array<{ name: string }>;
    list_complete: boolean;
    cursor?: string;
  }>;
  delete(name: string): Promise<void>;
}

export interface GcTarget {
  /** Version-agnostic id prefix WITH trailing colon, e.g. `mark:argument:`. */
  prefix: string;
  /** The def's current cache_version (e.g. '4'). */
  currentVersion: string;
}

export interface GcResult {
  prefix: string;
  scanned: number;
  stale: number;
  deleted: number;
  /** A few stale keys, for a dry-run preview. */
  sampleStaleKeys: string[];
}

/**
 * The cache_version segment of a key under `prefix`, or null if the key isn't
 * under that prefix. `mark:argument:` must NOT match `mark:argument-move:…` —
 * the trailing colon in the prefix enforces that.
 */
export function versionSegment(keyName: string, prefix: string): string | null {
  if (!keyName.startsWith(prefix)) return null;
  const rest = keyName.slice(prefix.length);
  return rest.split(':')[0] || null;
}

/** True iff the key is a SUPERSEDED-version entry under `prefix` (safe to GC). */
export function isStaleKey(keyName: string, prefix: string, currentVersion: string): boolean {
  const v = versionSegment(keyName, prefix);
  return v !== null && v !== currentVersion;
}

/** Scan one id prefix; delete (unless dryRun) entries at a non-current version. */
export async function gcPrefix(
  cache: GcKV,
  target: GcTarget,
  opts: { dryRun: boolean; maxDeletes: number },
): Promise<GcResult> {
  const out: GcResult = {
    prefix: target.prefix,
    scanned: 0,
    stale: 0,
    deleted: 0,
    sampleStaleKeys: [],
  };
  let cursor: string | undefined;
  for (;;) {
    const res = await cache.list({ prefix: target.prefix, cursor, limit: 1000 });
    for (const k of res.keys) {
      out.scanned++;
      if (!isStaleKey(k.name, target.prefix, target.currentVersion)) continue;
      out.stale++;
      if (out.sampleStaleKeys.length < 5) out.sampleStaleKeys.push(k.name);
      if (!opts.dryRun && out.deleted < opts.maxDeletes) {
        await cache.delete(k.name);
        out.deleted++;
      }
    }
    if (res.list_complete || !res.cursor) break;
    cursor = res.cursor;
  }
  return out;
}

export interface GcSummary {
  dryRun: boolean;
  results: GcResult[];
  totalScanned: number;
  totalStale: number;
  totalDeleted: number;
}

/** GC every target, capping TOTAL deletions at maxDeletes (so a cron pass is a
 *  bounded, gradual cleanup rather than one huge delete burst). */
export async function gcStaleCache(
  cache: GcKV,
  targets: readonly GcTarget[],
  opts: { dryRun?: boolean; maxDeletes?: number } = {},
): Promise<GcSummary> {
  const dryRun = opts.dryRun ?? true;
  let budget = opts.maxDeletes ?? 2000;
  const results: GcResult[] = [];
  for (const t of targets) {
    const r = await gcPrefix(cache, t, { dryRun, maxDeletes: budget });
    budget -= r.deleted;
    results.push(r);
  }
  return {
    dryRun,
    results,
    totalScanned: results.reduce((a, r) => a + r.scanned, 0),
    totalStale: results.reduce((a, r) => a + r.stale, 0),
    totalDeleted: results.reduce((a, r) => a + r.deleted, 0),
  };
}
