// Run ids for queued enrichment jobs, moved out of index.ts so route modules
// can mint one without importing the worker entry file (which would make a
// cycle). A run id is a polling handle, not a cache key.

import { instanceIdOf, qualifierHash } from './cache-keys';
import type { JobMessage } from './types';

/**
 * Deterministic short id for a run request. Combines mark/enrichment id +
 * tractate/page + instance hash + timestamp to make polling-friendly ids.
 * Same params + same minute → same id (within reason), so retries don't
 * stampede the queue.
 */
export async function makeRunId(body: JobMessage): Promise<string> {
  const parts = [
    body.mark_id ?? body.enrichment_id ?? 'adhoc',
    body.tractate,
    body.page,
    await instanceIdOf(body.mark_input),
    body.user_question ? `q_${await qualifierHash(body.user_question)}` : 'noq',
    body.lang === 'he' ? 'he' : 'en',
    body.bypass_cache ? 'fresh' : 'cached',
    String(Math.floor(Date.now() / 1000)),
  ];
  return parts
    .join(':')
    .replace(/[^a-zA-Z0-9._:-]+/g, '_')
    .slice(0, 200);
}

/** Inverse of the timestamp `makeRunId` embeds: the unix-ms enqueue time, or
 *  undefined when the id doesn't carry one. */
export function enqueueTsFromRunId(runId: string): number | undefined {
  const m = runId.match(/:(\d{8,})$/);
  return m ? parseInt(m[1], 10) * 1000 : undefined;
}
