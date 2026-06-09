import {
  type BudgetEnv,
  budgetStatus,
  checkBudget,
  clearPauses,
  computeSpendUsd,
  recordSpend,
} from '@corpus/core/llm/budget';
import { describe, expect, it } from 'vitest';

// Minimal in-memory KV. budget.ts only uses get / put / delete; TTLs are
// ignored (tests model window roll-over by passing a different `now`, not by
// simulating expiry).
function makeFakeKV(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const kv = {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => {
      store.set(k, v);
    },
    delete: async (k: string) => {
      store.delete(k);
    },
    list: async () => ({ keys: [], list_complete: true, cursor: '' }),
    getWithMetadata: async () => ({ value: null, metadata: null }),
  };
  return { kv: kv as unknown as KVNamespace, store };
}

// Fake send_email binding that captures every message it's asked to send.
function makeFakeEmail() {
  const sent: Array<{ to: string; from: string; subject: string; text?: string }> = [];
  const email = {
    send: async (m: { to: string; from: string; subject: string; text?: string }) => {
      sent.push(m);
      return { messageId: `m${sent.length}` };
    },
  };
  return { email, sent };
}

// 2026-05-27 19:43 UTC -> day bucket 20260527, hour bucket 2026052719.
const T = Date.UTC(2026, 4, 27, 19, 43, 0);
const DAY = '20260527';
const HOUR = '2026052719';

describe('computeSpendUsd', () => {
  it('prefers the billed cost when present', () => {
    expect(
      computeSpendUsd('openrouter/deepseek/deepseek-v4-flash', {
        cost: 0.42,
        prompt_tokens: 1000,
        completion_tokens: 1000,
      }),
    ).toBe(0.42);
  });
  it('falls back to list-price estimation for priced models', () => {
    // flash = $0.14 / $0.28 per 1M; 1M in + 1M out = 0.42
    expect(
      computeSpendUsd('openrouter/deepseek/deepseek-v4-flash', {
        prompt_tokens: 1_000_000,
        completion_tokens: 1_000_000,
      }),
    ).toBeCloseTo(0.42, 6);
  });
  it('returns 0 for unpriced (@cf/*) models with no billed cost', () => {
    expect(
      computeSpendUsd('@cf/google/gemma-4-26b-a4b-it', {
        prompt_tokens: 1000,
        completion_tokens: 1000,
      }),
    ).toBe(0);
  });
});

describe('checkBudget — fail-open without cache', () => {
  it('allows when there is no CACHE binding', async () => {
    expect(await checkBudget({}, { custom: true }, T)).toEqual({ ok: true });
  });
});

describe('daily total cap', () => {
  it('does not pause while under the trip point', async () => {
    const { kv } = makeFakeKV();
    const env: BudgetEnv = { CACHE: kv, DAILY_BUDGET_USD: '10' }; // trip = 9.5
    await recordSpend(
      env,
      { model: 'openrouter/deepseek/deepseek-v4-pro', usage: { cost: 5 }, custom: false },
      T,
    );
    expect((await checkBudget(env, { custom: false }, T)).ok).toBe(true);
  });

  it('latches an all-scope pause once the trip point is reached, blocking even non-custom calls', async () => {
    const { kv } = makeFakeKV();
    const env: BudgetEnv = { CACHE: kv, DAILY_BUDGET_USD: '10' }; // trip = 9.5
    await recordSpend(
      env,
      { model: 'openrouter/deepseek/deepseek-v4-pro', usage: { cost: 9.6 }, custom: false },
      T,
    );
    const decision = await checkBudget(env, { custom: false }, T);
    expect(decision.ok).toBe(false);
    expect(decision.scope).toBe('all');
    // Pause lifts at the next UTC midnight.
    expect(decision.until).toBe(Date.UTC(2026, 4, 28, 0, 0, 0));
  });

  it('exposes a human-readable reason on a pause (so the UI can tell the user why)', async () => {
    const { kv } = makeFakeKV();
    const env: BudgetEnv = { CACHE: kv, DAILY_BUDGET_USD: '10' };
    await recordSpend(
      env,
      { model: 'openrouter/deepseek/deepseek-v4-pro', usage: { cost: 9.6 }, custom: false },
      T,
    );
    const decision = await checkBudget(env, { custom: false }, T);
    expect(decision.ok).toBe(false);
    expect(typeof decision.reason).toBe('string');
    expect((decision.reason ?? '').length).toBeGreaterThan(0);
  });

  it('uses 90% of the cap as the trip point (in-flight headroom)', async () => {
    const { kv } = makeFakeKV();
    const env: BudgetEnv = { CACHE: kv, DAILY_BUDGET_USD: '100' }; // trip = 90
    await recordSpend(env, { model: 'x', usage: { cost: 89 }, custom: false }, T);
    expect((await checkBudget(env, { custom: false }, T)).ok).toBe(true);
    await recordSpend(env, { model: 'x', usage: { cost: 2 }, custom: false }, T); // total 91 >= 90
    expect((await checkBudget(env, { custom: false }, T)).ok).toBe(false);
  });
});

