/**
 * The usage dashboard and the bug-report intake behind it.
 *
 * POST /api/report takes a reader's bug report; the dashboard's backlog
 * section lists the reports and POST /api/admin/report-dismiss checks one off.
 * GET /api/usage returns the whole dashboard payload and GET /api/usage/<section>
 * returns one card's worth, from the same builders. GET /api/shas-cost,
 * GET /api/worker-health and GET /api/usage/daf/:tractate/:page round it out.
 *
 * Moved here from index.ts unchanged. Registration order is preserved, and
 * tests/worker-route-table.test.ts pins it.
 */

import type { Hono } from 'hono';
import { z } from 'zod';
import { estimateShasCost } from '../../lib/shasCost';
import { fetchGatewayCost } from '../aigw-analytics';
import { readCachedCacheStats } from '../cache-stats';
import { fetchZoneActivity } from '../cf-zone-analytics';
import { dafCostReport } from '../daf-cost';
import { readJsonBody } from '../http-helpers';
import { parseJSONAs } from '../kv-json';
import { recordListShape } from '../kv-shapes';
import { readLintFailures } from '../lint-failures';
import { applicationKeyHash, fetchOpenRouterCost } from '../openrouter-cost';
import { RECENT_ERRORS_KEY, type RecentJobError } from '../recent-errors';
import { fetchSurfaceUsage } from '../surface-analytics';
import type { TelemetryRecord } from '../telemetry';
import type { Bindings, WaitUntilCtx } from '../types';
import { listObservedConcepts, listObservedPlaces, listUnknownRabbis } from '../unknown-registry';
import { readUsageSummary } from '../usage-rollup';
import { fetchWorkerOutcomes } from '../worker-health';

interface BugReport {
  ts: number;
  tractate: string;
  page: string;
  description: string;
  ua: string | null;
  country: string | null;
}

// ---------------------------------------------------------------------------
// The shapes this page accepts back out of KV
// ---------------------------------------------------------------------------

/** All three external-analytics sub-caches answer the same envelope: did we
 *  have credentials, did the query work, and then a pile of optional figures
 *  that every panel already renders with a default. A value that fails is
 *  refetched, which is what the 5-minute TTL does anyway. */
const analyticsResultShape = z.looseObject({ configured: z.boolean(), ok: z.boolean() });

/** The checked-off set: report ids. */
const dismissedShape = z.array(z.number());

/** A cached section body. It is served back verbatim and its age is read from
 *  `generatedAt` with a fallback, so nothing inside is required. */
const usageSectionShape = z.looseObject({});

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

// ===========================================================================
// Usage dashboard — section builders + endpoints
//
// The dashboard is built from independent sections (cost / activity / telemetry
// / backlog / health). Each has a pure builder below, so the full `/api/usage`
// payload and the per-section endpoints (`/api/usage/<section>`) share one
// implementation. Splitting them lets the client load and render each card on
// its own — a slow section (or the slow cache-stats scan) no longer blocks the
// headline cost numbers. Every endpoint is stale-while-revalidate cached.
// ===========================================================================

type UsageCtx = { env: Bindings; executionCtx: WaitUntilCtx };

