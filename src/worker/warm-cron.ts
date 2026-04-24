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
import { getHebrewBooksDafCached } from './source-cache';
import { computeCacheStats, writeCachedCacheStats } from './cache-stats';

const CURSOR_KEY = 'warm-cursor:v1';
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

export async function runWarmCron(env: WarmEnv): Promise<void> {
  const cache = env.CACHE;
  if (!cache) return;

  const cursor = await readWarmCursor(cache);
  if (cursor.done) return;

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
      console.log(`[warm-cron] complete. total=${TOTAL_AMUDIM}`);
      await refreshStats(cache);
      await sendCompletionEmail(env);
      return;
    }

    const tractate = TRACTATES[tractateIdx];
    const amud = AMUDIM_BY_TRACTATE[tractateIdx][amudIdx];
    const key = `hb:v1:${tractate}:${amud}`;
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
    `[warm-cron] processed=${processed} fetched=${fetched} elapsed=${elapsed}ms cursor=${tractateIdx}:${amudIdx}`,
  );
  await refreshStats(cache);
}
