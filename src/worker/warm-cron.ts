/**
 * Background cache-warmer for HebrewBooks. Walks every amud in the shas
 * once at a polite 1 req/sec and stores the result in KV with no TTL.
 * HebrewBooks daf HTML never changes, so once the cursor reaches the end
 * it latches to { done: true } and subsequent cron invocations are no-ops.
 *
 * Cursor: KV key `warm-cursor:v1` → { tractateIdx, amudIdx, done? }.
 * To force a re-walk (e.g. after changing fetch format), bump the key
 * version to v2.
 */
import { TRACTATE_IDS } from '../lib/sefref/hebrewbooks/client';
import { iterAmudim } from '../lib/sefref/amudim';
import {
  getHebrewBooksDafCached,
  getSefariaPageCached,
  getSefariaSegmentsCached,
} from './source-cache';
import { computeCacheStats, writeCachedCacheStats } from './cache-stats';
import { keyForHebrewBooks, keyForSefariaBundle, keyForSefariaSegments } from './cache-keys';
import type { JobMessage } from './index';

const CURSOR_KEY = 'warm-cursor:v1';
const SEFARIA_CURSOR_KEY = 'warm-cursor-sefaria:v1';
const BATCH_SIZE = 20;
const FETCH_SLEEP_MS = 1000;

const TRACTATES = Object.keys(TRACTATE_IDS);
const AMUDIM_BY_TRACTATE: string[][] = TRACTATES.map((t) => [...iterAmudim(t)]);
const TOTAL_AMUDIM = AMUDIM_BY_TRACTATE.reduce((s, a) => s + a.length, 0);

interface WarmCursor {
  tractateIdx: number;
  amudIdx: number;
  done?: boolean;
}

export interface EmailBinding {
  send(message: {
    to: string;
    from: string;
    subject: string;
    html?: string;
    text?: string;
  }): Promise<{ messageId: string }>;
}

export interface WarmEnv {
  CACHE?: KVNamespace;
  EMAIL?: EmailBinding;
  ENRICHMENT_QUEUE?: Queue<JobMessage>;
  /** When '1', the Sefaria Shas walk also enqueues rabbi.observations per amud
   *  so the per-rabbi reverse index backfills across all of Shas. OFF by
   *  default: it forces every entity mark (incl. the expensive argument-move
   *  fan-out + pesukim) to extract across the whole shas. Set via wrangler.toml
   *  [vars] once you're ready to pay for the backfill. */
  OBSERVATIONS_WARM_SHAS?: string;
}

export function getWarmTotal(): number {
  return TOTAL_AMUDIM;
}

export async function readWarmCursor(cache: KVNamespace): Promise<WarmCursor> {
  const raw = await cache.get(CURSOR_KEY);
  if (!raw) return { tractateIdx: 0, amudIdx: 0 };
  try {
    return JSON.parse(raw) as WarmCursor;
  } catch {
    return { tractateIdx: 0, amudIdx: 0 };
  }
}

export function warmProgressProcessed(cursor: WarmCursor): number {
  let n = 0;
  for (let i = 0; i < cursor.tractateIdx && i < AMUDIM_BY_TRACTATE.length; i++) {
    n += AMUDIM_BY_TRACTATE[i].length;
  }
  n += cursor.amudIdx;
  return Math.min(n, TOTAL_AMUDIM);
}

