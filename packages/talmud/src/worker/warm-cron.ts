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

import { iterAmudim } from '../lib/sefref/amudim';
import { listDafyomiMasechtos } from '../lib/sefref/dafyomi/masechtos';
import { TRACTATE_IDS } from '../lib/sefref/hebrewbooks/client';
import {
  keyForDafyomi,
  keyForHalachaRefs,
  keyForHebrewBooks,
  keyForSefariaBundle,
  keyForSefariaSegments,
  keyForTalmudParallels,
} from './cache-keys';
import { computeCacheStats, writeCachedCacheStats } from './cache-stats';
import {
  getDafyomiContentCached,
  getHalachaRefsCached,
  getHebrewBooksDafCached,
  getSefariaPageCached,
  getSefariaSegmentsCached,
  getTalmudParallelsCached,
  getYerushalmiCached,
} from './source-cache';
import type { JobMessage } from './types';

const CURSOR_KEY = 'warm-cursor:v1';
const SEFARIA_CURSOR_KEY = 'warm-cursor-sefaria:v1';
const HALACHA_CURSOR_KEY = 'halacha-warm-cursor:v1';
const BATCH_SIZE = 20;
const FETCH_SLEEP_MS = 1000;
// Halacha refs fan out internally: one getRelated + up to maxPerBook (6) getText
// PER codifier work, all in parallel — a single amud can burst 30-50 Sefaria
// subrequests. So this phase uses a much smaller per-tick batch than the Sefaria
// phase to stay well under the Workers per-invocation subrequest cap and to keep
// the parallel bursts polite to Sefaria. ~5 amudim/tick × 12 ticks/hr ≈ a
// ~4-day full pass over Shas.
const HALACHA_BATCH = 5;

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
  ASSETS?: Fetcher;
  ENRICHMENT_QUEUE?: Queue<JobMessage>;
  /** When '1', the gradual dafyomi.co.il ingestion walks all of Shas (a few
   *  dapim per 5-min tick, polite + KV-cached forever) and emails on a full
   *  pass. Set via wrangler.toml [vars] to start it. */
  DAFYOMI_WARM_SHAS?: string;
  /** When '1', the Sefaria Shas walk also enqueues rabbi.observations per amud
   *  so the per-rabbi reverse index backfills across all of Shas. OFF by
   *  default: it forces every entity mark (incl. the expensive argument-move
   *  fan-out + pesukim) to extract across the whole shas. Set via wrangler.toml
   *  [vars] once you're ready to pay for the backfill. */
  OBSERVATIONS_WARM_SHAS?: string;
  /** When '1', a small independent phase walks all of Shas filling the
   *  halacha-refs source cache (Sefaria codifier links + their text) — the
   *  source behind the halacha card + GET /api/halacha-text. Sefaria-only, no
   *  LLM. OFF by default: it's a multi-day, getText-heavy Sefaria fill; set via
   *  wrangler.toml [vars] when you're ready to run it. Lifts the ~3% coverage
   *  (lazy/on-demand today) to the real halacha density of Shas. */
  HALACHA_WARM_SHAS?: string;
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
    console.error('[warm-cron] send email failed:', err);
  }
}

