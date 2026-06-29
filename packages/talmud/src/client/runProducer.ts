/**
 * THE single client path to run a producer.
 *
 * Every client surface that generates content — the reader's enrichment cards,
 * the Q&A panel, the argument narrative, the dev marks registry — used to carry
 * its own copy of "POST /api/run, parse, handle paused/error, poll
 * /api/run-status until done". Four copies drifted apart: one missed the
 * AI-paused banner, two skipped defensive parsing, the budget/credits handling
 * was inconsistent. This is the one implementation they now share.
 *
 * It owns the cross-cutting behaviour that must be identical everywhere:
 *   - defensive parsing (a recycled / OOM'd edge isolate returns a non-JSON
 *     error PAGE; parseRunJson turns that into a classified retryable error),
 *   - raising the shared AI-paused banner on a paused / out-of-credits response
 *     (noteAiResponse) and clearing it on recovery (noteAiSuccess),
 *   - mapping a budget pause to the PAUSED_ERROR sentinel the UI localises,
 *   - following a queued job through run-status to its result.
 *
 * The genuinely per-caller variations are options: studio headers, an abort
 * signal, the poll timeout, POST retry backoffs, and an optional activity-panel
 * entry. Bounded-concurrency queueing + the client result cache stay in
 * MarkEnrichmentCards (the reader's fan-out concern) and wrap a call to this.
 */

import { noteAiResponse, noteAiSuccess } from '@corpus/ui/aiStatus';
import { trackAI } from './aiActivity';
import {
  isAbort,
  isPausedBody,
  isServiceUnavailableError,
  PAUSED_ERROR,
  parseRunJson,
  type RunResult,
} from './enrichmentQueue';

/** The /api/run + /api/run-status response envelope (the fields this module
 *  acts on; callers narrow `result` to whatever shape they render). */
interface RunResponse {
  status?: 'ok' | 'error' | 'pending';
  result?: RunResult;
  runId?: string;
  cacheKey?: string;
  error?: string;
}

export interface RunProducerOptions {
  /** Extra request headers merged with Content-Type (e.g. the studio secret). */
  headers?: Record<string, string>;
  /** Abort the POST + polling (per-card controller, daf change, sidebar close). */
  signal?: AbortSignal;
  /** Max ms to poll run-status before giving up. Default 10 min. */
  pollTimeoutMs?: number;
  /** Poll cadence in ms. Default 1500. */
  pollIntervalMs?: number;
  /** Backoffs (ms) to retry the POST on a transient non-JSON edge error. Default
   *  [] (no retry); the reader's fan-out passes a couple of short backoffs. */
  postRetryBackoffs?: number[];
  /** When set, surface the run in the activity panel (queued -> loading -> done). */
  activity?: { id: string; label: string };
}

const DEFAULT_POLL_TIMEOUT_MS = 600_000;
const DEFAULT_POLL_INTERVAL_MS = 1500;

/** Abortable sleep — rejects with an AbortError if the signal fires while waiting. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

/**
 * Run a producer and resolve to its RunResult. Throws PAUSED_ERROR on a budget
 * pause, a service-unavailable Error on a transient outage, the run's error on a
 * genuine failure, or an AbortError if the signal fires.
 */
export function runProducer(
  body: Record<string, unknown>,
  opts: RunProducerOptions = {},
): Promise<RunResult> {
  const work = () => runProducerImpl(body, opts);
  return opts.activity ? trackAI(opts.activity.id, opts.activity.label, work) : work();
}

async function runProducerImpl(
  body: Record<string, unknown>,
  opts: RunProducerOptions,
): Promise<RunResult> {
  const backoffs = opts.postRetryBackoffs ?? [];
  let r!: Response;
  let j: unknown;
  for (let attempt = 0; ; attempt++) {
    r = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
    try {
      j = await parseRunJson(r);
      break;
    } catch (err) {
      // parseRunJson only throws (service-unavailable) on a NON-JSON edge page
      // (1101 / empty 5xx from a recycled isolate). Retry a couple of times on a
      // short backoff; any other failure (abort, JSON 4xx) rethrows.
      if (isAbort(err) || attempt >= backoffs.length || !isServiceUnavailableError(err)) throw err;
      await sleep(backoffs[attempt], opts.signal);
    }
  }
  noteAiResponse(j);
  if (isPausedBody(j)) throw new Error(PAUSED_ERROR);
  if (!r.ok && r.status !== 202) {
    throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
  }
  const res = j as RunResponse;
  if ('status' in res) {
    if (res.status === 'ok' && res.result) {
      noteAiSuccess();
      return res.result;
    }
    if (res.status === 'error') throw new Error(res.error ?? 'run failed');
    if (res.status === 'pending' && res.runId) return pollProducer(res.runId, res.cacheKey, opts);
  }
  // Legacy/synchronous shape — treat the whole body as a RunResult.
  return j as unknown as RunResult;
}

async function pollProducer(
  runId: string,
  cacheKey: string | undefined,
  opts: RunProducerOptions,
): Promise<RunResult> {
  const timeoutMs = opts.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  const intervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const qs = cacheKey ? `?k=${encodeURIComponent(cacheKey)}` : '';
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(intervalMs, opts.signal);
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const r = await fetch(`/api/run-status/${encodeURIComponent(runId)}${qs}`, {
      signal: opts.signal,
    });
    let j: unknown;
    try {
      j = await parseRunJson(r);
    } catch (err) {
      if (isAbort(err)) throw err;
      // Transient non-JSON edge error mid-poll; the job may still be running
      // server-side, so keep polling rather than failing.
      continue;
    }
    noteAiResponse(j);
    if (isPausedBody(j)) throw new Error(PAUSED_ERROR);
    const res = j as RunResponse;
    if (res.status === 'ok' && res.result) {
      noteAiSuccess();
      return res.result;
    }
    if (res.status === 'error') throw new Error(res.error ?? 'run failed');
    // pending — keep polling
  }
  throw new Error(`run ${runId} timed out after ${Math.round(timeoutMs / 1000)}s`);
}
