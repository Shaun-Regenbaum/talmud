/**
 * Persistent daily usage/cost rollups. The telemetry ring buffer
 * (`telemetry:v1:recent`) only holds the last 500 calls, so any "total" over
 * it silently undercounts once traffic flows through. These per-day counters
 * give lifetime-accurate totals and a chartable time series.
 *
 * Key layout: one KV entry per UTC day, `usage:daily:v1:<YYYY-MM-DD>`, holding
 * a DailyRollup with grand totals plus byModel / byMark / byEnrichment splits.
 * read-modify-write per record (same raciness the telemetry buffer already
 * accepts — KV has no atomic increment). For an authoritative spend figure we
 * lean on the AI Gateway analytics number; this in-app rollup is what lets us
 * attribute cost per mark / enrichment, which the gateway can't break down.
 */

const PREFIX = 'usage:daily:v1:';
// Keep ~2 years of daily history. These per-day rollups are the durable
// time-series record (the per-call llmcost ledger is only 7 days), so they
// outlive a realistic full-shas warming campaign instead of rotting at 4 months.
// Per-DAF cost is NOT kept here (it would make this doc grow unboundedly with
// warming volume and worsen the read-modify-write raciness) — that lives on the
// permanent cache entries' cost stamp, which is exact and non-racy.
const TTL_S = 60 * 60 * 24 * 730;

export interface UsageDelta {
  ok: boolean;
  cacheHit: boolean;
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  /** null when the model has no known list price (Workers AI etc.). */
  costUsd: number | null;
  /** List-price estimate split (input-side / output-side dollars) so the
   *  dashboard can show where spend went even though OpenRouter bills one
   *  number. Null/absent for unpriced models. */
  costInUsd?: number | null;
  costOutUsd?: number | null;
  markId?: string;
  enrichmentId?: string;
}

export interface UsageBucket {
  calls: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number; // sum of priced calls only (billed-or-est total)
  costInUsd: number; // est input-side dollars
  costOutUsd: number; // est output-side dollars
  pricedCalls: number; // calls we could attach a $ figure to
  unpricedCalls: number; // calls whose model has no list price
}

export interface DailyRollup extends UsageBucket {
  date: string;
  errors: number;
  cacheHits: number;
  byModel: Record<string, UsageBucket>;
  byMark: Record<string, UsageBucket>;
  byEnrichment: Record<string, UsageBucket>;
}

function emptyBucket(): UsageBucket {
  return {
    calls: 0,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    costInUsd: 0,
    costOutUsd: 0,
    pricedCalls: 0,
    unpricedCalls: 0,
  };
}

function applyToBucket(b: UsageBucket, d: UsageDelta): void {
  b.calls += 1;
  b.tokensIn += d.tokensIn;
  b.tokensOut += d.tokensOut;
  if (d.costUsd != null) {
    b.costUsd += d.costUsd;
    b.costInUsd += d.costInUsd ?? 0;
    b.costOutUsd += d.costOutUsd ?? 0;
    b.pricedCalls += 1;
  } else {
    b.unpricedCalls += 1;
  }
}

