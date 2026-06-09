/**
 * Bounded-retry + visibility for deterministic post-generation lints.
 *
 * Enrichment output that fails a lint (gloss-style violations for halacha.*,
 * missing-Hebrew-excerpt for pesukim.synthesis) is NOT pinned to cache, so the
 * next request regenerates it. Left unbounded that's a cost leak — the 5-min
 * warm cron and the daily daf-yomi cron would re-pay for the same failing card
 * forever. This module caps the retries: after MAX_LINT_ATTEMPTS generations
 * that still fail, the caller pins the best-effort output anyway (reads then
 * become cache hits and regeneration stops), and the failure is recorded to a
 * small ring buffer + per-enrichment counts surfaced on the Usage page.
 *
 * KV keys (all under the shared CACHE namespace):
 *   lintfail:attempt:v1:<cacheKey>  number, TTL 6h — per-card attempt counter
 *   lintfail:recent:v1              LintFailure[]   — ring buffer (cap 50)
 *   lintfail:counts:v1              Record<id,count> — per-enrichment totals
 */

type Cache = { CACHE?: KVNamespace };
type Ctx = { waitUntil(p: Promise<unknown>): void };

const ATTEMPT_PREFIX = 'lintfail:attempt:v1:';
const RECENT_KEY = 'lintfail:recent:v1';
const COUNTS_KEY = 'lintfail:counts:v1';
// Counter only needs to outlive the burst of regeneration attempts (cron hits
// an uncached card every 5 min). Once a card is pinned, reads are cache hits so
// the counter is never touched again — the TTL just sweeps it up.
const ATTEMPT_TTL_S = 6 * 60 * 60;
const RECENT_CAP = 50;

/** Pin the best-effort output once a card has failed lint this many times. */
export const MAX_LINT_ATTEMPTS = 3;

export interface LintFailure {
  at: number;
  enrichmentId: string;
  tractate: string;
  page: string;
  lang: 'en' | 'he';
  attempts: number;
  /** Compact human-readable summaries of the lint issues. */
  issues: string[];
}

interface LintAttemptMeta {
  enrichmentId: string;
  tractate: string;
  page: string;
  lang: 'en' | 'he';
  /** Raw lint issues from the run (each carries a `kind` + a detail field). */
  issues: unknown[];
}

/** One-line summary for a lint issue of any kind (GlossIssue, CalqueIssue,
 *  PasukCitationIssue). Defensive — issues arrive as `unknown[]`. */
function summarizeIssue(i: unknown): string {
  const o = (i ?? {}) as Record<string, unknown>;
  const kind = typeof o.kind === 'string' ? o.kind : 'issue';
  const detail =
    (typeof o.match === 'string' && o.match) ||
    (typeof o.translit === 'string' && o.translit) ||
    (typeof o.hebrew === 'string' && o.hebrew) ||
    (typeof o.book === 'string' ? `${o.book} ${o.chapter ?? ''}:${o.verse ?? ''}` : '') ||
    '';
  return detail ? `${kind}: ${detail}` : kind;
}

/**
 * Record one failed-lint generation against a cache key. Returns whether the
 * caller should PIN the output anyway (i.e. the attempt cap was reached).
 * Records the failure to the ring buffer + counts exactly once, on the attempt
 * that crosses the cap, so bypass re-runs don't double-count.
 */
export async function noteLintAttempt(
  env: Cache,
  ctx: Ctx,
  cacheKey: string,
  meta: LintAttemptMeta,
): Promise<boolean> {
  if (!env.CACHE) return false;
  const key = ATTEMPT_PREFIX + cacheKey;
  let count = 1;
  try {
    const cur = await env.CACHE.get(key);
    count = (cur ? parseInt(cur, 10) || 0 : 0) + 1;
    await env.CACHE.put(key, String(count), { expirationTtl: ATTEMPT_TTL_S });
  } catch (err) {
    console.warn('[lint-failures] attempt counter write failed:', String(err));
  }
  if (count < MAX_LINT_ATTEMPTS) return false;
  if (count === MAX_LINT_ATTEMPTS) {
    recordLintFailure(env, ctx, {
      enrichmentId: meta.enrichmentId,
      tractate: meta.tractate,
      page: meta.page,
      lang: meta.lang,
      attempts: count,
      issues: meta.issues.map(summarizeIssue),
    });
  }
  return true;
}

/** Append a capped failure to the ring buffer + bump its per-enrichment count.
 *  Fire-and-forget (ctx.waitUntil) so it never adds latency to the response.
 *  Stamps `at` itself so callers pass only the semantic fields. */
export function recordLintFailure(env: Cache, ctx: Ctx, f: Omit<LintFailure, 'at'>): void {
  if (!env.CACHE) return;
  const cache = env.CACHE;
  ctx.waitUntil(
    (async () => {
      try {
        const raw = await cache.get(RECENT_KEY);
        const arr: LintFailure[] = raw ? (JSON.parse(raw) as LintFailure[]) : [];
        arr.unshift({ at: Date.now(), ...f });
        await cache.put(RECENT_KEY, JSON.stringify(arr.slice(0, RECENT_CAP)));

        const craw = await cache.get(COUNTS_KEY);
        const counts: Record<string, number> = craw
          ? (JSON.parse(craw) as Record<string, number>)
          : {};
        counts[f.enrichmentId] = (counts[f.enrichmentId] ?? 0) + 1;
        await cache.put(COUNTS_KEY, JSON.stringify(counts));
      } catch (err) {
        console.warn('[lint-failures] ring-buffer write failed:', String(err));
      }
    })(),
  );
}

export interface LintFailuresSummary {
  recent: LintFailure[];
  counts: Record<string, number>;
}

/** Read the recent-failures ring buffer + per-enrichment totals for /api/usage. */
export async function readLintFailures(cache?: KVNamespace): Promise<LintFailuresSummary> {
  if (!cache) return { recent: [], counts: {} };
  try {
    const [r, c] = await Promise.all([cache.get(RECENT_KEY), cache.get(COUNTS_KEY)]);
    return {
      recent: r ? (JSON.parse(r) as LintFailure[]) : [],
      counts: c ? (JSON.parse(c) as Record<string, number>) : {},
    };
  } catch {
    return { recent: [], counts: {} };
  }
}
