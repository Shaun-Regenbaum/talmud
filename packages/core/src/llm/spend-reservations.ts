import type { LLMCallOptions } from './llm';
import { LLMError, NEITHER } from './llm-error';
import { priceFor } from './pricing';

export interface ReservationEnv {
  BILLING_DB?: D1Database;
  BILLING_APP?: string;
  DAILY_BUDGET_USD?: string;
  HOURLY_CUSTOM_BUDGET_USD?: string;
}

function cap(value: string | undefined, fallback: number): number {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(n) || n <= 0 || !Number.isSafeInteger(Math.round(n * 1e9)))
    throw new LLMError(503, 'Invalid spending limit', { cls: NEITHER });
  return Math.round(n * 1e9);
}

export function spendingCaps(env: ReservationEnv) {
  return {
    daily: cap(env.DAILY_BUDGET_USD, 300),
    custom: cap(env.HOURLY_CUSTOM_BUDGET_USD, 10),
  };
}

/** Explicit routing ceilings also limit how expensive a fallback host can be.
 * These are admission estimates, not provider invoices. */
export function reservationPrices(model: string) {
  const p = priceFor(model);
  if (!p) throw new LLMError(503, `No reservation price configured for ${model}`, { cls: NEITHER });
  return { prompt: p.inputPer1M * 4, completion: p.outputPer1M * 4, request: 0 };
}

export function reservationNanos(model: string, opts: LLMCallOptions): number {
  const prices = reservationPrices(model);
  if (!Number.isSafeInteger(opts.max_tokens) || opts.max_tokens <= 0)
    throw new LLMError(400, 'A positive output token limit is required', { cls: NEITHER });
  // UTF-8 bytes deliberately overestimate ordinary text token counts. Include
  // schema text plus an allowance for chat framing and provider instructions.
  const bytes = new TextEncoder().encode(
    JSON.stringify([opts.messages, opts.response_format]),
  ).length;
  const n = Math.ceil(
    ((bytes + 4096) * prices.prompt + opts.max_tokens * prices.completion) * 1000,
  );
  if (!Number.isSafeInteger(n)) throw new LLMError(400, 'Request is too large', { cls: NEITHER });
  return Math.max(10_000_000, n);
}

/** One conditional INSERT executes on the primary. Never read a total in JS
 * and then write a reservation: concurrent readers would admit the same money. */
export function admissionStatement(
  env: ReservationEnv & { BILLING_DB: D1Database; BILLING_APP: string },
  id: string,
  at: string,
  held: number,
  custom: boolean,
): D1PreparedStatement {
  const limits = spendingCaps(env);
  const day = `${at.slice(0, 10)}T00:00:00.000Z`;
  const hour = new Date(Date.parse(at) - 3_600_000).toISOString();
  return env.BILLING_DB.prepare(`INSERT INTO spend_reservations
    (attempt_id, app, started_at, custom, held_nanos)
    SELECT ?, ?, ?, ?, ?
    WHERE ? + (SELECT COALESCE(SUM(COALESCE(settled_nanos, held_nanos)), 0)
      FROM spend_reservations WHERE app = ? AND (started_at >= ? OR settled_nanos IS NULL)) <= ?
    AND (? = 0 OR ? + (SELECT COALESCE(SUM(COALESCE(settled_nanos, held_nanos)), 0)
      FROM spend_reservations WHERE app = ? AND custom = 1
        AND (started_at >= ? OR settled_nanos IS NULL)) <= ?)`).bind(
    id,
    env.BILLING_APP,
    at,
    custom ? 1 : 0,
    held,
    held,
    env.BILLING_APP,
    day,
    limits.daily,
    custom ? 1 : 0,
    held,
    env.BILLING_APP,
    hour,
    limits.custom,
  );
}

export async function reservationStatus(env: ReservationEnv, now = Date.now()) {
  if (!env.BILLING_DB || !env.BILLING_APP)
    throw new LLMError(503, 'Spending ledger unavailable', { cls: NEITHER });
  const day = `${new Date(now).toISOString().slice(0, 10)}T00:00:00.000Z`;
  const hour = new Date(now - 3_600_000).toISOString();
  const rows = await env.BILLING_DB.prepare(`SELECT
    COALESCE(SUM(CASE WHEN started_at >= ? THEN settled_nanos ELSE 0 END), 0) AS dailySpent,
    COALESCE(SUM(CASE WHEN custom = 1 AND started_at >= ? THEN settled_nanos ELSE 0 END), 0) AS customSpent,
    COALESCE(SUM(CASE WHEN settled_nanos IS NULL THEN held_nanos ELSE 0 END), 0) AS dailyHeld,
    COALESCE(SUM(CASE WHEN custom = 1 AND settled_nanos IS NULL THEN held_nanos ELSE 0 END), 0) AS customHeld
    FROM spend_reservations WHERE app = ? AND (started_at >= ? OR settled_nanos IS NULL)`)
    .bind(day, hour, env.BILLING_APP, day < hour ? day : hour)
    .first<{ dailySpent: number; customSpent: number; dailyHeld: number; customHeld: number }>();
  if (!rows) throw new LLMError(503, 'Spending totals unavailable', { cls: NEITHER });
  return { ...rows, limits: spendingCaps(env) };
}
