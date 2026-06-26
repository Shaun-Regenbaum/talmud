/**
 * Worker health watch — alert on isolate-fatal outcomes (the cold-daf OOM).
 *
 * The OOM that took out every card was invisible until someone hand-tailed the
 * worker: Cloudflare killed the isolate with outcome `exceededMemory`, and the
 * only symptom readers saw was `error code: 1101`. The structural fix (rishonim
 * cap #440, coalescing #439, consumer concurrency #441) makes that outcome
 * improbable — but a future source-growth regression could push it back. This
 * watch closes the loop: it polls Cloudflare's `workersInvocationsAdaptive`
 * analytics each 5-min cron tick and emails when an isolate-fatal outcome
 * appears, so the next regression is caught in minutes, not from user reports.
 *
 * Reuses the account-scoped CF_ANALYTICS_TOKEN + CLOUDFLARE_ACCOUNT_ID already
 * used by aigw-analytics.ts. If the token lacks "Account Analytics: Read" for
 * Workers (or the dataset field names ever drift), the query degrades to
 * { ok: false, error } and NO false alert fires — the error is visible via
 * GET /api/worker-health for diagnosis. Never throws into the cron.
 */

const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';

// Isolate-FATAL outcomes: the isolate is destroyed and every co-tenant request
// on it fails. `exceededMemory` is the cold-daf OOM specifically; `exceededCpu`
// is the same class of co-tenant-killing failure. `scriptThrewException` is an
// uncaught throw (the 1101 page) — alert-worthy, but it does NOT necessarily
// kill co-tenants, so it's reported but weighted separately by the caller.
export const FATAL_OUTCOMES = ['exceededMemory', 'exceededCpu'] as const;

const QUERY = `
query WorkerHealth($accountTag: string!, $script: string!, $start: Time!, $end: Time!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      workersInvocationsAdaptive(
        limit: 100
        filter: { scriptName: $script, datetime_geq: $start, datetime_leq: $end }
      ) {
        sum { requests }
        dimensions { status }
      }
    }
  }
}`;

interface InvocationGroup {
  // workersInvocationsAdaptive is sampling-adjusted; `sum.requests` is the
  // estimated invocation count for the group (there is no top-level `count`).
  sum?: { requests?: number };
  dimensions?: { status?: string };
}

export interface WorkerOutcomes {
  configured: boolean;
  ok: boolean;
  error?: string;
  scriptName?: string;
  windowStart?: string;
  windowEnd?: string;
  /** invocation count keyed by status (outcome), e.g. { success, exceededMemory }. */
  byStatus?: Record<string, number>;
}

interface HealthEnv {
  CACHE?: KVNamespace;
  EMAIL?: {
    send: (m: { from: string; to: string; subject: string; text: string }) => Promise<unknown>;
  };
  CLOUDFLARE_ACCOUNT_ID?: string;
  CF_ANALYTICS_TOKEN?: string;
}

/** Pure: fold raw invocation groups into a status -> count map. */
export function parseOutcomes(groups: InvocationGroup[]): Record<string, number> {
  const byStatus: Record<string, number> = {};
  for (const g of groups) {
    const status = g.dimensions?.status;
    if (!status) continue;
    byStatus[status] = (byStatus[status] ?? 0) + (g.sum?.requests ?? 0);
  }
  return byStatus;
}

/** Pure: total of the isolate-fatal outcomes in a status -> count map. */
export function fatalCount(byStatus: Record<string, number> | undefined): number {
  if (!byStatus) return 0;
  return FATAL_OUTCOMES.reduce((n, s) => n + (byStatus[s] ?? 0), 0);
}

export async function fetchWorkerOutcomes(
  env: HealthEnv,
  minutes = 15,
  scriptName = 'talmud',
): Promise<WorkerOutcomes> {
  const account = env.CLOUDFLARE_ACCOUNT_ID;
  const token = env.CF_ANALYTICS_TOKEN;
  if (!token || !account) {
    const missing = [!token && 'CF_ANALYTICS_TOKEN', !account && 'CLOUDFLARE_ACCOUNT_ID']
      .filter(Boolean)
      .join(', ');
    return { configured: false, ok: false, error: `not configured (missing: ${missing})` };
  }
  const end = new Date();
  const start = new Date(end.getTime() - minutes * 60 * 1000);
  const windowStart = start.toISOString();
  const windowEnd = end.toISOString();
  try {
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        query: QUERY,
        variables: { accountTag: account, script: scriptName, start: windowStart, end: windowEnd },
      }),
    });
    if (!res.ok) {
      return { configured: true, ok: false, error: `HTTP ${res.status}`, scriptName };
    }
    const json = (await res.json()) as {
      data?: {
        viewer?: { accounts?: Array<{ workersInvocationsAdaptive?: InvocationGroup[] }> };
      };
      errors?: Array<{ message?: string }>;
    };
    if (json.errors && json.errors.length > 0) {
      return {
        configured: true,
        ok: false,
        error: json.errors
          .map((e) => e.message)
          .filter(Boolean)
          .join('; ')
          .slice(0, 300),
        scriptName,
      };
    }
    const groups = json.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive ?? [];
    return {
      configured: true,
      ok: true,
      scriptName,
      windowStart,
      windowEnd,
      byStatus: parseOutcomes(groups),
    };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      error: String((err as Error)?.message ?? err).slice(0, 300),
      scriptName,
    };
  }
}

