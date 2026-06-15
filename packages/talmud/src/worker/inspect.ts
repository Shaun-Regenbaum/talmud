/**
 * inspect.ts — pure, KV-injectable helpers behind the dev Inspector's two
 * read-only endpoints (`/api/daf-runs` waterfall + `/api/run-tree` DAG). Kept
 * separate from index.ts so the cache-status logic is unit-testable without a
 * worker (see tests/inspect-*.test.ts).
 *
 * The bug these fix: both endpoints used to probe EVERY enrichment with the
 * whole-daf placeholder instance `{fields:{}}`, and read cost from
 * `usage.cost`. That is correct only for genuinely whole-daf pieces. A
 * PER-INSTANCE enrichment (one per pasuk / halacha / aggadic unit / rabbi /
 * argument move) is cached under a key whose instance_id derives — via
 * instanceIdOf — from the rich mark_input the reader warms with (e.g.
 * `fields.verseRef`). The `{fields:{}}` probe can never reproduce that id, so
 * those rows reported a false "miss / $0 / not cached" even when warmed.
 *
 * The fix: enumerate the target mark's actual instances and probe each one's
 * key, exactly the way the warm path keyed them, then aggregate. instanceIdOf
 * is deliberately shape-tolerant (it reads the same identity fields off either
 * the stored instance or the reader's reshaped mark_input), so the keys match
 * by construction — which the round-trip test pins.
 */

import { instanceIdOf } from './cache-keys';
import { bestStampUsd } from './daf-cost';

/** The slice of a stored entry the inspector needs to report telemetry. */
export interface InspectEntry {
  /** Permanent per-entry cost ledger (CostStamp) stamped at write time. */
  cost?: { billedUsd: number | null; estimatedUsd: number | null } | null;
  /** Raw model usage — `cost` here is OpenRouter's reported figure (absent on
   *  Workers-AI / unpriced models even on a cache hit). */
  usage?: unknown;
  elapsed_ms?: number;
}

/**
 * Canonical per-entry cost for the inspector: the stamped CostStamp ledger
 * (billed-or-estimated USD), the SAME figure daf-cost.ts / the budget guard /
 * the /usage rollup report. Falls back to the raw `usage.cost` for pre-stamp or
 * OpenRouter-only entries, then null. Reading `usage.cost` alone (the old bug)
 * returned null on Workers-AI / unpriced hits — making cached rows show "$0".
 */
export function inspectorCostOf(res: InspectEntry | null | undefined): number | null {
  const stamp = res?.cost;
  if (stamp && (typeof stamp.billedUsd === 'number' || typeof stamp.estimatedUsd === 'number')) {
    return bestStampUsd(stamp);
  }
  const u = res?.usage as { cost?: number } | undefined;
  return typeof u?.cost === 'number' ? u.cost : null;
}

/** Total tokens off a stored entry's raw usage, or null. */
export function tokensOfEntry(res: InspectEntry | null | undefined): number | null {
  const u = res?.usage as { total_tokens?: number } | undefined;
  return typeof u?.total_tokens === 'number' ? u.total_tokens : null;
}

/** One probed instance's telemetry. */
export interface InstanceProbe {
  cached: boolean;
  cost: number | null;
  cold_ms: number | null;
  tokens: number | null;
}

/** A per-instance producer's row, reduced from its instance probes. */
export interface ProbeAggregate {
  /** "Fully cached" — every instance present. The honest fraction is in
   *  `instances`; a partially-warmed producer is cached:false, instances 3/5. */
  cached: boolean;
  /** Sum over cached instances (total spend on the daf), null if none priced. */
  cost: number | null;
  /** Sum of generation time over cached instances — "where the time went". */
  cold_ms: number | null;
  tokens: number | null;
  instances: { total: number; cached: number };
}

/** Reduce per-instance probes into one waterfall/DAG row. */
export function aggregateProbes(probes: InstanceProbe[]): ProbeAggregate {
  const total = probes.length;
  const cachedN = probes.filter((p) => p.cached).length;
  const sum = (xs: (number | null)[]): number | null => {
    const nums = xs.filter((x): x is number => typeof x === 'number');
    return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
  };
  return {
    cached: total > 0 && cachedN === total,
    cost: sum(probes.map((p) => p.cost)),
    cold_ms: sum(probes.map((p) => p.cold_ms)),
    tokens: sum(probes.map((p) => p.tokens)),
    instances: { total, cached: cachedN },
  };
}

/**
 * Probe a per-instance enrichment across all of a mark's instances on a daf and
 * aggregate. `keyFor(instanceId)` builds the cache key (each endpoint passes its
 * own scheme so the inspector keys exactly as that endpoint's single-probe path
 * would — no drift); `get` reads a cached entry (the worker's readCachedResult,
 * or a fake KV in tests). `instances` are the mark's stored `parsed.instances`
 * (raw, fields intact) — passed verbatim through instanceIdOf, the same id the
 * warm path produced from the reader's reshaped mark_input.
 */
export async function probeInstances(
  get: (key: string) => Promise<InspectEntry | null>,
  keyFor: (instanceId: string) => string,
  instances: unknown[],
): Promise<ProbeAggregate> {
  const probes = await Promise.all(
    instances.map(async (inst): Promise<InstanceProbe> => {
      const iid = await instanceIdOf(inst);
      const res = await get(keyFor(iid));
      return {
        cached: !!res,
        cost: inspectorCostOf(res),
        cold_ms: typeof res?.elapsed_ms === 'number' ? res.elapsed_ms : null,
        tokens: tokensOfEntry(res),
      };
    }),
  );
  return aggregateProbes(probes);
}
