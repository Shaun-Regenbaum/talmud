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
      { sum: { requests: 100 }, dimensions: { status: 'success' } },
      { sum: { requests: 3 }, dimensions: { status: 'exceededMemory' } },
      { sum: { requests: 2 }, dimensions: { status: 'exceededMemory' } }, // accumulates
      { sum: { requests: 5 }, dimensions: {} }, // no status -> ignored
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
  groups?: Array<{ sum: { requests: number }; dimensions: { status: string } }>;
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
      : {
          data: {
            viewer: { accounts: [{ workersInvocationsAdaptive: opts.groups ?? [] }] },
          },
        };
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
  it('emails once per day (deduped within the day, re-alerts the next day)', async () => {
    const sent: unknown[] = [];
    // One env → its CACHE (KV) persists across calls, so the dedupe key set on
    // the first alert is seen by later calls.
    const { env, fetchStub } = envWith({
      groups: [
        { sum: { requests: 500 }, dimensions: { status: 'success' } },
        { sum: { requests: 4 }, dimensions: { status: 'exceededMemory' } },
      ],
      email: (m) => sent.push(m),
    });
    vi.stubGlobal('fetch', fetchStub);
    const day = 86_400_000;
    const t0 = 1_000_000_000_000;
    await checkWorkerHealthAndAlert(env, t0);
    await checkWorkerHealthAndAlert(env, t0 + 3_600_000); // +1h, same day → deduped
    expect(sent).toHaveLength(1);
    await checkWorkerHealthAndAlert(env, t0 + day); // next day → re-alerts
    vi.unstubAllGlobals();
    expect(sent).toHaveLength(2);
    expect((sent[0] as { subject: string }).subject).toContain('isolate-fatal');
  });

  it('stays silent when there are no fatal outcomes', async () => {
    const sent: unknown[] = [];
    const { env, fetchStub } = envWith({
      groups: [{ sum: { requests: 500 }, dimensions: { status: 'success' } }],
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

  it('watches BOTH talmud and talmud-gen and breaks the alert down per script', async () => {
    // Generation moved to talmud-gen, so the OOM the alert exists to catch now
    // lands there, not on the reader. The watch must query both.
    const sent: Array<{ subject: string; text: string }> = [];
    const kv = new Map<string, string>();
    const env = {
      CACHE: {
        get: async (k: string) => kv.get(k) ?? null,
        put: async (k: string, v: string) => void kv.set(k, v),
      } as unknown as KVNamespace,
      EMAIL: { send: async (m: { subject: string; text: string }) => void sent.push(m) },
      CLOUDFLARE_ACCOUNT_ID: 'acct',
      CF_ANALYTICS_TOKEN: 'tok',
    };
    // Script-aware stub: the reader is healthy; talmud-gen OOMed 9 times.
    const fetchStub = vi.fn(async (_url: string, init: { body: string }) => {
      const script = JSON.parse(init.body).variables.script as string;
      const groups =
        script === 'talmud-gen'
          ? [{ sum: { requests: 9 }, dimensions: { status: 'exceededMemory' } }]
          : [{ sum: { requests: 500 }, dimensions: { status: 'success' } }];
      return new Response(
        JSON.stringify({
          data: { viewer: { accounts: [{ workersInvocationsAdaptive: groups }] } },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchStub as unknown as typeof fetch);
    await checkWorkerHealthAndAlert(env, 1_000_000_000_000);
    vi.unstubAllGlobals();
    expect(fetchStub).toHaveBeenCalledTimes(2); // one query per watched script
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain('9 in last 15m'); // fatal summed (reader 0 + gen 9)
    expect(sent[0].text).toContain('[talmud-gen]');
    expect(sent[0].text).toContain('exceededMemory: 9');
  });
});