describe('hourly custom cap', () => {
  it('blocks custom calls but not background calls when only the custom cap is hit', async () => {
    const { kv } = makeFakeKV();
    const env: BudgetEnv = { CACHE: kv, HOURLY_CUSTOM_BUDGET_USD: '0.5', DAILY_BUDGET_USD: '1000' };
    await recordSpend(env, { model: 'x', usage: { cost: 0.6 }, custom: true }, T);
    const custom = await checkBudget(env, { custom: true }, T);
    expect(custom.ok).toBe(false);
    expect(custom.scope).toBe('custom');
    expect(custom.until).toBe(T + 3_600_000); // one hour
    // Non-custom (daily total still way under its cap) keeps flowing.
    expect((await checkBudget(env, { custom: false }, T)).ok).toBe(true);
  });

  it('a fresh hour bucket starts at $0 (window roll-over)', async () => {
    const { kv } = makeFakeKV();
    const env: BudgetEnv = { CACHE: kv, HOURLY_CUSTOM_BUDGET_USD: '0.5', DAILY_BUDGET_USD: '1000' };
    await recordSpend(env, { model: 'x', usage: { cost: 0.6 }, custom: true }, T);
    // Latch was set with until = T + 1h; one hour later it has lifted AND the
    // new hour's counter is empty, so a custom call is allowed again.
    const nextHour = T + 3_600_000 + 1000;
    expect((await checkBudget(env, { custom: true }, nextHour)).ok).toBe(true);
  });
});

describe('defensive re-derivation', () => {
  it('blocks (and re-arms the latch) when the counter is over-cap but no latch was written', async () => {
    // Simulate a lost latch write: the daily counter shows over-cap, but the
    // pause:all key is absent.
    const { kv, store } = makeFakeKV({ [`budget:v1:total:${DAY}`]: '500' });
    const env: BudgetEnv = { CACHE: kv }; // default cap 300 -> trip 285
    expect(store.has('budget:v1:pause:all')).toBe(false);
    const decision = await checkBudget(env, { custom: false }, T);
    expect(decision.ok).toBe(false);
    expect(decision.scope).toBe('all');
    expect(store.has('budget:v1:pause:all')).toBe(true); // re-armed
  });
});

describe('unpriced calls', () => {
  it('do not move the counters', async () => {
    const { kv, store } = makeFakeKV();
    const env: BudgetEnv = { CACHE: kv };
    await recordSpend(
      env,
      { model: '@cf/google/gemma-4-26b-a4b-it', usage: { prompt_tokens: 9999 }, custom: true },
      T,
    );
    expect(store.has(`budget:v1:total:${DAY}`)).toBe(false);
    expect(store.has(`budget:v1:custom:${HOUR}`)).toBe(false);
  });
});

describe('spend alert emails', () => {
  it('emails once when the daily cap trips, and dedupes within the same day', async () => {
    const { kv } = makeFakeKV();
    const { email, sent } = makeFakeEmail();
    const env: BudgetEnv = { CACHE: kv, DAILY_BUDGET_USD: '10', EMAIL: email }; // trip = 9.5
    await recordSpend(env, { model: 'x', usage: { cost: 9.6 }, custom: false }, T);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('shaunregenbaum@gmail.com');
    expect(sent[0].subject).toContain('Daily LLM spend paused');
    // Subsequent over-trip spend the same day must NOT send again.
    await recordSpend(env, { model: 'x', usage: { cost: 1 }, custom: false }, T + 1000);
    expect(sent).toHaveLength(1);
  });

  it('emails when the hourly custom cap trips', async () => {
    const { kv } = makeFakeKV();
    const { email, sent } = makeFakeEmail();
    const env: BudgetEnv = {
      CACHE: kv,
      HOURLY_CUSTOM_BUDGET_USD: '0.5',
      DAILY_BUDGET_USD: '1000',
      EMAIL: email,
    };
    await recordSpend(env, { model: 'x', usage: { cost: 0.6 }, custom: true }, T);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain('custom-question spend cap');
  });

  it('does not email while under the trip point', async () => {
    const { kv } = makeFakeKV();
    const { email, sent } = makeFakeEmail();
    const env: BudgetEnv = { CACHE: kv, DAILY_BUDGET_USD: '10', EMAIL: email };
    await recordSpend(env, { model: 'x', usage: { cost: 5 }, custom: false }, T);
    expect(sent).toHaveLength(0);
  });

  it('still records spend (no throw) when no EMAIL binding is present', async () => {
    const { kv, store } = makeFakeKV();
    const env: BudgetEnv = { CACHE: kv, DAILY_BUDGET_USD: '10' };
    await recordSpend(env, { model: 'x', usage: { cost: 9.6 }, custom: false }, T);
    expect(store.has('budget:v1:pause:all')).toBe(true);
  });
});

describe('budgetStatus + clearPauses', () => {
  it('reports spend + caps and clears latches', async () => {
    const { kv } = makeFakeKV();
    const env: BudgetEnv = { CACHE: kv, DAILY_BUDGET_USD: '10', HOURLY_CUSTOM_BUDGET_USD: '0.5' };
    await recordSpend(env, { model: 'x', usage: { cost: 0.6 }, custom: true }, T);

    const status = await budgetStatus(env, T);
    expect(status.daily.spentUsd).toBeCloseTo(0.6, 6);
    expect(status.daily.capUsd).toBe(10);
    expect(status.daily.tripUsd).toBeCloseTo(9.0, 6);
    expect(status.customHourly.spentUsd).toBeCloseTo(0.6, 6);
    expect(status.pause.custom).not.toBeNull();

    await clearPauses(env);
    const after = await budgetStatus(env, T);
    expect(after.pause.custom).toBeNull();
    // Counter still reflects spend, so a re-check immediately re-arms.
    const recheck = await checkBudget(env, { custom: true }, T);
    expect(recheck.ok).toBe(false);
  });
});
