/**
 * @corpus/core/telemetry — usage aggregation, pure + tested.
 *
 * The single source of truth for how a stream of recorded producer calls rolls
 * up into the usage summary the /usage page shows: totals + per-producer +
 * per-model + per-ref (per-daf / per-chapter) breakdowns, each carrying the
 * content-in / content-out cost split. Workers fold each call in with
 * `addUsageEntry`; `aggregateUsage` re-derives a whole summary from a log (for
 * tests + recompute). Nothing about the breakdown is hand-built per app.
 */

import type { UsageBucket, UsageEntry, UsageSummary } from './types.ts';

function emptyBucket(): UsageBucket {
  return { calls: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, costInUsd: 0, costOutUsd: 0 };
}

export function emptyUsage(): UsageSummary {
  return { totals: emptyBucket(), byProducer: {}, byModel: {}, byRef: {} };
}

function addToBucket(b: UsageBucket, e: UsageEntry): void {
  b.calls += 1;
  b.tokensIn += e.tokensIn;
  b.tokensOut += e.tokensOut;
  b.costUsd += e.costUsd ?? 0;
  b.costInUsd += e.costInUsd ?? 0;
  b.costOutUsd += e.costOutUsd ?? 0;
}

function bucketIn(map: Record<string, UsageBucket>, key: string, e: UsageEntry): void {
  if (!key) return;
  let b = map[key];
  if (!b) {
    b = emptyBucket();
    map[key] = b;
  }
  addToBucket(b, e);
}

/** Fold one call into a summary (mutates + returns it). The canonical
 *  incremental aggregation a worker's ledger uses on every recorded call. */
export function addUsageEntry(summary: UsageSummary, e: UsageEntry): UsageSummary {
  addToBucket(summary.totals, e);
  bucketIn(summary.byProducer, e.producer, e);
  bucketIn(summary.byModel, e.model, e);
  bucketIn(summary.byRef, e.ref, e);
  return summary;
}

/** Re-derive a whole summary from a log of calls (batch). Pure. */
export function aggregateUsage(entries: ReadonlyArray<UsageEntry>): UsageSummary {
  const summary = emptyUsage();
  for (const e of entries) addUsageEntry(summary, e);
  return summary;
}
