/** Permanent request records. One attempt per network call, one charge per
 * provider generation. Cached responses can reference a charge without paying
 * it again. No prompt text, response text or credentials are stored here. */

import { BudgetPausedError } from '../llm/budget';
import type { LLMCallOptions, LLMUsage } from '../llm/llm';
import { LLMError, NEITHER } from '../llm/llm-error';
import { costUsd } from '../llm/pricing';
import {
  admissionStatement,
  type ReservationEnv,
  reservationNanos,
  reservationStatus,
} from '../llm/spend-reservations';

export interface BillingEnv extends ReservationEnv {
  BILLING_DB?: D1Database;
  BILLING_APP?: string;
  OPENROUTER_API_KEY?: string;
}

export async function credentialHash(key: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function dollarsToNanos(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  const n = Math.round(value * 1e9);
  return Number.isSafeInteger(n) ? n : null;
}

export class BillingAttempt {
  private providerId: string | null = null;
  private usage: LLMUsage | null = null;
  private gatewayHit = false;
  constructor(
    private db: D1Database,
    readonly id: string,
    private app: string,
    private keyHash: string,
    private model: string,
    private startedAt: string,
  ) {}

  /** Persist the generation ID as soon as it arrives, before a stream can fail. */
  async observe(id?: string | null, usage?: LLMUsage | null): Promise<void> {
    const newId = id && !this.providerId;
    if (newId) this.providerId = id;
    if (usage) this.usage = usage;
    if (newId) {
      await this.db
        .prepare('UPDATE billing_attempts SET provider_id = ?, gateway_hit = ? WHERE id = ?')
        .bind(this.providerId, this.gatewayHit ? 1 : 0, this.id)
        .run()
        .catch(() => {
          console.warn('[billing] generation-id write failed', this.id);
        });
    }
  }

  async received(response: Response): Promise<void> {
    this.gatewayHit = response.headers.get('cf-aig-cache-status')?.toUpperCase() === 'HIT';
    if (this.gatewayHit) {
      await this.db
        .prepare('UPDATE billing_attempts SET gateway_hit = 1 WHERE id = ?')
        .bind(this.id)
        .run()
        .catch(() => console.warn('[billing] cache-hit write failed', this.id));
    }
  }

  async finish(status: 'succeeded' | 'failed', errorCode?: string): Promise<void> {
    const u = this.usage;
    const billed = this.gatewayHit ? null : dollarsToNanos(u?.cost);
    const chargeId = billed == null ? null : `${this.keyHash}:${this.providerId ?? this.id}`;
    const statements: D1PreparedStatement[] = [];
    if (chargeId && billed != null) {
      statements.push(
        this.db
          .prepare(`INSERT INTO billing_charges
        (id, attempt_id, app, key_hash, charged_at, billed_nanos) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING`)
          .bind(chargeId, this.id, this.app, this.keyHash, this.startedAt, billed),
      );
    }
    statements.push(
      this.db
        .prepare(`UPDATE billing_attempts SET finished_at = ?, status = ?,
      provider_id = ?, charge_id = ?, gateway_hit = ?, tokens_in = ?, tokens_out = ?,
      tokens_cached = ?, estimated_nanos = ?, error_code = ? WHERE id = ?`)
        .bind(
          new Date().toISOString(),
          status,
          this.providerId,
          chargeId,
          this.gatewayHit ? 1 : 0,
          u?.prompt_tokens ?? null,
          u?.completion_tokens ?? null,
          u?.prompt_tokens_details?.cached_tokens ?? null,
          u ? dollarsToNanos(costUsd(this.model, u)) : null,
          errorCode ?? null,
          this.id,
        ),
    );
    const estimated =
      status === 'succeeded' && this.model.startsWith('@cf/') && u
        ? dollarsToNanos(costUsd(this.model, u))
        : null;
    statements.push(
      this.db
        .prepare(`UPDATE spend_reservations SET
      settled_nanos = COALESCE(CASE WHEN ? = 1 THEN 0
        WHEN ? IS NOT NULL THEN CASE WHEN EXISTS (
          SELECT 1 FROM billing_charges WHERE id = ? AND attempt_id = ?
        ) THEN ? ELSE 0 END ELSE ? END, settled_nanos),
      basis = CASE WHEN ? = 1 OR ? IS NOT NULL THEN 'receipt'
        WHEN ? IS NOT NULL THEN 'estimate' ELSE basis END WHERE attempt_id = ?`)
        .bind(
          this.gatewayHit ? 1 : 0,
          billed,
          chargeId,
          this.id,
          billed,
          estimated,
          this.gatewayHit ? 1 : 0,
          billed,
          estimated,
          this.id,
        ),
    );
    try {
      await this.db.batch(statements);
    } catch {
      // The pre-call record survives. A failed accounting write must never
      // turn a successful paid call into another paid retry.
      console.warn('[billing] settlement write failed', this.id);
    }
  }
}

/** Fail before contacting a provider if the configured ledger cannot record
 * the attempt. Unconfigured local environments retain their existing behavior. */
export async function beginBillingAttempt(
  env: BillingEnv,
  model: string,
  opts: LLMCallOptions,
): Promise<BillingAttempt | null> {
  if (!env.BILLING_DB) return null;
  if (!env.BILLING_APP)
    throw new LLMError(503, 'Billing application is not configured', { cls: NEITHER });
  const id = crypto.randomUUID();
  const at = new Date().toISOString();
  const hash = model.startsWith('openrouter/')
    ? await credentialHash(env.OPENROUTER_API_KEY ?? '')
    : 'workers-ai';
  const a = opts.attribution;
  const held = reservationNanos(model, opts);
  try {
    const insert = env.BILLING_DB.prepare(`INSERT INTO billing_attempts
      (id, app, key_hash, started_at, model, producer, work, unit, lang, version, kind, tag)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM spend_reservations WHERE attempt_id = ?)`).bind(
      id,
      env.BILLING_APP,
      hash,
      at,
      model,
      a?.producerId ?? null,
      a?.tractate ?? null,
      a?.page ?? null,
      a?.lang ?? null,
      a?.cache_version ?? null,
      a?.kind ?? null,
      opts.tag ?? null,
      id,
    );
    const results = await env.BILLING_DB.batch([
      admissionStatement(
        { ...env, BILLING_DB: env.BILLING_DB, BILLING_APP: env.BILLING_APP },
        id,
        at,
        held,
        opts.cost_class === 'custom-question',
      ),
      insert,
    ]);
    if (results[0].meta.changes !== 1) {
      const remaining = await reservationStatus(env);
      const scope =
        opts.cost_class === 'custom-question' &&
        remaining.dailySpent + remaining.dailyHeld + held <= remaining.limits.daily
          ? 'custom'
          : 'all';
      throw new BudgetPausedError(
        scope,
        undefined,
        'Not enough unreserved budget for this request',
      );
    }
  } catch (err) {
    if (err instanceof BudgetPausedError) throw err;
    throw new LLMError(503, 'Billing ledger unavailable', { cls: NEITHER });
  }
  return new BillingAttempt(env.BILLING_DB, id, env.BILLING_APP, hash, model, at);
}

/** Explicit dates avoid mixing partial today with completed provider days. */
export async function billingSummary(db: D1Database, app: string, from: string, through: string) {
  const until = new Date(new Date(`${through}T00:00:00Z`).getTime() + 86_400_000).toISOString();
  const start = `${from}T00:00:00.000Z`;
  const filter = [app, start, until];
  const [totals, groups] = await db.batch([
    db
      .prepare(`SELECT COUNT(*) AS attempts,
      SUM(CASE WHEN a.gateway_hit = 0 AND a.charge_id IS NULL THEN 1 ELSE 0 END) AS unresolved,
      SUM(a.gateway_hit) AS gatewayHits,
      SUM(CASE WHEN a.status = 'failed' THEN 1 ELSE 0 END) AS failed,
      MIN(a.started_at) AS firstRecordedAt,
      (SELECT COALESCE(SUM(billed_nanos), 0) FROM billing_charges
        WHERE app = ? AND charged_at >= ? AND charged_at < ?) AS billedNanos
      FROM billing_attempts a WHERE a.app = ? AND a.started_at >= ? AND a.started_at < ?`)
      .bind(...filter, ...filter),
    db
      .prepare(`SELECT COALESCE(a.producer, a.kind, 'unattributed') AS producer,
      COUNT(DISTINCT a.id) AS attempts, COALESCE(SUM(c.billed_nanos), 0) AS billedNanos
      FROM billing_attempts a LEFT JOIN billing_charges c ON c.attempt_id = a.id
      WHERE a.app = ? AND a.started_at >= ? AND a.started_at < ? GROUP BY COALESCE(a.producer, a.kind, 'unattributed')`)
      .bind(...filter),
  ]);
  return { app, from, through, totals: totals.results[0], byProducer: groups.results };
}

/** Recover usage for interrupted responses whose provider ID was received.
 * Requests without an ID stay explicitly unresolved, including when a later
 * cached response may belong to them: that response can also predate recording
 * or belong to a different request. Never assign its old charge by guessing.
 * Old-key records require
 * that key's reconciliation process; never query them under another key. */
export async function reconcileBilling(env: BillingEnv): Promise<void> {
  const db = env.BILLING_DB;
  if (!db || !env.BILLING_APP || !env.OPENROUTER_API_KEY) return;
  const hash = await credentialHash(env.OPENROUTER_API_KEY);
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - 300_000).toISOString();
  const rows = await db
    .prepare(`SELECT * FROM billing_attempts WHERE app = ? AND key_hash = ?
    AND charge_id IS NULL AND gateway_hit = 0 AND provider_id IS NOT NULL
    AND started_at < ? AND (reconcile_after IS NULL OR reconcile_after <= ?)
    ORDER BY started_at LIMIT 10`)
    .bind(env.BILLING_APP, hash, cutoff, now)
    .all<{
      id: string;
      app: string;
      key_hash: string;
      model: string;
      started_at: string;
      provider_id: string;
      status: string;
    }>();
  for (const row of rows.results) {
    await db
      .prepare('UPDATE billing_attempts SET reconcile_after = ? WHERE id = ?')
      .bind(new Date(Date.now() + 3_600_000).toISOString(), row.id)
      .run();
    try {
      const resp = await fetch(
        `https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(row.provider_id)}`,
        {
          headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!resp.ok) continue;
      const { data } = (await resp.json()) as {
        data?: {
          id?: string;
          total_cost?: number;
          native_tokens_prompt?: number;
          native_tokens_completion?: number;
        };
      };
      if (data?.id !== row.provider_id || dollarsToNanos(data?.total_cost) == null) continue;
      const attempt = new BillingAttempt(
        db,
        row.id,
        row.app,
        row.key_hash,
        row.model,
        row.started_at,
      );
      await attempt.observe(row.provider_id, {
        cost: data.total_cost,
        prompt_tokens: data.native_tokens_prompt,
        completion_tokens: data.native_tokens_completion,
      });
      await attempt.finish(
        row.status === 'succeeded' ? 'succeeded' : 'failed',
        row.status === 'succeeded' ? undefined : 'reconciled-interruption',
      );
    } catch {
      console.warn('[billing] reconciliation deferred', row.id);
    }
  }
}