async function sendCompletionEmail(env: WarmEnv): Promise<void> {
  const email = env.EMAIL;
  if (!email) return;
  try {
    await email.send({
      from: 'warm-cron@shaunregenbaum.com',
      to: 'shaunregenbaum@gmail.com',
      subject: 'HebrewBooks cache warm complete',
      text:
        `The full shas (${TOTAL_AMUDIM} amudim) is now cached in KV.\n\n` +
        `Status: https://talmud.shaunregenbaum.com/api/admin/warm-status\n` +
        `Dashboard: https://talmud.shaunregenbaum.com/usage\n`,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[warm-cron] send email failed:', err);
  }
}

async function refreshStats(cache: KVNamespace): Promise<void> {
  try {
    const stats = await computeCacheStats(cache);
    await writeCachedCacheStats(cache, stats);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[warm-cron] refreshStats failed:', err);
  }
}

// ---------------------------------------------------------------------------
// rabbi.observations full-Shas backfill — ONE-TIME, self-latching.
//
// Gated by OBSERVATIONS_WARM_SHAS='1'. Independent of the HB/Sefaria phases:
// its own cursor walks the whole shas exactly once (OBS_BACKFILL_BATCH amudim
// per 5-min tick ≈ ~1 day), enqueuing one rabbi.observations job per amud, then
// latches { done: true } and never enqueues again. Cache-respecting (no
// bypass) — an already-computed amud is a queue cache-hit (~$0); only uncached
// amudim incur LLM cost. To re-run a full pass later, delete the cursor key.
// ---------------------------------------------------------------------------
const OBS_BACKFILL_CURSOR_KEY = 'obs-backfill-cursor:v1';
const OBS_BACKFILL_BATCH = 20;

interface ObsBackfillCursor { tractateIdx: number; amudIdx: number; enqueued: number; done?: boolean }

async function runObservationsBackfill(env: WarmEnv): Promise<void> {
  if (env.OBSERVATIONS_WARM_SHAS !== '1' || !env.ENRICHMENT_QUEUE || !env.CACHE) return;
  const cache = env.CACHE;
  const raw = await cache.get(OBS_BACKFILL_CURSOR_KEY);
  let cur: ObsBackfillCursor = { tractateIdx: 0, amudIdx: 0, enqueued: 0 };
  if (raw) { try { cur = JSON.parse(raw) as ObsBackfillCursor; } catch { /* reset */ } }
  if (cur.done) return; // one-time: latched after a full pass

  let { tractateIdx, amudIdx } = cur;
  let enqueued = cur.enqueued ?? 0;
  let processed = 0;
  while (processed < OBS_BACKFILL_BATCH) {
    while (tractateIdx < TRACTATES.length && amudIdx >= AMUDIM_BY_TRACTATE[tractateIdx].length) {
      tractateIdx++; amudIdx = 0;
    }
    if (tractateIdx >= TRACTATES.length) {
      await cache.put(OBS_BACKFILL_CURSOR_KEY, JSON.stringify({ tractateIdx, amudIdx: 0, enqueued, done: true }));
      // eslint-disable-next-line no-console
      console.log(`[warm-cron] rabbi.observations backfill COMPLETE — enqueued ${enqueued} amudim`);
      return;
    }
    const tractate = TRACTATES[tractateIdx];
    const amud = AMUDIM_BY_TRACTATE[tractateIdx][amudIdx];
    const runId = `rabbi.observations:${tractate}:${amud}:daf:noq:cached:${Math.floor(Date.now() / 1000)}`
      .replace(/[^a-zA-Z0-9._:-]+/g, '_').slice(0, 200);
    await env.ENRICHMENT_QUEUE.send({ runId, enrichment_id: 'rabbi.observations', mark_input: { id: 'daf' }, tractate, page: amud })
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.error(`[warm-cron] enqueue rabbi.observations ${tractate}/${amud} failed:`, e);
      });
    enqueued++;
    amudIdx++;
    processed++;
  }
  await cache.put(OBS_BACKFILL_CURSOR_KEY, JSON.stringify({ tractateIdx, amudIdx, enqueued }));
  // eslint-disable-next-line no-console
  console.log(`[warm-cron] rabbi.observations backfill progress: enqueued=${enqueued} cursor=${tractateIdx}:${amudIdx}`);
}

export async function runWarmCron(env: WarmEnv): Promise<void> {
  const cache = env.CACHE;
  if (!cache) return;

  // One-time observations backfill (gated, self-latching). Runs independent of
  // the source-warming phases below so it isn't blocked by them.
  await runObservationsBackfill(env);

  const cursor = await readWarmCursor(cache);
  if (!cursor.done) {
    await runHbPhase(env, cursor);
    return;
  }
  // HB phase complete — every tick now drains a batch of the Sefaria
  // phase. Sefaria slices have a 30-day TTL (vs HB which is permanent),
  // so the phase loops forever instead of latching done: any entry that
  // expires gets refilled on the next walk-through.
  await runSefariaPhase(env);
}