// External analytics, sub-cached 5 min so the dashboard refresh doesn't hammer
// the CF analytics API.
async function loadAigwCached(
  c: UsageCtx,
  cache?: KVNamespace,
): Promise<Awaited<ReturnType<typeof fetchGatewayCost>>> {
  if (!cache) return fetchGatewayCost(c.env);
  const hit = parseJSONAs<Awaited<ReturnType<typeof fetchGatewayCost>>>(
    await cache.get('aigw-cost:v1'),
    analyticsResultShape,
    'aigw-cost:v1',
  );
  if (hit) return hit;
  const fresh = await fetchGatewayCost(c.env);
  c.executionCtx.waitUntil(
    cache.put('aigw-cost:v1', JSON.stringify(fresh), { expirationTtl: 300 }),
  );
  return fresh;
}
// Authoritative billed spend from OpenRouter's own ledger (the invoice), sub-
// cached 5 min like the gateway figure. This is the real "Total spent" — the
// gateway number under-prices price-routed DeepSeek (see openrouter-cost.ts).
async function loadOpenRouterCostCached(
  c: UsageCtx,
  cache?: KVNamespace,
): Promise<Awaited<ReturnType<typeof fetchOpenRouterCost>>> {
  if (!cache) return fetchOpenRouterCost(c.env);
  const billingKey = `or-cost:application-key:v2:${await applicationKeyHash(c.env.OPENROUTER_API_KEY ?? '')}`;
  const hit = parseJSONAs<Awaited<ReturnType<typeof fetchOpenRouterCost>>>(
    await cache.get(billingKey),
    analyticsResultShape,
    billingKey,
  );
  if (hit) return hit;
  const fresh = await fetchOpenRouterCost(c.env);
  c.executionCtx.waitUntil(cache.put(billingKey, JSON.stringify(fresh), { expirationTtl: 300 }));
  return fresh;
}
async function loadActivityCached(
  c: UsageCtx,
  cache?: KVNamespace,
): Promise<Awaited<ReturnType<typeof fetchZoneActivity>>> {
  if (!cache) return fetchZoneActivity(c.env);
  const hit = parseJSONAs<Awaited<ReturnType<typeof fetchZoneActivity>>>(
    await cache.get('zone-activity:v1'),
    analyticsResultShape,
    'zone-activity:v1',
  );
  if (hit) return hit;
  const fresh = await fetchZoneActivity(c.env);
  c.executionCtx.waitUntil(
    cache.put('zone-activity:v1', JSON.stringify(fresh), { expirationTtl: 300 }),
  );
  return fresh;
}

interface TelemetryRollup {
  count: number;
  cacheHits: number;
  cacheHitRate: number;
  p50Ms: number;
  p95Ms: number;
  errorCount: number;
  errorsByKind: Record<string, number>;
}
function rollupTelemetry(rows: TelemetryRecord[]): TelemetryRollup {
  const sorted = rows.map((r) => r.ms).sort((a, b) => a - b);
  const hits = rows.filter((r) => r.cache_hit).length;
  const errors = rows.filter((r) => !r.ok);
  const errorsByKind: Record<string, number> = {};
  for (const e of errors)
    errorsByKind[e.error_kind ?? 'other'] = (errorsByKind[e.error_kind ?? 'other'] ?? 0) + 1;
  return {
    count: rows.length,
    cacheHits: hits,
    cacheHitRate: rows.length ? hits / rows.length : 0,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    errorCount: errors.length,
    errorsByKind,
  };
}

async function buildTelemetrySection(cache?: KVNamespace) {
  const telRaw = cache ? await cache.get('telemetry:v1:recent') : null;
  const telemetry =
    parseJSONAs<TelemetryRecord[]>(telRaw, recordListShape, 'telemetry:v1:recent') ?? [];
  // Group dynamically over whatever endpoint/mark/enrichment values appear, so
  // the dashboard stays correct without code changes as new producers record.
  const group = (
    key: (r: TelemetryRecord) => string | undefined,
  ): Record<string, TelemetryRollup> => {
    const buckets = new Map<string, TelemetryRecord[]>();
    for (const r of telemetry) {
      const k = key(r);
      if (k == null) continue;
      const arr = buckets.get(k) ?? [];
      arr.push(r);
      buckets.set(k, arr);
    }
    const out: Record<string, TelemetryRollup> = {};
    for (const [k, rows] of buckets) out[k] = rollupTelemetry(rows);
    return out;
  };
  const recentErrors = telemetry
    .filter((r) => !r.ok)
    .slice(-30)
    .reverse()
    .map((r) => ({
      ts: r.ts,
      endpoint: r.endpoint,
      tractate: r.tractate,
      page: r.page,
      error_kind: r.error_kind,
      model: r.model,
      mark_id: r.mark_id,
      enrichment_id: r.enrichment_id,
    }));
  return {
    perEndpoint: group((r) => r.endpoint),
    perMark: group((r) => r.mark_id),
    perEnrichment: group((r) => r.enrichment_id),
    recentErrors,
    totalCount: telemetry.length,
  };
}

