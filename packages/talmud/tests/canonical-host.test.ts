import { describe, expect, it } from 'vitest';
import worker from '../src/worker/index';
import type { Bindings } from '../src/worker/types';

// The worker answers on three hostnames. talmud.dev is the public name;
// talmud.shaunregenbaum.com is the legacy alias and redirects to it. The
// machine surfaces (/mcp, /api/*) are exempt so live clients keep working —
// that exemption is the part worth locking down, since silently redirecting a
// POST /mcp would break MCP clients that don't re-issue the body.
const ctx = {
  waitUntil() {},
  passThroughOnException() {},
} as unknown as ExecutionContext;

function fetchAs(url: string, init?: RequestInit) {
  return worker.fetch(new Request(url, init), {} as Bindings, ctx);
}

describe('canonical host (talmud.dev)', () => {
  it('redirects the legacy host, keeping path and query', async () => {
    const res = await fetchAs('https://talmud.shaunregenbaum.com/Berakhot/2a?lang=he');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://talmud.dev/Berakhot/2a?lang=he');
  });

  // The bare domain and /?query are the SPA's real entry points, and they map
  // to the index.html asset — the case run_worker_first = ["/"] exists to route
  // through the Worker so this redirect can fire at all.
  it('redirects the legacy root', async () => {
    const res = await fetchAs('https://talmud.shaunregenbaum.com/');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://talmud.dev/');
  });

  it('redirects the legacy root with a query string, preserving it', async () => {
    const res = await fetchAs('https://talmud.shaunregenbaum.com/?daf=Berakhot.2a');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://talmud.dev/?daf=Berakhot.2a');
  });

  it('serves the canonical host without redirecting', async () => {
    const res = await fetchAs('https://talmud.dev/api/health');
    expect(res.status).toBe(200);
  });

  it('does not redirect /api/* on the legacy host', async () => {
    const res = await fetchAs('https://talmud.shaunregenbaum.com/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('does not redirect POST /mcp on the legacy host', async () => {
    const res = await fetchAs('https://talmud.shaunregenbaum.com/mcp', { method: 'POST' });
    expect(res.status).not.toBe(301);
  });
});
