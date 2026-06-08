/**
 * Per-daf cost trace from the permanent cache-entry stamps. Each mark cache
 * entry carries a `cost` stamp (see RunResult.cost in index.ts) recording what
 * that entry cost to generate. The cache is permanent, so summing the stamps
 * for ONE daf across a mark's cached versions answers, without re-running
 * anything: "what did the current version of this daf cost, and what did its
 * superseded versions cost". Reads are bounded — one KV get per (mark, version)
 * for the single daf — so this is cheap enough to serve on a drill-down click,
 * unlike a whole-Shas value scan.
 *
 * Enrichments are NOT covered here: local enrichments are keyed by a derived
 * instance id (rabbi name, section title) that can't be reconstructed from the
 * daf alone, and global ones aren't daf-bound. Recent enrichment + source-
 * alignment spend for a daf is available from the per-call ledger
 * (GET /api/admin/llm-cost -> byDaf); this endpoint is the durable MARK record.
 */

import { keyForMark } from './cache-keys';

/** The cost stamp shape written onto each cache entry (subset we read here). */
export interface CostStampLite {
  billedUsd: number | null;
  estimatedUsd: number | null;
  costInUsd: number | null;
  costOutUsd: number | null;
  tokensIn: number;
  tokensOut: number;
  lang?: 'en' | 'he';
  cacheVersion?: string;
}

/** A mark row as produced by computeCacheStats — id/label/current version plus
 *  the count-by-version map (its keys are the version segments, e.g. `5`,
 *  `5:he`, `4`). */
export interface MarkRowLite {
  id: string;
  label: string;
  cache_version: string;
  versions: Record<string, number>;
}

export interface DafVersionCost {
  /** Version segment as it appears in the cache key, e.g. `5` or `5:he`. */
  version: string;
  lang: 'en' | 'he';
  billedUsd: number | null;
  estimatedUsd: number | null;
  costInUsd: number | null;
  costOutUsd: number | null;
  tokensIn: number;
  tokensOut: number;
}

export interface DafMarkCost {
  id: string;
  label: string;
  /** Entries on the mark's CURRENT cache_version (en and/or he). */
  current: DafVersionCost[];
  /** Entries left on a superseded cache_version (still in KV, money already spent). */
  superseded: DafVersionCost[];
  /** billed-or-estimated USD summed across every version of this mark for the daf. */
  totalUsd: number;
}

/** billed cost wins (authoritative, net of prompt-cache); else the list-price
 *  estimate; else 0. Mirrors computeSpendUsd in budget.ts. */
export function bestStampUsd(s: Pick<CostStampLite, 'billedUsd' | 'estimatedUsd'> | null | undefined): number {
  if (!s) return 0;
  if (typeof s.billedUsd === 'number') return s.billedUsd;
  if (typeof s.estimatedUsd === 'number') return s.estimatedUsd;
  return 0;
}

function toVersionCost(version: string, s: CostStampLite): DafVersionCost {
  const lang: 'en' | 'he' = version.endsWith(':he') ? 'he' : 'en';
  return {
    version, lang,
    billedUsd: s.billedUsd ?? null,
    estimatedUsd: s.estimatedUsd ?? null,
    costInUsd: s.costInUsd ?? null,
    costOutUsd: s.costOutUsd ?? null,
    tokensIn: s.tokensIn ?? 0,
    tokensOut: s.tokensOut ?? 0,
  };
}

/**
 * Read one mark's cost stamps for a single daf across every cached version.
 * `mark.versions` enumerates which version segments exist; we reconstruct each
 * one's key for this daf and read its stamp. Entries with no stamp (computed
 * marks, pre-stamp legacy entries) contribute nothing.
 */
export async function dafMarkCost(
  cache: KVNamespace,
  mark: MarkRowLite,
  tractate: string,
  page: string,
): Promise<DafMarkCost> {
  const current: DafVersionCost[] = [];
  const superseded: DafVersionCost[] = [];
  let totalUsd = 0;

  await Promise.all(
    Object.keys(mark.versions).map(async (verKey) => {
      const he = verKey.endsWith(':he');
      const baseVer = he ? verKey.slice(0, -3) : verKey;
      const key = keyForMark(
        { id: mark.id, cache_version: baseVer } as unknown as Parameters<typeof keyForMark>[0],
        tractate, page, he ? 'he' : 'en',
      );
      const raw = await cache.get(key);
      if (!raw) return;
      let entry: { cost?: CostStampLite };
      try { entry = JSON.parse(raw) as { cost?: CostStampLite }; } catch { return; }
      if (!entry.cost) return;
      const vc = toVersionCost(verKey, entry.cost);
      totalUsd += bestStampUsd(entry.cost);
      if (baseVer === mark.cache_version) current.push(vc);
      else superseded.push(vc);
    }),
  );

  current.sort((a, b) => a.lang.localeCompare(b.lang));
  superseded.sort((a, b) => b.version.localeCompare(a.version));
  return { id: mark.id, label: mark.label, current, superseded, totalUsd };
}

export interface DafCostReport {
  tractate: string;
  page: string;
  marks: DafMarkCost[];
  totals: { currentUsd: number; supersededUsd: number; totalUsd: number };
}

/** Assemble the per-daf cost report from the cache-stats mark rows. */
export async function dafCostReport(
  cache: KVNamespace,
  marks: MarkRowLite[],
  tractate: string,
  page: string,
): Promise<DafCostReport> {
  const rows = await Promise.all(marks.map((m) => dafMarkCost(cache, m, tractate, page)));
  const withCost = rows.filter((m) => m.current.length > 0 || m.superseded.length > 0);
  let currentUsd = 0;
  let supersededUsd = 0;
  for (const m of withCost) {
    for (const v of m.current) currentUsd += bestStampUsd(v);
    for (const v of m.superseded) supersededUsd += bestStampUsd(v);
  }
  withCost.sort((a, b) => b.totalUsd - a.totalUsd);
  return {
    tractate, page, marks: withCost,
    totals: { currentUsd, supersededUsd, totalUsd: currentUsd + supersededUsd },
  };
}
