/**
 * The two read-only views over what the background work has already recorded:
 * GET /api/admin/recent-errors (the queue-failure ring buffer) and
 * GET /api/rabbi-observations/:slug (the per-rabbi reverse index built from the
 * daf's entity marks).
 *
 * Moved here from index.ts unchanged. Registration order is preserved, and
 * tests/worker-route-table.test.ts pins it.
 */

import type { Hono } from 'hono';
import { z } from 'zod';
import { prefixForRabbiObs } from '../cache-keys';
import { parseJSONAs } from '../kv-json';
import { recordListShape } from '../kv-shapes';
import type { ObservationSlice } from '../rabbi-observations';
import { RECENT_ERRORS_CAP, RECENT_ERRORS_KEY, type RecentJobError } from '../recent-errors';
import type { Bindings } from '../types';

/** One rabbi's observations for one daf. The route counts by tractate and walks
 *  the list, so those two are required; an observation's own fields are read
 *  with a default and left open. */
const observationSliceShape = z.looseObject({
  tractate: z.string(),
  observations: z.array(z.looseObject({})),
});

/** The cached aggregate the summary view serves back verbatim. Nothing reads
 *  into it here, so the gate only asks that it be an object and not, say, the
 *  truncated half of one. */
const cachedAggregateShape = z.looseObject({});