async function buildCostSection(c: UsageCtx, cache?: KVNamespace) {
  const [selfTracked, aiGateway, openRouter, telRaw] = await Promise.all([
    cache ? readUsageSummary(cache) : null,
    loadAigwCached(c, cache),
    loadOpenRouterCostCached(c, cache),
    cache ? cache.get('telemetry:v1:recent') : null,
  ]);
  // Cost avoided by serving cache hits, over the recent telemetry window. Each
  // hit's telemetry record recomputes what the call WOULD have cost from the
  // stamped usage, so this is "money the cache saved us" without re-charging.
  const telemetry =
    parseJSONAs<TelemetryRecord[]>(telRaw, recordListShape, 'telemetry:v1:recent') ?? [];
  let avoidedUsd = 0;
  let avoidedCalls = 0;
  for (const r of telemetry) {
    if (r.cache_hit && typeof r.cost_usd === 'number') {
      avoidedUsd += r.cost_usd;
      avoidedCalls += 1;
    }
  }
  return {
    selfTracked,
    aiGateway,
    openRouter,
    costAvoided: { recentUsd: Math.round(avoidedUsd * 1e6) / 1e6, recentCalls: avoidedCalls },
  };
}

async function buildActivitySection(c: UsageCtx, cache?: KVNamespace) {
  return loadActivityCached(c, cache);
}

const REPORTS_DISMISSED_KEY = 'reports:v1:dismissed';

async function buildBacklogSection(cache?: KVNamespace) {
  const empty = { total: 0, sightings: 0, sample: [] as never[] };
  // Each registry scan is independently guarded: one failing list (subrequest
  // budget, KV hiccup) degrades its own card to empty instead of 500ing the
  // whole backlog endpoint.
  const guarded = <T>(p: Promise<T>): Promise<T | typeof empty> =>
    p.catch((err) => {
      console.error('[usage/backlog] registry scan failed:', err);
      return empty;
    });
  const [rabbis, places, concepts, repRaw, disRaw] = await Promise.all([
    cache ? guarded(listUnknownRabbis(cache)) : empty,
    cache ? guarded(listObservedPlaces(cache)) : empty,
    cache ? guarded(listObservedConcepts(cache)) : empty,
    cache ? cache.get('reports:v1:recent') : null,
    cache ? cache.get(REPORTS_DISMISSED_KEY) : null,
  ]);
  // Bug reports, split into active vs. checked-off ("done"). The dismissed set
  // is a list of report timestamps (a report's `ts` is its id).
  const allReports = [
    ...(parseJSONAs<BugReport[]>(repRaw, recordListShape, 'reports:v1:recent') ?? []),
  ].reverse();
  const dismissed = parseJSONAs<number[]>(disRaw, dismissedShape, REPORTS_DISMISSED_KEY) ?? [];
  const dset = new Set(dismissed);
  const reports = {
    active: allReports.filter((r) => !dset.has(r.ts)),
    done: allReports.filter((r) => dset.has(r.ts)),
  };
  return { rabbis, places, concepts, reports };
}

async function buildHealthSection(cache?: KVNamespace) {
  const [jeRaw, lintFailures] = await Promise.all([
    cache ? cache.get(RECENT_ERRORS_KEY) : null,
    readLintFailures(cache),
  ]);
  const jobErrors = (parseJSONAs<RecentJobError[]>(jeRaw, recordListShape, RECENT_ERRORS_KEY) ?? [])
    .slice(-30)
    .reverse();
  return { jobErrors, lintFailures };
}