async function refreshStats(cache: KVNamespace): Promise<void> {
  try {
    const stats = await computeCacheStats(cache);
    await writeCachedCacheStats(cache, stats);
  } catch (err) {
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

interface ObsBackfillCursor {
  tractateIdx: number;
  amudIdx: number;
  enqueued: number;
  done?: boolean;
}

async function runObservationsBackfill(env: WarmEnv): Promise<void> {
  if (env.OBSERVATIONS_WARM_SHAS !== '1' || !env.ENRICHMENT_QUEUE || !env.CACHE) return;
  const cache = env.CACHE;
  const raw = await cache.get(OBS_BACKFILL_CURSOR_KEY);
  let cur: ObsBackfillCursor = { tractateIdx: 0, amudIdx: 0, enqueued: 0 };
  if (raw) {
    try {
      cur = JSON.parse(raw) as ObsBackfillCursor;
    } catch {
      /* reset */
    }
  }
  if (cur.done) return; // one-time: latched after a full pass

  let { tractateIdx, amudIdx } = cur;
  let enqueued = cur.enqueued ?? 0;
  let processed = 0;
  while (processed < OBS_BACKFILL_BATCH) {
    while (tractateIdx < TRACTATES.length && amudIdx >= AMUDIM_BY_TRACTATE[tractateIdx].length) {
      tractateIdx++;
      amudIdx = 0;
    }
    if (tractateIdx >= TRACTATES.length) {
      await cache.put(
        OBS_BACKFILL_CURSOR_KEY,
        JSON.stringify({ tractateIdx, amudIdx: 0, enqueued, done: true }),
      );
      console.log(`[warm-cron] rabbi.observations backfill COMPLETE — enqueued ${enqueued} amudim`);
      return;
    }
    const tractate = TRACTATES[tractateIdx];
    const amud = AMUDIM_BY_TRACTATE[tractateIdx][amudIdx];
    const runId =
      `rabbi.observations:${tractate}:${amud}:daf:noq:cached:${Math.floor(Date.now() / 1000)}`
        .replace(/[^a-zA-Z0-9._:-]+/g, '_')
        .slice(0, 200);
    await env.ENRICHMENT_QUEUE.send({
      runId,
      enrichment_id: 'rabbi.observations',
      mark_input: { id: 'daf' },
      tractate,
      page: amud,
    }).catch((e) => {
      console.error(`[warm-cron] enqueue rabbi.observations ${tractate}/${amud} failed:`, e);
    });
    enqueued++;
    amudIdx++;
    processed++;
  }
  await cache.put(OBS_BACKFILL_CURSOR_KEY, JSON.stringify({ tractateIdx, amudIdx, enqueued }));
  console.log(
    `[warm-cron] rabbi.observations backfill progress: enqueued=${enqueued} cursor=${tractateIdx}:${amudIdx}`,
  );
}

// ---------------------------------------------------------------------------
// Dafyomi.co.il (Kollel Iyun HaDaf) gradual ingestion — gated, self-latching.
//
// Gated by DAFYOMI_WARM_SHAS='1'. Walks all dafyomi-mapped masechtos (Chullin +
// Shas) at DAFYOMI_BATCH dapim per 5-min tick. Each cold daf is fetched live via
// the HUB-DRIVEN scrapeDafyomiLive (getDafyomiContentCached allowLive) — ~9
// sequential dafyomi.co.il requests, then KV-cached forever — so a full pass is
// gentle (a couple dapim per tick, ~4-5 days) and re-runs are no-ops. Latches
// { done } after a full pass and emails. To re-run, delete the cursor key.
// dafyomi.co.il study content never changes, so once-cached is permanent.
// ---------------------------------------------------------------------------
const DAFYOMI_CURSOR_KEY = 'dafyomi-warm-cursor:v1';
const DAFYOMI_BATCH = 2; // dapim per tick (each cold daf ≈ 9 sequential fetches)
const DAFYOMI_FETCH_SLEEP_MS = 1500; // politeness pause between dapim

interface DafyomiCursor {
  tractateIdx: number;
  daf: number;
  fetched: number;
  done?: boolean;
}

export function dafyomiWarmTotal(): number {
  return listDafyomiMasechtos().reduce((s, m) => s + Math.max(0, m.lastDaf - 1), 0);
}

async function sendDafyomiCompletionEmail(env: WarmEnv, fetched: number): Promise<void> {
  const email = env.EMAIL;
  if (!email) return;
  try {
    await email.send({
      from: 'warm-cron@shaunregenbaum.com',
      to: 'shaunregenbaum@gmail.com',
      subject: 'Dafyomi.co.il ingestion complete',
      text:
        `The gradual dafyomi.co.il (Kollel Iyun HaDaf) scrape has finished a full pass over Shas.\n\n` +
        `Dapim newly fetched this pass: ${fetched} of ${dafyomiWarmTotal()} total.\n` +
        `Content is cached in KV — study notes + poskim now feed the halacha cards Shas-wide.\n`,
    });
  } catch (err) {
    console.error('[warm-cron] dafyomi email failed:', err);
  }
}

async function runDafyomiBackfill(env: WarmEnv): Promise<void> {
  if (env.DAFYOMI_WARM_SHAS !== '1' || !env.CACHE || !env.ASSETS) return;
  const cache = env.CACHE;
  const masechtos = listDafyomiMasechtos();
  const raw = await cache.get(DAFYOMI_CURSOR_KEY);
  let cur: DafyomiCursor = { tractateIdx: 0, daf: 2, fetched: 0 };
  if (raw) {
    try {
      cur = JSON.parse(raw) as DafyomiCursor;
    } catch {
      /* reset */
    }
  }
  if (cur.done) return; // self-latched after a full pass

  let { tractateIdx, daf } = cur;
  let fetched = cur.fetched ?? 0;
  let processed = 0;
  while (processed < DAFYOMI_BATCH) {
    while (tractateIdx < masechtos.length && daf > masechtos[tractateIdx].lastDaf) {
      tractateIdx++;
      daf = 2;
    }
    if (tractateIdx >= masechtos.length) {
      await cache.put(
        DAFYOMI_CURSOR_KEY,
        JSON.stringify({ tractateIdx, daf: 2, fetched, done: true }),
      );
      console.log(`[warm-cron] dafyomi ingestion COMPLETE — fetched ${fetched} this pass`);
      await sendDafyomiCompletionEmail(env, fetched);
      return;
    }
    const tractate = masechtos[tractateIdx].tractate;
    const key = keyForDafyomi(tractate, String(daf));
    // Skip anything already in KV — a real daf OR a negative-cache marker (so we
    // don't re-hammer genuinely-absent pages within a pass).
    const existing = await cache.get(key);
    if (existing === null) {
      // allowLive → hub-driven scrapeDafyomiLive, then KV-cached forever. Count
      // only real ingests (null = absent/failed) so the completion email is honest.
      const got = await getDafyomiContentCached(cache, env.ASSETS, tractate, String(daf), {
        allowLive: true,
      }).catch(() => null);
      if (got) fetched++;
      await new Promise((r) => setTimeout(r, DAFYOMI_FETCH_SLEEP_MS));
    }
    daf++;
    processed++;
  }
  await cache.put(DAFYOMI_CURSOR_KEY, JSON.stringify({ tractateIdx, daf, fetched }));
  console.log(`[warm-cron] dafyomi progress: fetched=${fetched} cursor=${tractateIdx}:${daf}`);
}

export async function runWarmCron(env: WarmEnv): Promise<void> {
  const cache = env.CACHE;
  if (!cache) return;

  // One-time observations backfill (gated, self-latching). Runs independent of
  // the source-warming phases below so it isn't blocked by them.
  await runObservationsBackfill(env);

  // Gradual dafyomi.co.il ingestion (gated, self-latching). Independent phase.
  await runDafyomiBackfill(env);

  // Gradual halacha-refs source fill (gated). Independent + small-batch because
  // each amud bursts many Sefaria getText calls. Runs every tick regardless of
  // the HB/Sefaria phase progress below.
  await runHalachaPhase(env);

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
    while (tractateIdx < TRACTATES.length && amudIdx >= AMUDIM_BY_TRACTATE[tractateIdx].length) {
      tractateIdx++;
      amudIdx = 0;
    }
    if (tractateIdx >= TRACTATES.length) {
      await cache.put(
        CURSOR_KEY,
        JSON.stringify({ tractateIdx: TRACTATES.length, amudIdx: 0, done: true }),
      );
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
  try {
    return JSON.parse(raw) as SefariaWarmCursor;
  } catch {
    return { tractateIdx: 0, amudIdx: 0, wraps: 0 };
  }
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
    while (tractateIdx < TRACTATES.length && amudIdx >= AMUDIM_BY_TRACTATE[tractateIdx].length) {
      tractateIdx++;
      amudIdx = 0;
    }
    if (tractateIdx >= TRACTATES.length) {
      // End of shas — wrap around so expired entries get refilled.
      wraps++;
      tractateIdx = 0;
      amudIdx = 0;
      console.log(`[warm-cron] Sefaria pass ${wraps} complete — wrapping`);
    }

    const tractate = TRACTATES[tractateIdx];
    const amud = AMUDIM_BY_TRACTATE[tractateIdx][amudIdx];
    const bundleKey = keyForSefariaBundle(tractate, amud); // was sefaria-bundle:v2 — drifted from the reader's v5
    const segKey = keyForSefariaSegments(tractate, amud);
    const parKey = keyForTalmudParallels(tractate, amud);
    const [bundleHit, segHit, parHit] = await Promise.all([
      cache.get(bundleKey),
      cache.get(segKey),
      cache.get(parKey),
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
    // Cross-text parallels (Mesorat HaShas + the shared-mishnah Yerushalmi) — the
    // spine's exit markers. Sefaria getRelated only, no LLM; warming here turns
    // the spine's "⤳?" cold markers into real badges Shas-wide. Both bundles are
    // written together (also by /api/links), so the parallels key gates both.
    if (parHit === null) {
      await getTalmudParallelsCached(cache, tractate, amud);
      await getYerushalmiCached(cache, tractate, amud);
      didFetch = true;
    }
    if (didFetch) {
      fetched++;
      await new Promise((r) => setTimeout(r, FETCH_SLEEP_MS));
    }

    amudIdx++;
    processed++;
  }

  await cache.put(SEFARIA_CURSOR_KEY, JSON.stringify({ tractateIdx, amudIdx, wraps }));
  const elapsed = Date.now() - start;
  console.log(
    `[warm-cron] Sefaria processed=${processed} fetched=${fetched} elapsed=${elapsed}ms cursor=${tractateIdx}:${amudIdx} wraps=${wraps}`,
  );
}

interface HalachaWarmCursor {
  tractateIdx: number;
  amudIdx: number;
  /** Full passes over Shas (incremented on wrap), mirroring the Sefaria cursor. */
  wraps?: number;
}

async function readHalachaCursor(cache: KVNamespace): Promise<HalachaWarmCursor> {
  const raw = await cache.get(HALACHA_CURSOR_KEY);
  if (!raw) return { tractateIdx: 0, amudIdx: 0, wraps: 0 };
  try {
    return JSON.parse(raw) as HalachaWarmCursor;
  } catch {
    return { tractateIdx: 0, amudIdx: 0, wraps: 0 };
  }
}

export async function readHalachaWarmCursor(cache: KVNamespace): Promise<HalachaWarmCursor> {
  return readHalachaCursor(cache);
}

export function halachaWarmProgressProcessed(cursor: HalachaWarmCursor): number {
  let n = 0;
  for (let i = 0; i < cursor.tractateIdx && i < AMUDIM_BY_TRACTATE.length; i++) {
    n += AMUDIM_BY_TRACTATE[i].length;
  }
  n += cursor.amudIdx;
  return Math.min(n, TOTAL_AMUDIM);
}

/**
 * Gated by HALACHA_WARM_SHAS='1'. Walks all of Shas a few amudim per tick,
 * filling the `halacha-refs` source cache (Sefaria codifier links + their text)
 * that backs the halacha card and GET /api/halacha-text. Each amud bursts many
 * Sefaria getText calls (up to maxPerBook per codifier work), so the batch is
 * small. Empty bundles (dapim with no codifier link) are cached too, so the walk
 * is idempotent (skip-if-cached) and `/usage` coverage settles at the real
 * halacha density of Shas rather than the ~3% the lazy/on-demand path showed.
 * 30-day TTL like the other Sefaria sources, so the cursor wraps and refills.
 */
export async function runHalachaPhase(env: WarmEnv): Promise<void> {
  if (env.HALACHA_WARM_SHAS !== '1' || !env.CACHE) return;
  const cache = env.CACHE;
  const cursor = await readHalachaCursor(cache);
  let { tractateIdx, amudIdx, wraps = 0 } = cursor;
  let processed = 0;
  let fetched = 0;
  const start = Date.now();

  while (processed < HALACHA_BATCH) {
    while (tractateIdx < TRACTATES.length && amudIdx >= AMUDIM_BY_TRACTATE[tractateIdx].length) {
      tractateIdx++;
      amudIdx = 0;
    }
    if (tractateIdx >= TRACTATES.length) {
      wraps++;
      tractateIdx = 0;
      amudIdx = 0;
      console.log(`[warm-cron] halacha pass ${wraps} complete — wrapping`);
    }

    const tractate = TRACTATES[tractateIdx];
    const amud = AMUDIM_BY_TRACTATE[tractateIdx][amudIdx];
    // Skip if already cached (incl. an empty bundle for a no-halacha daf), so a
    // pass only pays Sefaria for the dapim it hasn't filled yet.
    const hit = await cache.get(keyForHalachaRefs(tractate, amud));
    if (hit === null) {
      await getHalachaRefsCached(cache, tractate, amud);
      fetched++;
      await new Promise((r) => setTimeout(r, FETCH_SLEEP_MS));
    }

    amudIdx++;
    processed++;
  }

  await cache.put(HALACHA_CURSOR_KEY, JSON.stringify({ tractateIdx, amudIdx, wraps }));
  const elapsed = Date.now() - start;
  console.log(
    `[warm-cron] halacha processed=${processed} fetched=${fetched} elapsed=${elapsed}ms cursor=${tractateIdx}:${amudIdx} wraps=${wraps}`,
  );
}