export function registerObservationRoutes(app: Hono<{ Bindings: Bindings }>): void {
  /**
   * GET /api/admin/recent-errors — read the queue-failure ring buffer. Returns
   * up to RECENT_ERRORS_CAP entries, newest last. Optional `?limit=N` truncates;
   * `?id=places` filters by mark/enrichment id; `?tractate=Pesachim` filters
   * by tractate.
   */
  app.get('/api/admin/recent-errors', async (c) => {
    const cache = c.env.CACHE;
    if (!cache) return c.json({ error: 'CACHE binding not available' }, 503);
    // A buffer that cannot be read still answers 'corrupt buffer', as it always
    // has: this is the admin view whose whole job is to show what went wrong, so
    // silently serving an empty list here would hide the thing being looked for.
    // `!raw` rather than `raw === null`: an empty value has always read as an
    // empty buffer here, not as a corrupt one.
    const raw = await cache.get(RECENT_ERRORS_KEY);
    const arr = !raw ? [] : parseJSONAs<RecentJobError[]>(raw, recordListShape, RECENT_ERRORS_KEY);
    if (!arr) return c.json({ error: 'corrupt buffer' }, 500);
    const idFilter = c.req.query('id');
    const tractateFilter = c.req.query('tractate');
    let out = arr;
    if (idFilter) out = out.filter((e) => e.id === idFilter);
    if (tractateFilter) out = out.filter((e) => e.tractate === tractateFilter);
    const limit = Math.min(parseInt(c.req.query('limit') ?? '200', 10) || 200, RECENT_ERRORS_CAP);
    if (out.length > limit) out = out.slice(out.length - limit);
    return c.json({ count: out.length, errors: out });
  });

  /**
   * GET /api/rabbi-observations/:slug — read the accumulated reverse index for
   * one rabbi. Lists every rabbi-obs:v1:{slug}:* daf slice, merges them, and
   * aggregates observation frequency across dafs (the exact read a future
   * synthesis pass will perform). Read-only; nothing here promotes data back.
   *
   *   ?type=place   filter the flat `observations` list to one type
   *   ?min=2        only return aggregated entries seen on >= min dafs
   */
  app.get('/api/rabbi-observations/:slug', async (c) => {
    const cache = c.env.CACHE;
    if (!cache) return c.json({ error: 'no cache binding' }, 503);
    const slug = c.req.param('slug');
    const prefix = prefixForRabbiObs(slug);

    const typeFilterEarly = c.req.query('type') ?? '';
    const minEarly = Math.max(1, parseInt(c.req.query('min') ?? '1', 10) || 1);
    // `summary=1` omits the (potentially huge — tens of thousands for Rav) flat
    // observations list, returning only dafCount + byType + aggregated. The
    // accumulation card uses this; full reads stay available without the flag.
    const summary = c.req.query('summary') === '1';
    // Aggregating a prolific rabbi means a KV.list + a get per daf slice (~1600
    // for Rav) — too slow to run on every card open. Cache the computed view
    // with a short TTL; the accumulation is a lifetime signal, so minutes-stale
    // is fine, and the backfill keeps writing slices underneath regardless. Only
    // `summary` bodies are cached (the full body's flat list can be many MB and
    // risk the KV value limit); `type` only narrows that flat list, so it drops
    // out of the summary key.
    const aggKey = `rabbi-obs-agg:v1:${slug}:${summary ? 'all' : typeFilterEarly || 'all'}:${minEarly}:${summary ? 's' : 'f'}`;
    if (summary) {
      const cachedAgg = parseJSONAs<Record<string, unknown>>(
        await cache.get(aggKey),
        cachedAggregateShape,
        aggKey,
      );
      if (cachedAgg) return c.json(cachedAgg);
    }

    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const res = await cache.list({ prefix, cursor, limit: 1000 });
      for (const k of res.keys) keys.push(k.name);
      cursor = res.list_complete ? undefined : res.cursor;
    } while (cursor && keys.length < 5000);

    const typeFilter = typeFilterEarly || undefined;
    const minDafs = minEarly;
    const RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

    const byType: Record<string, number> = {};
    // Distinct dapim per tractate — feeds the sage-page coverage strip.
    const byTractate: Record<string, number> = {};
    // Frequency across dafs, keyed by observation hash (same place/move/verse on
    // N dafs => dafs:N) — the signal a future "notable places" ranking needs.
    const freq = new Map<
      string,
      { type: string; payload: unknown; dafs: number; confidence: string }
    >();
    const observations: Array<Record<string, unknown>> = [];

    // Read the per-daf slices in bounded PARALLEL batches and FOLD each into the
    // accumulators immediately, discarding the slice. A prolific rabbi (Rav has
    // ~1600 daf-slices) thus never holds the whole slice array at once — its flat
    // observation list can be many MB — and the reads run concurrently instead of
    // ~1600 serial KV gets (which risked the isolate CPU/time limit). dafCount +
    // name are folded in the same pass.
    const READ_BATCH = 50;
    let dafCount = 0;
    let name = '';
    let nameHe = '';
    for (let i = 0; i < keys.length; i += READ_BATCH) {
      const raws = await Promise.all(
        keys.slice(i, i + READ_BATCH).map(async (k) => ({ key: k, raw: await cache.get(k) })),
      );
      for (const { key, raw } of raws) {
        const s = parseJSONAs<ObservationSlice>(raw, observationSliceShape, key);
        if (!s) continue; // skip corrupt slice
        dafCount++;
        byTractate[s.tractate] = (byTractate[s.tractate] ?? 0) + 1;
        if (!name && s.name) name = s.name;
        if (!nameHe && s.nameHe) nameHe = s.nameHe;
        for (const o of s.observations) {
          byType[o.type] = (byType[o.type] ?? 0) + 1;
          const prev = freq.get(o.hash);
          if (prev) {
            prev.dafs += 1;
            if ((RANK[o.confidence] ?? 0) > (RANK[prev.confidence] ?? 0))
              prev.confidence = o.confidence;
          } else {
            freq.set(o.hash, {
              type: o.type,
              payload: o.payload,
              dafs: 1,
              confidence: o.confidence,
            });
          }
          if (!summary && (!typeFilter || o.type === typeFilter)) {
            observations.push({ ...o, tractate: s.tractate, page: s.page });
          }
        }
      }
    }
    const aggregated = [...freq.values()]
      .filter((e) => e.dafs >= minDafs)
      .sort((a, b) => b.dafs - a.dafs || (RANK[b.confidence] ?? 0) - (RANK[a.confidence] ?? 0));

    const body = {
      slug,
      name: name || slug,
      nameHe,
      dafCount,
      byType,
      byTractate,
      aggregated,
      observations,
    };
    // 10-minute TTL: fast on repeat opens; the lifetime view tolerates staleness.
    // summary only (bounded size); best-effort so a failed/oversized put never
    // turns a good read into a 500.
    if (summary) {
      await cache.put(aggKey, JSON.stringify(body), { expirationTtl: 600 }).catch(() => {});
    }
    return c.json(body);
  });
}
