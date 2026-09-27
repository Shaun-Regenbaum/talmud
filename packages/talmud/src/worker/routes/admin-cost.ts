/**
 * Admin endpoints for what the worker spends and what it can reach:
 * GET /api/admin/llm-cost (the per-call cost ledger runLLM writes),
 * GET /api/admin/budget and POST /api/admin/budget/reset (the spend pause),
 * and GET /api/admin/hb-probe (a HebrewBooks fetch probe).
 *
 * Moved here from index.ts unchanged. The probe travels with the budget
 * endpoints because Hono matches in registration order and these four are
 * consecutive; tests/worker-route-table.test.ts pins that order.
 */

import { budgetStatus, clearPauses } from '@corpus/core/llm/budget';
import type { Hono } from 'hono';
import { z } from 'zod';
import { fetchHebrewBooksDaf } from '../../lib/sefref/hebrewbooks/client';
import { coalesce } from '../coalesce';
import { parseJSONAs } from '../kv-json';
import { isTrustedRequest } from '../request-guards';
import type { Bindings } from '../types';

/**
 * GET /api/admin/llm-cost — sum the per-call cost ledger (llmcost:v1:*) that
 * runLLM writes. Unique-key entries, so the totals are exact even under the
 * 50-way concurrent queue. Used to size the rabbi.observations backfill.
 *
 *   ?since=<unix-ms>  only count calls at/after this timestamp
 *   ?clear=1          delete the ledger (reset before a measurement window)
 */
interface LlmCostRec {
  ts: number;
  model: string;
  transport: string;
  tag: string;
  attempts: number;
  ms: number;
  cost: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  /** Prompt-cache hits: subset of prompt_tokens billed at the cache-read rate.
   *  Additive — null on entries written before it existed AND on endpoints
   *  without prompt caching. */
  cached_tokens?: number | null;
  // Attribution (additive; null on entries written before it existed).
  cost_in_est?: number | null;
  cost_out_est?: number | null;
  kind?: string | null;
  producer_id?: string | null;
  tractate?: string | null;
  page?: string | null;
  lang?: string | null;
  cache_version?: string | null;
  cost_class?: string | null;
}

/** One recorded model call. Only the timestamp is required: the scan below
 *  compares it without a default (a record without one would sort into the
 *  window at random), and every other field is already read behind a typeof
 *  check, so an older record missing one still counts. */
const llmCostRecShape = z.looseObject({ ts: z.number() });

