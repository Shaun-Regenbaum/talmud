/**
 * Operational admin endpoints over the cache and the background warm, plus the
 * client log sink: GET /api/admin/warm-status, POST /api/admin/strip-ttl,
 * GET /api/admin/cache-stats, POST /api/admin/cache-gc, POST /api/log and
 * GET /api/log/recent.
 *
 * Moved here from index.ts unchanged. Registration order is preserved, and
 * tests/worker-route-table.test.ts pins it.
 */

import type { Hono } from 'hono';
import { gcStaleCache } from '../cache-gc';
import { cacheGcTargets, readCachedCacheStats } from '../cache-stats';
import { readJsonBody } from '../http-helpers';
import { parseJSONAs } from '../kv-json';
import { recordListShape } from '../kv-shapes';
import { isTrustedRequest } from '../request-guards';
import type { Bindings } from '../types';
import {
  getWarmTotal,
  halachaWarmProgressProcessed,
  readHalachaWarmCursor,
  readSefariaWarmCursor,
  readWarmCursor,
  sefariaWarmProgressProcessed,
  warmProgressProcessed,
} from '../warm-cron';

export function registerAdminOpsRoutes(app: Hono<{ Bindings: Bindings }>): void {
  app.get('/api/admin/warm-status', async (c) => {
    const cache = c.env.CACHE;
    if (!cache) return c.json({ error: 'no cache binding' }, 503);
    const cursor = await readWarmCursor(cache);
    const sefariaCursor = await readSefariaWarmCursor(cache);
    const halachaCursor = await readHalachaWarmCursor(cache);
    const total = getWarmTotal();
    const processed = warmProgressProcessed(cursor);
    const sefariaProcessed = sefariaWarmProgressProcessed(sefariaCursor);
    const halachaProcessed = halachaWarmProgressProcessed(halachaCursor);
    return c.json({
      done: cursor.done === true,
      tractateIdx: cursor.tractateIdx,
      amudIdx: cursor.amudIdx,
      processed,
      total,
      percent: total === 0 ? 0 : Math.round((processed / total) * 1000) / 10,
      sefaria: {
        tractateIdx: sefariaCursor.tractateIdx,
        amudIdx: sefariaCursor.amudIdx,
        processed: sefariaProcessed,
        total,
        percent: total === 0 ? 0 : Math.round((sefariaProcessed / total) * 1000) / 10,
        wraps: sefariaCursor.wraps ?? 0,
      },
      halacha: {
        tractateIdx: halachaCursor.tractateIdx,
        amudIdx: halachaCursor.amudIdx,
        processed: halachaProcessed,
        total,
        percent: total === 0 ? 0 : Math.round((halachaProcessed / total) * 1000) / 10,
        wraps: halachaCursor.wraps ?? 0,
      },
    });
  });
  /**
   * One-shot maintenance endpoint: walks a single page (1000 keys) of the
   * given prefix and rewrites any entry that still has an expiration so it
   * becomes infinite-TTL. Returns the next cursor so the caller can loop
   * via curl until `done: true`.
   *
   * Designed for the post-deploy cleanup after dropping TTL from
   * writeCachedResult — existing mark:/enrich: entries still carry their
   * original 90-day expiration baked in at write time. Doing this from KV
   * bindings (not the dashboard API) is ~10× faster.
   *
   * Usage:
   *   while :; do
   *     out=$(curl -s -X POST "https://talmud.shaunregenbaum.com/api/admin/strip-ttl?prefix=enrich:&cursor=$cur")
   *     cur=$(echo "$out" | jq -r .next_cursor)
   *     echo "$out"
   *     [ "$(echo "$out" | jq -r .done)" = "true" ] && break
   *   done
   */
  app.post('/api/admin/strip-ttl', async (c) => {
    if (!isTrustedRequest(c)) return c.json({ error: 'studio auth required' }, 403);
    const cache = c.env.CACHE;
    if (!cache) return c.json({ error: 'no cache binding' }, 503);
    const prefix = c.req.query('prefix');
    if (!prefix) return c.json({ error: 'prefix query param required' }, 400);
    const cursor = c.req.query('cursor') || undefined;

    const list = await cache.list({ prefix, limit: 1000, cursor });
    const withTtl = list.keys.filter((k) => typeof k.expiration === 'number' && k.expiration > 0);
    let rewritten = 0;
    const errors: string[] = [];

    // KV writes are at most ~1000/sec per namespace; reading is faster. Run
    // sequentially per key but in parallel across the page in groups of 25
    // so we don't blow CPU budget on a 1000-key page.
    const GROUP = 25;
    for (let i = 0; i < withTtl.length; i += GROUP) {
      const slice = withTtl.slice(i, i + GROUP);
      await Promise.all(
        slice.map(async (k) => {
          try {
            const v = await cache.get(k.name);
            if (v === null) return; // gone between list and get
            await cache.put(k.name, v); // no expirationTtl → infinite
            rewritten++;
          } catch (err) {
            errors.push(`${k.name}: ${String((err as Error)?.message ?? err).slice(0, 80)}`);
          }
        }),
      );
    }

    return c.json({
      prefix,
      seen: list.keys.length,
      alreadyNoTtl: list.keys.length - withTtl.length,
      rewritten,
      errorCount: errors.length,
      errorsSample: errors.slice(0, 3),
      next_cursor: list.list_complete ? null : list.cursor,
      done: list.list_complete,
    });
  });
  app.get('/api/admin/cache-stats', async (c) => {
    const cache = c.env.CACHE;
    if (!cache) return c.json({ error: 'no cache binding' }, 503);
    // Serve the generator-maintained copy verbatim, stale or not. The READER
    // never runs computeCacheStats: the scan holds thousands of KV values and
    // has OOM'd reader isolates (128 MB) — the generator's warm cron owns
    // refresh (warm-cron refreshStats), same split as the queue/workflow work.
    // The copy is written without TTL, so once populated a miss can't recur.
    const cached = await readCachedCacheStats(cache);
    if (cached) return c.json(cached);
    return c.json({ error: 'cache stats not yet computed (generator cron populates them)' }, 503);
  });
  // GC orphaned cache entries (those left at a superseded cache_version after a
  // def bump — unreachable, no-TTL cruft). Dry-run by default; `?apply=1` deletes
  // (gated by STUDIO_SECRET, since deletion is destructive). `maxDeletes` caps a
  // single pass so a real run is bounded. See src/worker/cache-gc.ts.
  app.post('/api/admin/cache-gc', async (c) => {
    const cache = c.env.CACHE;
    if (!cache) return c.json({ error: 'no cache binding' }, 503);
    const apply = c.req.query('apply') === '1';
    if (apply && !isTrustedRequest(c))
      return c.json({ error: 'deletion requires studio auth (?apply=1)' }, 403);
    const maxDeletes = Math.min(Number(c.req.query('maxDeletes')) || 2000, 20000);
    const targets = await cacheGcTargets(cache);
    const summary = await gcStaleCache(cache, targets, { dryRun: !apply, maxDeletes });
    // Only echo prefixes that actually have stale entries — keeps the report short.
    return c.json({ ...summary, results: summary.results.filter((r) => r.stale > 0) });
  });
  /**
   * Client-side error / miss logger. The browser POSTs a small JSON payload
   * here and we (a) log to console so it surfaces via CF Workers Observability
   * and `wrangler tail`, and (b) keep a rolling ring buffer in KV so we can
   * grep for recurring errors from prod without always tailing. Deliberately
   * unauthenticated + cheap to call.
   */
  app.post('/api/log', async (c) => {
    const parsed = await readJsonBody(c, { ok: false, error: 'bad-json' });
    if (!parsed.ok) return parsed.response;
    const body = parsed.value;
    const rec = {
      ts: new Date().toISOString(),
      ua: c.req.header('user-agent') ?? null,
      cf: (c.req.raw as unknown as { cf?: { country?: string } }).cf ?? null,
      ...(body as Record<string, unknown>),
    };
    // Observability / wrangler tail pick this up.
    console.warn('[client-log]', JSON.stringify(rec));

    const cache = c.env.CACHE;
    if (cache) {
      try {
        const key = 'client-logs:recent';
        const arr = parseJSONAs<unknown[]>(await cache.get(key), recordListShape, key) ?? [];
        arr.push(rec);
        while (arr.length > 500) arr.shift();
        await cache.put(key, JSON.stringify(arr), { expirationTtl: 60 * 60 * 24 * 30 });
      } catch (err) {
        console.warn('[client-log] KV write failed:', String(err));
      }
    }
    return c.json({ ok: true });
  });
  app.get('/api/log/recent', async (c) => {
    const cache = c.env.CACHE;
    if (!cache) return c.json({ error: 'no cache' }, 503);
    const key = 'client-logs:recent';
    const logs = parseJSONAs<unknown[]>(await cache.get(key), recordListShape, key) ?? [];
    return c.json({ logs });
  });
}
