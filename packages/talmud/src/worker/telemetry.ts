// Recent-window request telemetry (latency / cache-hit / tokens / cost),
// extracted from index.ts. Buffers the last 500 records in KV under
// `telemetry:v1:recent`; the admin/usage routes roll these up for the dashboard.
//
// This is the cross-cutting recorder every route reaches for, so it lives in a
// neutral module (importing only ./types + ./pricing) — see types.ts on why.
// captureLlmUsage / recordObserved* stay in index.ts: they depend on RunCtx,
// which is core to the run engine, not telemetry.

import { normalizeUsage, costUsd as priceCostUsd } from '@corpus/core/llm/pricing';
import type { Bindings } from './types';

// String-typed so composed labels like `stage-a-<classifyError>` work without
// requiring a combinatorial explosion of literal types. Classifier values are
// still the core vocabulary; two-stage handlers prefix with `stage-a-` /
// `stage-b-` to distinguish which pipeline step errored.
export type TelemetryEndpoint = string;
export type TelemetryErrorKind = string;

export interface TelemetryRecord {
  ts: number;
  endpoint: TelemetryEndpoint;
  tractate?: string;
  page?: string;
  cache_hit: boolean;
  model?: string;
  ms: number;
  ok: boolean;
  error_kind?: TelemetryErrorKind;
  /** Set when endpoint === 'studio-mark'. */
  mark_id?: string;
  /** Set when endpoint === 'studio-enrichment'. */
  enrichment_id?: string;
  /** Token usage + estimated USD cost for the (recent-window) cost view.
   *  cost_usd is null when the model has no known list price. */
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number | null;
}

export function classifyError(detail: string): TelemetryErrorKind {
  if (/empty payload/i.test(detail)) return 'empty-payload';
  if (/non-json|SyntaxError/i.test(detail)) return 'non-json';
  if (/schema mismatch/i.test(detail)) return 'schema-mismatch';
  if (/1031|UpstreamError/i.test(detail)) return 'upstream-1031';
  if (/^HTTP \d|status \d/i.test(detail)) return 'http';
  return 'other';
}

// Fire-and-forget telemetry recorder: does NOT block the response. Caller
// should pass c.executionCtx so the write finishes after the client is served.
export function recordTelemetry(
  ctx: { env: Bindings; executionCtx: ExecutionContext },
  rec: Omit<TelemetryRecord, 'ts'>,
): void {
  const full: TelemetryRecord = { ts: Date.now(), ...rec };
  ctx.executionCtx.waitUntil(logTelemetry(ctx.env.CACHE, full));
}

async function logTelemetry(cache: KVNamespace | undefined, rec: TelemetryRecord): Promise<void> {
  if (!cache) return;
  try {
    const key = 'telemetry:v1:recent';
    const existing = await cache.get(key);
    const arr = existing ? (JSON.parse(existing) as TelemetryRecord[]) : [];
    arr.push(rec);
    while (arr.length > 500) arr.shift();
    await cache.put(key, JSON.stringify(arr), { expirationTtl: 60 * 60 * 24 * 30 });
  } catch (err) {
    console.warn('[telemetry] KV write failed:', String(err));
  }
}

/** Build a studio-run telemetry record (latency + cache-hit + tokens/cost) for
 *  a mark or enrichment run. Used at the queue-job boundary and the producer
 *  cache-hit fast path so per-mark / per-enrichment latency + hit-rate reflect
 *  the real pipeline (translate was previously the only thing recording). */
export function runTelemetryRec(
  job: { mark_id?: string; enrichment_id?: string; tractate: string; page: string },
  result: { model?: string; usage?: unknown; parse_error?: string | null; cache_hit?: boolean },
  ms: number,
): Omit<TelemetryRecord, 'ts'> {
  const { input, output } = normalizeUsage(result.usage as Parameters<typeof normalizeUsage>[0]);
  const cost = priceCostUsd(result.model, result.usage as Parameters<typeof priceCostUsd>[1]);
  const isMark = !!job.mark_id;
  return {
    endpoint: isMark ? 'studio-mark' : job.enrichment_id ? 'studio-enrichment' : 'studio-adhoc',
    tractate: job.tractate,
    page: job.page,
    cache_hit: result.cache_hit ?? false,
    model: result.model,
    ms,
    ok: !result.parse_error,
    error_kind: result.parse_error ? classifyError(result.parse_error) : undefined,
    mark_id: job.mark_id,
    enrichment_id: job.enrichment_id,
    tokens_in: input,
    tokens_out: output,
    cost_usd: cost,
  };
}