export function todayUtc(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

function emptyRollup(date: string): DailyRollup {
  return {
    date,
    errors: 0,
    cacheHits: 0,
    byModel: {},
    byMark: {},
    byEnrichment: {},
    ...emptyBucket(),
  };
}

/** Fire-and-forget: increments today's bucket. Pass ctx so it survives the response. */
export function recordUsage(
  env: { CACHE?: KVNamespace },
  ctx: { waitUntil(p: Promise<unknown>): void },
  delta: UsageDelta,
): void {
  if (!env.CACHE) return;
  ctx.waitUntil(writeUsage(env.CACHE, delta));
}

async function writeUsage(cache: KVNamespace, d: UsageDelta): Promise<void> {
  try {
    const date = todayUtc();
    const key = PREFIX + date;
    const existing = await cache.get(key);
    const r: DailyRollup = existing ? (JSON.parse(existing) as DailyRollup) : emptyRollup(date);
    // Top-level totals.
    applyToBucket(r, d);
    if (!d.ok) r.errors += 1;
    if (d.cacheHit) r.cacheHits += 1;
    // Splits.
    if (d.model) {
      const b = (r.byModel[d.model] ??= emptyBucket());
      applyToBucket(b, d);
    }
    if (d.markId) {
      const b = (r.byMark[d.markId] ??= emptyBucket());
      applyToBucket(b, d);
    }
    if (d.enrichmentId) {
      const b = (r.byEnrichment[d.enrichmentId] ??= emptyBucket());
      applyToBucket(b, d);
    }
    await cache.put(key, JSON.stringify(r), { expirationTtl: TTL_S });
  } catch (err) {
    console.warn('[usage-rollup] KV write failed:', String(err));
  }
}

export interface UsageSummary {
  totals: UsageBucket & { errors: number; cacheHits: number };
  /** Per-day series, oldest first, for charting. */
  series: DailyRollup[];
  byModel: Record<string, UsageBucket>;
  byMark: Record<string, UsageBucket>;
  byEnrichment: Record<string, UsageBucket>;
  /** Span actually covered by the returned data. */
  fromDate: string | null;
  toDate: string | null;
}

function mergeBucketInto(
  into: Record<string, UsageBucket>,
  from: Record<string, UsageBucket>,
): void {
  for (const [k, b] of Object.entries(from)) {
    const t = (into[k] ??= emptyBucket());
    t.calls += b.calls;
    t.tokensIn += b.tokensIn;
    t.tokensOut += b.tokensOut;
    t.costUsd += b.costUsd;
    t.costInUsd += b.costInUsd ?? 0;
    t.costOutUsd += b.costOutUsd ?? 0;
    t.pricedCalls += b.pricedCalls;
    t.unpricedCalls += b.unpricedCalls;
  }
}

/** Read and aggregate the daily rollups (most recent `days`, default all). */
export async function readUsageSummary(cache: KVNamespace, days = 120): Promise<UsageSummary> {
  const keys: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const res = (await cache.list({ prefix: PREFIX, cursor, limit: 1000 })) as {
      keys: Array<{ name: string }>;
      list_complete: boolean;
      cursor?: string;
    };
    for (const k of res.keys) keys.push(k.name);
    if (res.list_complete || !res.cursor) break;
    cursor = res.cursor;
  }
  keys.sort(); // lexical sort == chronological for YYYY-MM-DD
  const recent = keys.slice(-days);

  const rollups = await Promise.all(recent.map((k) => cache.get(k)));
  const series: DailyRollup[] = [];
  const totals = { ...emptyBucket(), errors: 0, cacheHits: 0 };
  const byModel: Record<string, UsageBucket> = {};
  const byMark: Record<string, UsageBucket> = {};
  const byEnrichment: Record<string, UsageBucket> = {};

  for (const raw of rollups) {
    if (!raw) continue;
    let r: DailyRollup;
    try {
      r = JSON.parse(raw) as DailyRollup;
    } catch {
      continue;
    }
    series.push(r);
    totals.calls += r.calls;
    totals.tokensIn += r.tokensIn;
    totals.tokensOut += r.tokensOut;
    totals.costUsd += r.costUsd;
    totals.costInUsd += r.costInUsd ?? 0;
    totals.costOutUsd += r.costOutUsd ?? 0;
    totals.pricedCalls += r.pricedCalls;
    totals.unpricedCalls += r.unpricedCalls;
    totals.errors += r.errors;
    totals.cacheHits += r.cacheHits;
    mergeBucketInto(byModel, r.byModel ?? {});
    mergeBucketInto(byMark, r.byMark ?? {});
    mergeBucketInto(byEnrichment, r.byEnrichment ?? {});
  }

  return {
    totals,
    series,
    byModel,
    byMark,
    byEnrichment,
    fromDate: series.length ? series[0].date : null,
    toDate: series.length ? series[series.length - 1].date : null,
  };
}