/**
 * Generic stale-while-revalidate dispatcher for a usage section. Serves the
 * cached value instantly; once past `freshMs` it refreshes in the background
 * (a best-effort lock collapses concurrent rebuilds). A true cold miss builds
 * synchronously. `build` returns the section data; this stamps `generatedAt`.
 */
async function serveUsageSection<T>(
  c: { env: Bindings; executionCtx: WaitUntilCtx; json: (v: unknown) => Response },
  cache: KVNamespace | undefined,
  key: string,
  freshMs: number,
  build: () => Promise<T>,
): Promise<Response> {
  if (cache) {
    const cachedRaw = await cache.get(key);
    if (cachedRaw) {
      const parsed = parseJSONAs<Record<string, unknown> & { generatedAt?: string }>(
        cachedRaw,
        usageSectionShape,
        key,
      );
      if (parsed) {
        const age = Date.now() - Date.parse(parsed.generatedAt ?? '');
        const fresh = Number.isFinite(age) && age >= 0 && age < freshMs;
        if (!fresh) {
          const lockKey = `${key}:refreshing`;
          const refreshing = await cache.get(lockKey);
          if (!refreshing) {
            c.executionCtx.waitUntil(
              (async () => {
                try {
                  await cache.put(lockKey, '1', { expirationTtl: 60 });
                  const next = { ...(await build()), generatedAt: new Date().toISOString() };
                  await cache.put(key, JSON.stringify(next), { expirationTtl: 600 });
                } catch (err) {
                  console.warn(`[usage] ${key} background refresh failed:`, err);
                } finally {
                  await cache.delete(lockKey).catch(() => {});
                }
              })(),
            );
          }
        }
        return c.json(parsed);
      }
    }
  }
  const data = { ...(await build()), generatedAt: new Date().toISOString() };
  if (cache) c.executionCtx.waitUntil(cache.put(key, JSON.stringify(data), { expirationTtl: 600 }));
  return c.json(data);
}

