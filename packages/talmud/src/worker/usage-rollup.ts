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
  /** Prompt-cache hits: the subset of tokensIn billed at the provider's
   *  cache-read rate (~1-10% of list). 0/absent on endpoints without caching. */
  tokensCached?: number;
  /** null when the model has no known list price (Workers AI etc.). */
  costUsd: number | null;
  /** List-price estimate split (input-side / output-side dollars) so the
   *  dashboard can show where spend went even though OpenRouter bills one
   *  number. Null/absent for unpriced models. */
  costInUsd?: number | null;
  costOutUsd?: number | null;
  markId?: string;
  enrichmentId?: string;
  /** The daf this call was generating, so we can count DISTINCT dapim warmed
   *  per day (the denominator for "cost per daf"). Deduped via a cheap sentinel
   *  key — the daily doc only keeps the resulting integer, never the daf list,
   *  so it stays small (see the module note). Absent on non-daf calls. */
  tractate?: string;
  page?: string;
}

export interface UsageBucket {
  calls: number;
  tokensIn: number;
  tokensOut: number;
  /** Prompt-cache hits (subset of tokensIn). Additive field — reads as 0 on
   *  rollup docs stored before it existed. tokensCached / tokensIn = hit rate. */
  tokensCached: number;
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
  /** Distinct dapim that had at least one fresh (non-cached) LLM call this day —
   *  the "cost per daf" denominator. ABSENT on rollup docs written before this
   *  field existed; consumers treat undefined as "not measured" (and fall back
   *  to an estimate) rather than 0, so the two are kept distinct. */
  dafsWarmed?: number;
  byModel: Record<string, UsageBucket>;
  byMark: Record<string, UsageBucket>;
  byEnrichment: Record<string, UsageBucket>;
}

/** Sentinel key: one per (day, daf), TTL just past the day, so the FIRST fresh
 *  call for a daf on a given day increments `dafsWarmed` and the rest don't.
 *  Separate from the daily doc so that doc never holds the per-daf list. */
const DAFSEEN_PREFIX = 'usage:dafseen:v1:';
const DAFSEEN_TTL_S = 60 * 60 * 36;

function emptyBucket(): UsageBucket {
  return {
    calls: 0,
    tokensIn: 0,
    tokensOut: 0,
    tokensCached: 0,
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
  // `b` may be a bucket parsed from a pre-tokensCached rollup doc — coalesce.
  b.tokensCached = (b.tokensCached ?? 0) + (d.tokensCached ?? 0);
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
    // Present (even at 0) on every doc written since the field landed, so a
    // reader can tell a measured day (has the field) from a pre-field one.
    dafsWarmed: 0,
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
    // Is this the first fresh call for this daf today? Check-and-set a cheap
    // sentinel so `dafsWarmed` counts DISTINCT dapim, not calls. Racy (KV has no
    // CAS) but only ever off by the odd double-count — fine for an estimate, and
    // it keeps the daily doc from holding the per-daf list.
    // Only FRESH generation counts as warming a daf. `dafsWarmed` is really
    // "distinct dapim that triggered fresh generation today" — it includes a
    // global enrichment fired from a daf (its cost lands in the same day's total
    // and is attributed to that daf), so the cost-per-daf ratio stays internally
    // consistent: every dollar counted has a daf, and each such daf is counted
    // once. A cache hit is not fresh work, so it never bumps the count.
    let firstDafToday = false;
    if (!d.cacheHit && d.tractate && d.page) {
      const seenKey = `${DAFSEEN_PREFIX}${date}:${d.tractate}:${d.page}`;
      if (!(await cache.get(seenKey))) {
        firstDafToday = true;
        await cache.put(seenKey, '1', { expirationTtl: DAFSEEN_TTL_S });
      }
    }
    const key = PREFIX + date;
    const existing = await cache.get(key);
    const r: DailyRollup = existing ? (JSON.parse(existing) as DailyRollup) : emptyRollup(date);
    // Top-level totals.
    applyToBucket(r, d);
    if (!d.ok) r.errors += 1;
    if (d.cacheHit) r.cacheHits += 1;
    if (firstDafToday) r.dafsWarmed = (r.dafsWarmed ?? 0) + 1;
    // Splits.
    if (d.model) {
      const b = r.byModel[d.model] ?? emptyBucket();
      r.byModel[d.model] = b;
      applyToBucket(b, d);
    }
    if (d.markId) {
      const b = r.byMark[d.markId] ?? emptyBucket();
      r.byMark[d.markId] = b;
      applyToBucket(b, d);
    }
    if (d.enrichmentId) {
      const b = r.byEnrichment[d.enrichmentId] ?? emptyBucket();
      r.byEnrichment[d.enrichmentId] = b;
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
    const t = into[k] ?? emptyBucket();
    into[k] = t;
    t.calls += b.calls;
    t.tokensIn += b.tokensIn;
    t.tokensOut += b.tokensOut;
    t.tokensCached += b.tokensCached ?? 0;
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
    // Normalize docs stored before additive fields existed, so `series`
    // entries actually satisfy the declared shape (consumers chart them raw).
    r.tokensCached ??= 0;
    for (const split of [r.byModel, r.byMark, r.byEnrichment]) {
      for (const b of Object.values(split ?? {})) b.tokensCached ??= 0;
    }
    series.push(r);
    totals.calls += r.calls;
    totals.tokensIn += r.tokensIn;
    totals.tokensOut += r.tokensOut;
    totals.tokensCached += r.tokensCached ?? 0;
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
