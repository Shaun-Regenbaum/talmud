/**
 * Self-tracked LLM usage ledger (KV), now a thin wrapper over the shared
 * @corpus/core/telemetry aggregation: every producer call is folded in with
 * addUsageEntry, so /api/usage shows totals + per-producer + per-model +
 * per-ref (per-chapter) + the content-in/out cost split without any bespoke
 * roll-up. One KV key holds the summary + the most recent calls.
 */

import type { UsageEntry, UsageSummary } from '@corpus/core/telemetry/types';
import { addUsageEntry, emptyUsage } from '@corpus/core/telemetry/usage';

const KEY = 'usage:v2';
const LEGACY_KEY = 'usage:v1';
const RECENT_CAP = 100;

/** What's stored: the rolled-up summary + a recent-calls window. */
export interface UsageLedger {
  summary: UsageSummary;
  recent: UsageEntry[];
}

// ── one-time migration from the v1 ledger (preserve the visible numbers) ──────
interface LegacyBucket {
  calls: number;
  costUsd: number;
  inTokens?: number;
  outTokens?: number;
}
interface LegacyEntry {
  ts: number;
  ref: string;
  producer: string;
  model: string;
  in: number;
  out: number;
  cost: number | null;
}
interface LegacySummary {
  calls: number;
  inTokens: number;
  outTokens: number;
  costUsd: number;
  byProducer: Record<string, LegacyBucket>;
  byModel?: Record<string, LegacyBucket>;
  recent: LegacyEntry[];
}

function bucketFromLegacy(b: LegacyBucket) {
  return {
    calls: b.calls,
    tokensIn: b.inTokens ?? 0,
    tokensOut: b.outTokens ?? 0,
    costUsd: b.costUsd,
    // historical entries predate the in/out split.
    costInUsd: 0,
    costOutUsd: 0,
  };
}
function mapBuckets(src: Record<string, LegacyBucket>): UsageSummary['byProducer'] {
  const out: UsageSummary['byProducer'] = {};
  for (const [k, v] of Object.entries(src)) out[k] = bucketFromLegacy(v);
  return out;
}

/** Map the old v1 shape into the core UsageSummary ledger (byRef empty + the
 *  cost split zeroed for historical traffic; new calls fill them). */
function migrateLegacy(s: LegacySummary): UsageLedger {
  const summary: UsageSummary = {
    totals: {
      calls: s.calls,
      tokensIn: s.inTokens,
      tokensOut: s.outTokens,
      costUsd: s.costUsd,
      costInUsd: 0,
      costOutUsd: 0,
    },
    byProducer: mapBuckets(s.byProducer ?? {}),
    byModel: mapBuckets(s.byModel ?? {}),
    byRef: {},
  };
  const recent: UsageEntry[] = (s.recent ?? []).map((e) => ({
    ts: e.ts,
    ref: e.ref,
    producer: e.producer,
    model: e.model,
    tokensIn: e.in,
    tokensOut: e.out,
    costUsd: e.cost,
  }));
  return { summary, recent };
}

export async function readUsage(cache: KVNamespace): Promise<UsageLedger> {
  const raw = await cache.get(KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as UsageLedger;
    } catch {
      /* fall through */
    }
  }
  const legacyRaw = await cache.get(LEGACY_KEY);
  if (legacyRaw) {
    try {
      return migrateLegacy(JSON.parse(legacyRaw) as LegacySummary);
    } catch {
      /* fall through */
    }
  }
  return { summary: emptyUsage(), recent: [] };
}

export async function recordUsage(cache: KVNamespace, e: UsageEntry): Promise<void> {
  const led = await readUsage(cache);
  addUsageEntry(led.summary, e);
  led.recent.unshift(e);
  led.recent = led.recent.slice(0, RECENT_CAP);
  await cache.put(KEY, JSON.stringify(led));
}