/**
 * Poll the last ~15 min and email if an isolate-fatal outcome appeared. KV-deduped
 * to one alert per hour bucket (a single OOM event sprays many invocations; we
 * don't want one per cron tick). Best-effort and self-contained: any failure is
 * logged, never thrown into the cron.
 */
// The scripts the health watch covers. Generation moved to talmud-gen (its own
// isolate pool), so the isolate-fatal OOMs that used to hit `talmud` now land on
// `talmud-gen` — watch BOTH or the alert goes blind to the very failures it
// exists to catch.
export const WATCHED_SCRIPTS = ['talmud', 'talmud-gen'] as const;

export async function checkWorkerHealthAndAlert(
  env: HealthEnv,
  nowMs: number,
  scripts: readonly string[] = WATCHED_SCRIPTS,
): Promise<void> {
  try {
    const results = await Promise.all(scripts.map((s) => fetchWorkerOutcomes(env, 15, s)));
    const ok = results.filter((r) => r.ok);
    if (ok.length === 0) {
      // Every query failed (not configured / token scope / schema drift): stay
      // quiet (no false alert), but log the first cause. /api/worker-health too.
      const configured = results.find((r) => r.configured);
      if (configured) console.warn('[health] outcomes query failed:', configured.error);
      return;
    }
    const fatal = ok.reduce((n, r) => n + fatalCount(r.byStatus), 0);
    if (fatal <= 0) return;

    const cache = env.CACHE;
    const email = env.EMAIL;
    // One alert per DAY. These outcomes are sporadic (a heavy cron tick / a dense
    // cold daf trips one occasionally), so an hourly alert just spammed the inbox
    // without adding signal — a daily digest says "it happened again today" once,
    // which is all the alert needs to convey.
    const dayBucket = Math.floor(nowMs / 86_400_000);
    const dedupeKey = `health-alert:fatal:${dayBucket}`;
    if (cache) {
      const already = await cache.get(dedupeKey);
      if (already) return; // already alerted today
    }
    if (email) {
      // Per-script breakdown of the fatal outcomes, so the alert says WHICH
      // worker OOMed (reader vs generator) at a glance.
      const lines = ok
        .map((r) => {
          const perScript = Object.entries(r.byStatus ?? {})
            .filter(([s]) => (FATAL_OUTCOMES as readonly string[]).includes(s))
            .map(([s, n]) => `    ${s}: ${n}`)
            .join('\n');
          return perScript ? `  [${r.scriptName}]\n${perScript}` : '';
        })
        .filter(Boolean)
        .join('\n');
      const window = ok[0];
      await email.send({
        from: 'health@shaunregenbaum.com',
        to: 'shaunregenbaum@gmail.com',
        subject: `[talmud] isolate-fatal outcome: ${fatal} in last 15m`,
        text:
          `${fatal} isolate-fatal invocation(s) across ${scripts.join(' + ')} in the last 15 ` +
          `minutes (${window.windowStart} → ${window.windowEnd}):\n\n${lines}\n\n` +
          `This is the class of failure behind the cold-daf OOM (exceededMemory → error code 1101 ` +
          `for every co-tenant request on that isolate). Generation now runs on talmud-gen, so an ` +
          `OOM there should NOT surface as a reader 1101 — but check whether a recent change grew ` +
          `per-job source memory.\n\n` +
          `Live: https://talmud.shaunregenbaum.com/api/worker-health\n` +
          `Usage: https://talmud.shaunregenbaum.com/usage\n`,
      });
    }
    if (cache) {
      await cache.put(dedupeKey, '1', { expirationTtl: 86_400 });
    }
  } catch (err) {
    console.error('[health] checkWorkerHealthAndAlert failed:', err);
  }
}