async function runHbPhase(env: WarmEnv, cursor: WarmCursor): Promise<void> {
  const cache = env.CACHE!;
  let { tractateIdx, amudIdx } = cursor;
  let processed = 0;
  let fetched = 0;
  const start = Date.now();

  while (processed < BATCH_SIZE) {
    while (
      tractateIdx < TRACTATES.length &&
      amudIdx >= AMUDIM_BY_TRACTATE[tractateIdx].length
    ) {
      tractateIdx++;
      amudIdx = 0;
    }
    if (tractateIdx >= TRACTATES.length) {
      await cache.put(
        CURSOR_KEY,
        JSON.stringify({ tractateIdx: TRACTATES.length, amudIdx: 0, done: true }),
      );
      // eslint-disable-next-line no-console
      console.log(`[warm-cron] HB complete. total=${TOTAL_AMUDIM}`);
      await refreshStats(cache);
      await sendCompletionEmail(env);
      return;
    }

    const tractate = TRACTATES[tractateIdx];
    const amud = AMUDIM_BY_TRACTATE[tractateIdx][amudIdx];
    const key = keyForHebrewBooks(tractate, amud);
    const existing = await cache.get(key);

    if (existing === null) {
      await getHebrewBooksDafCached(cache, tractate, amud);
      fetched++;
      await new Promise((r) => setTimeout(r, FETCH_SLEEP_MS));
    }

    amudIdx++;
    processed++;
  }

  await cache.put(CURSOR_KEY, JSON.stringify({ tractateIdx, amudIdx }));
  const elapsed = Date.now() - start;
  // eslint-disable-next-line no-console
  console.log(
    `[warm-cron] HB processed=${processed} fetched=${fetched} elapsed=${elapsed}ms cursor=${tractateIdx}:${amudIdx}`,
  );
  await refreshStats(cache);
}

interface SefariaWarmCursor {
  tractateIdx: number;
  amudIdx: number;
  /** Wraps incremented each time the cursor reaches the end of shas and
   *  resets to 0. Visible in /api/admin/warm-status so we can see how many
   *  full passes the maintenance walk has done. */
  wraps?: number;
}

async function readSefariaCursor(cache: KVNamespace): Promise<SefariaWarmCursor> {
  const raw = await cache.get(SEFARIA_CURSOR_KEY);
  if (!raw) return { tractateIdx: 0, amudIdx: 0, wraps: 0 };
  try { return JSON.parse(raw) as SefariaWarmCursor; }
  catch { return { tractateIdx: 0, amudIdx: 0, wraps: 0 }; }
}

export async function readSefariaWarmCursor(cache: KVNamespace): Promise<SefariaWarmCursor> {
  return readSefariaCursor(cache);
}

export function sefariaWarmProgressProcessed(cursor: SefariaWarmCursor): number {
  let n = 0;
  for (let i = 0; i < cursor.tractateIdx && i < AMUDIM_BY_TRACTATE.length; i++) {
    n += AMUDIM_BY_TRACTATE[i].length;
  }
  n += cursor.amudIdx;
  return Math.min(n, TOTAL_AMUDIM);
}

async function runSefariaPhase(env: WarmEnv): Promise<void> {
  const cache = env.CACHE!;
  const cursor = await readSefariaCursor(cache);
  let { tractateIdx, amudIdx, wraps = 0 } = cursor;
  let processed = 0;
  let fetched = 0;
  const start = Date.now();

  while (processed < BATCH_SIZE) {
    while (
      tractateIdx < TRACTATES.length &&
      amudIdx >= AMUDIM_BY_TRACTATE[tractateIdx].length
    ) {
      tractateIdx++;
      amudIdx = 0;
    }
    if (tractateIdx >= TRACTATES.length) {
      // End of shas — wrap around so expired entries get refilled.
      wraps++;
      tractateIdx = 0;
      amudIdx = 0;
      // eslint-disable-next-line no-console
      console.log(`[warm-cron] Sefaria pass ${wraps} complete — wrapping`);
    }

    const tractate = TRACTATES[tractateIdx];
    const amud = AMUDIM_BY_TRACTATE[tractateIdx][amudIdx];
    const bundleKey = keyForSefariaBundle(tractate, amud); // was sefaria-bundle:v2 — drifted from the reader's v5
    const segKey = keyForSefariaSegments(tractate, amud);
    const [bundleHit, segHit] = await Promise.all([
      cache.get(bundleKey),
      cache.get(segKey),
    ]);

    let didFetch = false;
    if (bundleHit === null) {
      await getSefariaPageCached(cache, tractate, amud);
      didFetch = true;
    }
    if (segHit === null) {
      await getSefariaSegmentsCached(cache, tractate, amud);
      didFetch = true;
    }
    if (didFetch) {
      fetched++;
      await new Promise((r) => setTimeout(r, FETCH_SLEEP_MS));
    }

    amudIdx++;
    processed++;
  }

  await cache.put(
    SEFARIA_CURSOR_KEY,
    JSON.stringify({ tractateIdx, amudIdx, wraps }),
  );
  const elapsed = Date.now() - start;
  // eslint-disable-next-line no-console
  console.log(
    `[warm-cron] Sefaria processed=${processed} fetched=${fetched} elapsed=${elapsed}ms cursor=${tractateIdx}:${amudIdx} wraps=${wraps}`,
  );
}