export function registerAdminCostRoutes(app: Hono<{ Bindings: Bindings }>): void {
  app.get('/api/admin/llm-cost', async (c) => {
    const cache = c.env.CACHE;
    if (!cache) return c.json({ error: 'no cache binding' }, 503);
    const prefix = 'llmcost:v1:';

    if (c.req.query('clear') === '1') {
      if (!isTrustedRequest(c))
        return c.json({ error: 'clearing the cost ledger requires studio auth' }, 403);
      let cursor: string | undefined;
      let deleted = 0;
      do {
        const res = await cache.list({ prefix, cursor, limit: 1000 });
        for (const k of res.keys) {
          await cache.delete(k.name);
          deleted++;
        }
        cursor = res.list_complete ? undefined : res.cursor;
      } while (cursor && deleted < 50000);
      return c.json({ cleared: deleted });
    }

    const since = parseInt(c.req.query('since') ?? '0', 10) || 0;
    // This endpoint scans up to 10k ledger entries with sequential KV reads — a
    // heavy per-request workload. A polling /usage dashboard (or several open at
    // once) fired it concurrently, and N simultaneous scans on one isolate blew
    // the 128 MB limit (exceededMemory -> 1101, killing co-tenant reader requests).
    // Serve a short-lived cached aggregate and coalesce concurrent recomputes onto
    // ONE scan, so a cache-miss stampede can't recur.
    const reportKey = `llmcost-report:v1:${since}`;
    const cachedReport = await cache.get(reportKey);
    if (cachedReport) {
      return new Response(cachedReport, {
        headers: { 'content-type': 'application/json', 'x-cache': 'hit' },
      });
    }
    const payload = await coalesce(reportKey, async () => {
      // Hard cap the scan. Each request reads every ledger key sequentially, so a
      // large ledger (heavy warming) made one scan take ~25s and exhaust the
      // isolate — outcome `exceededMemory`, which kills the WHOLE isolate and so
      // took out co-tenant reader requests too (collateral 1101s). The coalesce +
      // 45s cache above stops a concurrent stampede, but a single scan must also be
      // bounded: 1000 entries (one list page) completes in ~2s well within limits.
      // `truncated` signals the partial total; full-history accuracy wants an
      // incremental background rollup (reading only new entries since a checkpoint)
      // rather than rescanning the whole ledger per request — tracked as follow-up.
      // SCAN_CAP also has to respect the per-request SUBREQUEST limit (~1000): each
      // ledger entry is one KV get, plus the list + cache get/put. 800 leaves
      // headroom so a full scan can't throw "too many subrequests" (which surfaced
      // as a 500 once batching made the reads fast enough to reach the cap). Match
      // the list page size so the first page can't overshoot the cap.
      const SCAN_CAP = 800;
      const keys: string[] = [];
      let cursor: string | undefined;
      do {
        const res = await cache.list({ prefix, cursor, limit: SCAN_CAP });
        for (const k of res.keys) keys.push(k.name);
        cursor = res.list_complete ? undefined : res.cursor;
      } while (cursor && keys.length < SCAN_CAP);
      if (keys.length > SCAN_CAP) keys.length = SCAN_CAP;

      let totalCost = 0;
      let totalCostInEst = 0;
      let totalCostOutEst = 0;
      let calls = 0;
      let callsWithCost = 0;
      let promptTokens = 0;
      let completionTokens = 0;
      let cachedTokens = 0;
      let minTs = Number.POSITIVE_INFINITY;
      let maxTs = 0;
      const byModel: Record<
        string,
        {
          calls: number;
          cost: number;
          promptTokens: number;
          completionTokens: number;
          cachedTokens: number;
        }
      > = {};
      const byTag: Record<string, { calls: number; cost: number }> = {};
      const byKind: Record<string, { calls: number; cost: number }> = {};
      // Per-daf recent spend (7-day ledger window). The permanent per-daf record is
      // the cache-entry cost stamp; this is the live drill-down for what just ran.
      const byDaf: Record<
        string,
        { calls: number; cost: number; costInEst: number; costOutEst: number }
      > = {};

      // Read in parallel batches. 1000 sequential KV gets at ~25ms each took ~25s
      // and tripped the request time limit (a 1102 after the memory fixes). Batched,
      // one scan finishes in well under a second; the batch size keeps in-flight
      // memory trivial.
      const READ_BATCH = 50;
      for (let bi = 0; bi < keys.length; bi += READ_BATCH) {
        const raws = await Promise.all(
          keys.slice(bi, bi + READ_BATCH).map(async (k) => ({ key: k, raw: await cache.get(k) })),
        );
        for (const { key, raw } of raws) {
          const r = parseJSONAs<LlmCostRec>(raw, llmCostRecShape, key);
          if (!r) continue;
          if (since && r.ts < since) continue;
          calls++;
          if (typeof r.cost === 'number') {
            totalCost += r.cost;
            callsWithCost++;
          }
          if (typeof r.cost_in_est === 'number') totalCostInEst += r.cost_in_est;
          if (typeof r.cost_out_est === 'number') totalCostOutEst += r.cost_out_est;
          if (typeof r.prompt_tokens === 'number') promptTokens += r.prompt_tokens;
          if (typeof r.completion_tokens === 'number') completionTokens += r.completion_tokens;
          if (typeof r.cached_tokens === 'number') cachedTokens += r.cached_tokens;
          if (r.ts < minTs) minTs = r.ts;
          if (r.ts > maxTs) maxTs = r.ts;
          const m = byModel[r.model] ?? {
            calls: 0,
            cost: 0,
            promptTokens: 0,
            completionTokens: 0,
            cachedTokens: 0,
          };
          byModel[r.model] = m;
          m.calls++;
          m.cost += r.cost ?? 0;
          m.promptTokens += r.prompt_tokens ?? 0;
          m.completionTokens += r.completion_tokens ?? 0;
          m.cachedTokens += r.cached_tokens ?? 0;
          const t = byTag[r.tag] ?? { calls: 0, cost: 0 };
          byTag[r.tag] = t;
          t.calls++;
          t.cost += r.cost ?? 0;
          const kindKey = r.kind ?? 'untagged';
          const k = byKind[kindKey] ?? { calls: 0, cost: 0 };
          byKind[kindKey] = k;
          k.calls++;
          k.cost += r.cost ?? 0;
          if (r.tractate && r.page) {
            const dafKey = `${r.tractate}:${r.page}`;
            const d = byDaf[dafKey] ?? {
              calls: 0,
              cost: 0,
              costInEst: 0,
              costOutEst: 0,
            };
            byDaf[dafKey] = d;
            d.calls++;
            d.cost += r.cost ?? 0;
            d.costInEst += r.cost_in_est ?? 0;
            d.costOutEst += r.cost_out_est ?? 0;
          }
        }
      }

      const round = (n: number) => Math.round(n * 1e6) / 1e6;
      for (const m of Object.values(byModel)) m.cost = round(m.cost);
      for (const t of Object.values(byTag)) t.cost = round(t.cost);
      for (const k of Object.values(byKind)) k.cost = round(k.cost);
      for (const d of Object.values(byDaf)) {
        d.cost = round(d.cost);
        d.costInEst = round(d.costInEst);
        d.costOutEst = round(d.costOutEst);
      }

      const result = {
        totalCostUsd: round(totalCost),
        // List-price input/output split (est) — OpenRouter bills one number, so the
        // in/out ratio is estimated; totalCostUsd stays billed-authoritative.
        estInputCostUsd: round(totalCostInEst),
        estOutputCostUsd: round(totalCostOutEst),
        calls,
        callsWithCost,
        promptTokens,
        completionTokens,
        // Prompt-cache hit volume (subset of promptTokens billed at cache-read
        // rates). cachedTokens / promptTokens = the live cache hit rate.
        cachedTokens,
        window: { from: calls ? minTs : null, to: calls ? maxTs : null },
        byModel,
        byTag,
        byKind,
        byDaf,
        truncated: keys.length >= SCAN_CAP,
      };
      const json = JSON.stringify(result);
      // Short TTL collapses a burst of dashboard polls into one scan. 60s is the
      // Cloudflare KV MINIMUM (a put with ttl < 60 throws "Invalid expiration_ttl",
      // which is what made #450's cache silently never populate — so every request
      // re-scanned and the OOM persisted). Keep it at exactly the floor for
      // freshness.
      await cache.put(reportKey, json, { expirationTtl: 60 });
      return json;
    });
    return new Response(payload, {
      headers: { 'content-type': 'application/json', 'x-cache': 'miss' },
    });
  });
  /**
   * GET /api/admin/budget — spend-budget snapshot: today's total spend, this
   * hour's custom-question spend, the caps, and any active pause latches. Read-
   * only (open). See ./budget.
   */
  app.get('/api/admin/budget', async (c) => {
    return c.json(await budgetStatus(c.env));
  });
  /**
   * POST /api/admin/budget/reset — manually lift the pause latches (trusted only).
   * The bucket counters keep accruing in their window, so if spend is still over
   * the cap the next call re-arms the pause immediately.
   */
  app.post('/api/admin/budget/reset', async (c) => {
    if (!isTrustedRequest(c)) return c.json({ error: 'studio auth required' }, 403);
    const cleared = await clearPauses(c.env);
    return c.json({ ok: true, ...cleared });
  });
  /**
   * GET /api/admin/hb-probe — diagnose HebrewBooks fetch failures from the
   * WORKER's egress (Cloudflare network), which is what actually matters (it
   * works fine from a browser/ISP). Fetches a few dafim raw (no cache) and
   * reports status/latency/error per daf.
   *
   *   ?tractate=Berakhot&pages=2a,5a,10a,15b,20a
   *   ?concurrent=1   fire them all at once (replicates the backfill's burst)
   */
  app.get('/api/admin/hb-probe', async (c) => {
    const tractate = c.req.query('tractate') ?? 'Berakhot';
    const pages = (c.req.query('pages') ?? '2a,5a,10a,15b,20a')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const concurrent = c.req.query('concurrent') === '1';

    const probeOne = async (page: string) => {
      const t0 = Date.now();
      try {
        const d = await fetchHebrewBooksDaf(tractate, page);
        return {
          page,
          ok: true,
          ms: Date.now() - t0,
          mainLen: d.main.length,
          rashiLen: d.rashi.length,
          tosafotLen: d.tosafot.length,
        };
      } catch (e) {
        return {
          page,
          ok: false,
          ms: Date.now() - t0,
          error: String((e as Error)?.message ?? e).slice(0, 300),
        };
      }
    };

    const results = concurrent
      ? await Promise.all(pages.map(probeOne))
      : await (async () => {
          const out = [];
          for (const p of pages) out.push(await probeOne(p));
          return out;
        })();

    const ok = results.filter((r) => r.ok).length;
    return c.json({
      tractate,
      mode: concurrent ? 'concurrent' : 'sequential',
      attempted: results.length,
      ok,
      failed: results.length - ok,
      results,
    });
  });
}