export function registerUsageRoutes(app: Hono<{ Bindings: Bindings }>): void {
  app.post('/api/report', async (c) => {
    const parsed = await readJsonBody<{ tractate?: string; page?: string; description?: string }>(
      c,
      {
        ok: false,
        error: 'bad-json',
      },
    );
    if (!parsed.ok) return parsed.response;
    const body = parsed.value;
    const tractate = (body.tractate ?? '').slice(0, 60).trim();
    const page = (body.page ?? '').slice(0, 20).trim();
    const description = (body.description ?? '').slice(0, 4000).trim();
    if (!description) return c.json({ ok: false, error: 'empty description' }, 400);

    const cf = (c.req.raw as unknown as { cf?: { country?: string } }).cf;
    const rec: BugReport = {
      ts: Date.now(),
      tractate,
      page,
      description,
      ua: c.req.header('user-agent') ?? null,
      country: cf?.country ?? null,
    };
    const cache = c.env.CACHE;
    if (cache) {
      try {
        const key = 'reports:v1:recent';
        // recordListShape, not a per-report shape: these are reader-submitted and
        // irreplaceable, so one odd entry must not cost the whole buffer.
        const arr = parseJSONAs<BugReport[]>(await cache.get(key), recordListShape, key) ?? [];
        arr.push(rec);
        while (arr.length > 200) arr.shift();
        await cache.put(key, JSON.stringify(arr), { expirationTtl: 60 * 60 * 24 * 365 });
      } catch (err) {
        console.warn('[report] KV write failed:', String(err));
      }
    }
    console.warn('[bug-report]', JSON.stringify(rec));
    return c.json({ ok: true });
  });

  // Full payload — back-compatible shape. Composed from the same builders; keeps
  // its own SWR so existing clients keep working unchanged.
  app.get('/api/usage', async (c) => {
    const cache = c.env.CACHE;
    const build = async () => {
      const [telemetry, cost, activity, backlog, health] = await Promise.all([
        buildTelemetrySection(cache),
        buildCostSection(c, cache),
        buildActivitySection(c, cache),
        buildBacklogSection(cache),
        buildHealthSection(cache),
      ]);
      return {
        telemetry,
        cost,
        activity,
        unknowns: backlog,
        jobErrors: health.jobErrors,
        lintFailures: health.lintFailures,
        reports: backlog.reports.active, // back-compat: the legacy combined payload
      };
    };
    return serveUsageSection(
      c,
      cache,
      `usage-payload:v2:${await applicationKeyHash(c.env.OPENROUTER_API_KEY ?? '')}`,
      30_000,
      build,
    );
  });

  // Per-section endpoints — the client loads these independently so each card
  // renders as soon as its own data arrives.
  app.get('/api/usage/cost', async (c) =>
    serveUsageSection(
      c,
      c.env.CACHE,
      `usage-cost:v2:${await applicationKeyHash(c.env.OPENROUTER_API_KEY ?? '')}`,
      30_000,
      () => buildCostSection(c, c.env.CACHE),
    ),
  );

  // GET /api/shas-cost — the headline "what would it cost to bring the whole shas
  // online at full depth" estimate, the SAME computation the /usage page shows
  // (estimateShasCost over the cost rollup + cache coverage). Surfaced as a tiny
  // public summary so the AI-paused banner can ground its sponsorship ask in the
  // real remaining figure rather than a hand-typed number. SWR-cached 6h: the
  // estimate drifts slowly (coverage comes from the cron-maintained stats copy).
  app.get('/api/shas-cost', (c) => {
    const cache = c.env.CACHE;
    if (!cache) return c.json({ error: 'no cache binding' }, 503);
    return serveUsageSection(c, cache, 'shas-cost:v1', 6 * 60 * 60 * 1000, async () => {
      const [cost, stats] = await Promise.all([
        buildCostSection(c, cache),
        // Cron-maintained copy only — never computeCacheStats on the reader
        // (the scan has OOM'd reader isolates). Missing only on a fresh
        // namespace; degrade the same way as "no cost data yet".
        readCachedCacheStats(cache),
      ]);
      const self = cost.selfTracked;
      if (!stats || !self || self.totals.costUsd <= 0) return { available: false as const };
      const est = estimateShasCost({
        amudim: stats.total,
        byMark: self.byMark,
        byEnrichment: self.byEnrichment,
        marks: stats.marks,
        enrichments: stats.enrichments,
        gatewayByModel: cost.aiGateway?.byModel,
      });
      if (!est.available) return { available: false as const };
      return {
        available: true as const,
        remainingUsd: est.grossed.remainingUsd,
        fullShasUsd: est.grossed.fullShasUsd,
        incurredUsd: est.grossed.incurredUsd,
        perAmudUsd: est.grossed.perAmudUsd,
        amudim: est.amudim,
      };
    });
  });
  app.get('/api/usage/telemetry', (c) =>
    serveUsageSection(c, c.env.CACHE, 'usage-telemetry:v1', 30_000, () =>
      buildTelemetrySection(c.env.CACHE),
    ),
  );
  app.get('/api/usage/activity', (c) =>
    serveUsageSection(c, c.env.CACHE, 'usage-activity:v1', 60_000, () =>
      buildActivitySection(c, c.env.CACHE),
    ),
  );
  app.get('/api/usage/backlog', (c) =>
    serveUsageSection(c, c.env.CACHE, 'usage-backlog:v1', 60_000, () =>
      buildBacklogSection(c.env.CACHE),
    ),
  );
  app.get('/api/usage/health', (c) =>
    serveUsageSection(c, c.env.CACHE, 'usage-health:v1', 30_000, () =>
      buildHealthSection(c.env.CACHE),
    ),
  );
  // Requests by surface (app / mcp / api) + MCP calls, callers, tools, routes and
  // failures, for BOTH workers (the SQL API is account-level, so talmud's usage
  // page reads tanach's dataset too). See surface-analytics.ts.
  app.get('/api/usage/surfaces', (c) =>
    serveUsageSection(c, c.env.CACHE, 'usage-surfaces:v1', 60_000, () => fetchSurfaceUsage(c.env)),
  );

  // Read-only worker-invocation outcomes (last 15m) from Cloudflare analytics —
  // the same dataset the OOM alert watches. Surfaces `exceededMemory` &c. so the
  // isolate-fatal class is verifiable on demand, and lets the GraphQL field names
  // be confirmed against the live account (the cron alert degrades quietly if the
  // token lacks scope; this route shows exactly why).
  app.get('/api/worker-health', async (c) => {
    // Report BOTH scripts since generation moved to talmud-gen. Top-level fields
    // stay the reader's outcomes (backward-compatible shape); `generator` carries
    // talmud-gen's — that's where the cold-daf OOMs land now.
    const [reader, generator] = await Promise.all([
      fetchWorkerOutcomes(c.env, 15, 'talmud'),
      fetchWorkerOutcomes(c.env, 15, 'talmud-gen'),
    ]);
    return c.json({ ...reader, generator });
  });

  // Check off / restore a bug report (by its timestamp id). Toggles membership in
  // the dismissed set; the backlog payload splits reports into active vs. done
  // from it. Open + reversible — it's dev triage, not destructive.
  app.post('/api/admin/report-dismiss', async (c) => {
    const cache = c.env.CACHE;
    if (!cache) return c.json({ error: 'no cache binding' }, 503);
    let body: { ts?: number; done?: boolean };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'bad JSON body' }, 400);
    }
    if (typeof body.ts !== 'number') return c.json({ error: 'ts (number) required' }, 400);
    const dismissed =
      parseJSONAs<number[]>(
        await cache.get(REPORTS_DISMISSED_KEY),
        dismissedShape,
        REPORTS_DISMISSED_KEY,
      ) ?? [];
    const set = new Set(dismissed);
    if (body.done === false) set.delete(body.ts);
    else set.add(body.ts);
    // Match the reports ring buffer's own 365-day TTL so a done report can't
    // resurface as active when the dismissed entry expires first.
    await cache.put(REPORTS_DISMISSED_KEY, JSON.stringify([...set]), {
      expirationTtl: 60 * 60 * 24 * 365,
    });
    // Invalidate the cached backlog payload AND the legacy combined /api/usage
    // payload (which also carries reports) so the next load reflects the change.
    // The client also updates optimistically.
    c.executionCtx.waitUntil(
      Promise.all([
        cache.delete('usage-backlog:v1').catch(() => {}),
        applicationKeyHash(c.env.OPENROUTER_API_KEY ?? '')
          .then((hash) => cache.delete(`usage-payload:v2:${hash}`))
          .catch(() => {}),
      ]),
    );
    return c.json({ ok: true });
  });

  // Per-daf cost drill-down — "trace this daf". Reads the permanent per-entry
  // cost stamps for one daf across each mark's cached versions (bounded reads):
  // current-version cost vs superseded-version cost. Recent enrichment + source-
  // alignment spend for the daf lives in the per-call ledger (GET
  // /api/admin/llm-cost -> byDaf), which the UI overlays.
  app.get('/api/usage/daf/:tractate/:page', (c) => {
    const cache = c.env.CACHE;
    if (!cache) return c.json({ error: 'no cache binding' }, 503);
    const tractate = c.req.param('tractate');
    const page = c.req.param('page');
    return serveUsageSection(c, cache, `usage-daf:v1:${tractate}:${page}`, 60_000, async () => {
      // Cron-maintained copy only — never computeCacheStats on the reader (the
      // scan has OOM'd reader isolates). Throwing keeps the miss uncached.
      const stats = await readCachedCacheStats(cache);
      if (!stats) throw new Error('cache stats not yet computed (generator cron populates them)');
      return dafCostReport(cache, stats.marks, tractate, page);
    });
  });
}
