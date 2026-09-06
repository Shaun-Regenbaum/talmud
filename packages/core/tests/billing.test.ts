import { readFileSync } from 'node:fs';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { reservationNanos, reservationStatus } from '../src/llm/spend-reservations';
import { beginBillingAttempt, billingSummary, dollarsToNanos } from '../src/telemetry/billing';
import gateway from './fixtures/billing-cache-responses.json';
import captured from './fixtures/billing-response.json';

// Replay a real paid response into a real local D1 database. No provider call
// occurs in this suite. Duplicate delivery must not create another charge.
const mf = new Miniflare({
  modules: true,
  script: 'export default { fetch() { return new Response(null, {status: 204}); } }',
  compatibilityDate: '2025-04-01',
  d1Databases: ['BILLING_DB'],
});
let db: D1Database;
beforeAll(async () => {
  db = await mf.getD1Database('BILLING_DB');
  for (const name of [
    '0001_billing.sql',
    '0002_billing_reconciliation.sql',
    '0003_spend_reservations.sql',
  ]) {
    const sql = readFileSync(new URL(`../../talmud/migrations/${name}`, import.meta.url), 'utf8');
    for (const statement of sql
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean))
      await db.prepare(statement).run();
  }
  const triggers = readFileSync(
    new URL('../../talmud/migrations/0004_reservation_rollout.sql', import.meta.url),
    'utf8',
  );
  for (const trigger of triggers
    .split('END;')
    .map((s) => s.trim())
    .filter(Boolean))
    await db.prepare(`${trigger} END;`).run();
  const guard = readFileSync(
    new URL('../../talmud/migrations/0005_reservation_admission_guard.sql', import.meta.url),
    'utf8',
  );
  for (const statement of guard.split('-- next statement')) await db.prepare(statement).run();
});
afterAll(() => mf.dispose());

const opts = {
  messages: captured.request.messages as Array<{ role: 'user'; content: string }>,
  max_tokens: captured.request.max_tokens,
  attribution: { tractate: 'Berakhot', page: '2a', kind: 'mark' as const },
};
const model = `openrouter/${captured.request.model}`;

describe('permanent billing records', () => {
  it('records concurrent attempts and counts the captured charge once', async () => {
    const attempts = await Promise.all(
      Array.from({ length: 12 }, () =>
        beginBillingAttempt({ BILLING_DB: db, BILLING_APP: 'talmud' }, model, opts),
      ),
    );
    for (const a of attempts) expect(a).not.toBeNull();
    await Promise.all(
      attempts.map(async (a) => {
        await a!.observe(captured.response.id, captured.response.usage);
        await a!.finish('succeeded');
        await a!.finish('succeeded');
      }),
    );
    const result = await db
      .prepare('SELECT COUNT(*) AS n FROM billing_attempts')
      .first<{ n: number }>();
    expect(result?.n).toBe(12);
    const charges = await db
      .prepare('SELECT COUNT(*) AS n, SUM(billed_nanos) AS total FROM billing_charges')
      .first<{ n: number; total: number }>();
    expect(charges?.n).toBe(1);
    expect(charges?.total).toBe(dollarsToNanos(captured.response.usage.cost));
  });
  it('keeps an interrupted request unresolved and separates applications', async () => {
    const a = await beginBillingAttempt({ BILLING_DB: db, BILLING_APP: 'tanach' }, model, opts);
    await a!.finish('failed', 'timeout');
    const today = new Date().toISOString().slice(0, 10);
    const summary = await billingSummary(db, 'tanach', today, today);
    expect(summary.totals).toMatchObject({ attempts: 1, unresolved: 1, failed: 1, billedNanos: 0 });
    expect(summary.byProducer).toHaveLength(1);
  });
  it('saves a receipt before completion and counts a charged response even after failure', async () => {
    const recorded = gateway.responses[0];
    const a = await beginBillingAttempt({ BILLING_DB: db, BILLING_APP: 'talmud' }, model, opts);
    await a!.received(new Response(null, { headers: recorded.headers }));
    await a!.observe(recorded.response.id);
    expect(
      await db
        .prepare('SELECT provider_id FROM billing_attempts WHERE id = ?')
        .bind(a!.id)
        .first('provider_id'),
    ).toBe(recorded.response.id);
    await a!.observe(recorded.response.id, recorded.response.usage);
    await a!.finish('failed', 'response-error');
    const charge = await db
      .prepare('SELECT billed_nanos FROM billing_charges WHERE attempt_id = ?')
      .bind(a!.id)
      .first('billed_nanos');
    expect(charge).toBe(dollarsToNanos(recorded.response.usage.cost));
  });
  it('admits only the reservations that fit under concurrent requests', async () => {
    const held = reservationNanos(model, opts);
    const env = {
      BILLING_DB: db,
      BILLING_APP: 'reservation-concurrency',
      DAILY_BUDGET_USD: String((held * 3) / 1e9),
    };
    const results = await Promise.allSettled(
      Array.from({ length: 40 }, () => beginBillingAttempt(env, model, opts)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(37);
    const state = await reservationStatus(env);
    expect(state.dailyHeld).toBe(held * 3);
    const admitted = results.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []));
    await admitted[0].finish('failed', 'timeout');
    expect((await reservationStatus(env)).dailyHeld).toBe(held * 3);
    await expect(beginBillingAttempt(env, model, opts)).rejects.toThrow(
      'Not enough unreserved budget',
    );
    await admitted[0].observe(
      gateway.responses[1].response.id,
      gateway.responses[1].response.usage,
    );
    await admitted[0].finish('succeeded');
    await admitted[0].finish('succeeded');
    const after = await reservationStatus(env);
    expect(after.dailyHeld).toBe(held * 2);
    expect(after.dailySpent).toBe(dollarsToNanos(gateway.responses[1].response.usage.cost));
  });
  it('rejects an older worker inserting an attempt without a reservation', async () => {
    await expect(
      db
        .prepare(`INSERT INTO billing_attempts (id, app, key_hash, started_at, model)
      SELECT ?, app, key_hash, started_at, model FROM billing_attempts LIMIT 1`)
        .bind(crypto.randomUUID())
        .run(),
    ).rejects.toThrow('A spending reservation is required');
  });
  it('applies the custom-question limit without blocking ordinary requests', async () => {
    const held = reservationNanos(model, opts);
    const env = {
      BILLING_DB: db,
      BILLING_APP: 'custom-admission',
      DAILY_BUDGET_USD: String((held * 3) / 1e9),
      HOURLY_CUSTOM_BUDGET_USD: String(held / 1e9),
    };
    const customOpts = { ...opts, cost_class: 'custom-question' as const };
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => beginBillingAttempt(env, model, customOpts)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const ordinary = await beginBillingAttempt(env, model, opts);
    expect(ordinary).not.toBeNull();
    const state = await reservationStatus(env);
    expect(state.customHeld).toBe(held);
    expect(state.dailyHeld).toBe(held * 2);
    const tomorrow = Date.now() + 86_400_000;
    expect((await reservationStatus(env, tomorrow)).dailyHeld).toBe(held * 2);
  });
});
