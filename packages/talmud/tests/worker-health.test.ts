import { describe, expect, it, vi } from 'vitest';
import {
  checkWorkerHealthAndAlert,
  FATAL_OUTCOMES,
  fatalCount,
  fetchWorkerOutcomes,
  parseOutcomes,
} from '../src/worker/worker-health';

describe('parseOutcomes', () => {
  it('folds invocation groups into a status -> count map', () => {
    const m = parseOutcomes([
      { count: 100, dimensions: { status: 'success' } },
      { count: 3, dimensions: { status: 'exceededMemory' } },
      { count: 2, dimensions: { status: 'exceededMemory' } }, // accumulates
      { count: 5, dimensions: {} }, // no status -> ignored
    ]);
    expect(m).toEqual({ success: 100, exceededMemory: 5 });
  });
});

describe('fatalCount', () => {
  it('sums only the isolate-fatal outcomes', () => {
    expect(
      fatalCount({ success: 999, exceededMemory: 4, exceededCpu: 1, scriptThrewException: 7 }),
    ).toBe(5);
    expect(fatalCount({ success: 10 })).toBe(0);
    expect(fatalCount(undefined)).toBe(0);
  });
  it('exceededMemory (the cold-daf OOM) is a fatal outcome', () => {
    expect(FATAL_OUTCOMES).toContain('exceededMemory');
  });
});

// A minimal env + fetch stub so the alert path is testable without the network.
function envWith(opts: {
  groups?: Array<{ count: number; dimensions: { status: string } }>;
  graphqlError?: string;
  configured?: boolean;
  kv?: Map<string, string>;
  email?: (m: unknown) => void;
}) {
  const kv = opts.kv ?? new Map<string, string>();
  const CACHE = {
    get: async (k: string) => kv.get(k) ?? null,
    put: async (k: string, v: string) => void kv.set(k, v),
  } as unknown as KVNamespace;
  const env = {
    CACHE,
    EMAIL: opts.email ? { send: async (m: unknown) => opts.email?.(m) } : undefined,
    CLOUDFLARE_ACCOUNT_ID: opts.configured === false ? undefined : 'acct',
    CF_ANALYTICS_TOKEN: opts.configured === false ? undefined : 'tok',
  };
  const fetchStub = vi.fn(async () => {
    const body = opts.graphqlError
      ? { errors: [{ message: opts.graphqlError }] }
      : { data: { viewer: { accounts: [{ workersInvocationsAdaptive: opts.groups ?? [] }] } } };
    return new Response(JSON.stringify(body), { status: 200 });
  });
  return { env, fetchStub, kv };
}

describe('fetchWorkerOutcomes', () => {
  it('degrades to not-configured when token/account are missing (no throw)', async () => {
    const { env } = envWith({ configured: false });
    const out = await fetchWorkerOutcomes(env, 15);
    expect(out.configured).toBe(false);
    expect(out.ok).toBe(false);
  });

  it('degrades to ok:false (never throws) when the GraphQL schema/field names drift', async () => {
    const { env, fetchStub } = envWith({ graphqlError: 'unknown field "status"' });
    vi.stubGlobal('fetch', fetchStub);
    const out = await fetchWorkerOutcomes(env, 15);
    vi.unstubAllGlobals();
    expect(out.ok).toBe(false);
    expect(out.error).toContain('unknown field');
  });
});

describe('checkWorkerHealthAndAlert', () => {
  it('emails once when an isolate-fatal outcome appears, then dedupes within the hour', async () => {
    const sent: unknown[] = [];
    const { env, fetchStub } = envWith({
      groups: [
        { count: 500, dimensions: { status: 'success' } },
        { count: 4, dimensions: { status: 'exceededMemory' } },
      ],
      email: (m) => sent.push(m),
    });
    vi.stubGlobal('fetch', fetchStub);
    const now = 1_000_000_000_000;
    await checkWorkerHealthAndAlert(env, now);
    await checkWorkerHealthAndAlert(env, now + 60_000); // same hour bucket
    vi.unstubAllGlobals();
    expect(sent).toHaveLength(1);
    expect((sent[0] as { subject: string }).subject).toContain('isolate-fatal');
  });

  it('stays silent when there are no fatal outcomes', async () => {
    const sent: unknown[] = [];
    const { env, fetchStub } = envWith({
      groups: [{ count: 500, dimensions: { status: 'success' } }],
      email: (m) => sent.push(m),
    });
    vi.stubGlobal('fetch', fetchStub);
    await checkWorkerHealthAndAlert(env, 1_000_000_000_000);
    vi.unstubAllGlobals();
    expect(sent).toHaveLength(0);
  });

  it('stays silent (no false alert) when the query fails', async () => {
    const sent: unknown[] = [];
    const { env, fetchStub } = envWith({ graphqlError: 'boom', email: (m) => sent.push(m) });
    vi.stubGlobal('fetch', fetchStub);
    await checkWorkerHealthAndAlert(env, 1_000_000_000_000);
    vi.unstubAllGlobals();
    expect(sent).toHaveLength(0);
  });
});
