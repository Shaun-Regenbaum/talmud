// Moved out of index.ts so the usage dashboard's health section can read the
// same KV key without importing the worker entry file, which would make a
// cycle. Nothing about the buffer itself changed.

import { parseJSONAs } from './kv-json';
import { recordListShape } from './kv-shapes';
import type { Bindings } from './types';

/**
 * Ring buffer of recent enrichment-queue job failures. Captures the full
 * error message + context that the `job:{runId}` record drops after 1h, so
 * postmortems past the panel's display window are possible without scraping
 * Cloudflare observability. Distinct from `telemetry:v1:recent` (which stores
 * classified error_kind, not the raw message, and is for usage rollups).
 *
 *   recent-errors:v1  →  RecentJobError[] (cap 200, TTL 30d)
 */
export interface RecentJobError {
  ts: number;
  runId: string;
  kind: 'mark' | 'enrichment' | 'ad_hoc';
  id?: string;
  tractate: string;
  page: string;
  error: string;
  totalMs: number;
  /** Producer→consumer queue latency in ms, extracted from the unix-seconds
   *  timestamp embedded in runId by makeRunId. */
  queueWaitMs?: number;
}

export const RECENT_ERRORS_KEY = 'recent-errors:v1';
export const RECENT_ERRORS_CAP = 200;
export const RECENT_ERRORS_TTL = 60 * 60 * 24 * 30;

export async function recordRecentJobError(
  env: Bindings,
  rec: Omit<RecentJobError, 'ts'>,
): Promise<void> {
  const cache = env.CACHE;
  if (!cache) return;
  try {
    const arr =
      parseJSONAs<RecentJobError[]>(
        await cache.get(RECENT_ERRORS_KEY),
        recordListShape,
        RECENT_ERRORS_KEY,
      ) ?? [];
    arr.push({ ts: Date.now(), ...rec });
    while (arr.length > RECENT_ERRORS_CAP) arr.shift();
    await cache.put(RECENT_ERRORS_KEY, JSON.stringify(arr), { expirationTtl: RECENT_ERRORS_TTL });
  } catch (err) {
    console.warn('[recent-errors] KV write failed:', String(err));
  }
}
