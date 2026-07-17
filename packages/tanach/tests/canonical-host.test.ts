import { describe, expect, it } from 'vitest';
import worker from '../src/worker/index';

// tanach.dev is the public name; tanach.shaunregenbaum.com is the legacy alias
// and redirects to it. /api/* is exempt so existing callers (the Talmud app
// links into this reader) keep working untouched.
const ctx = {
  waitUntil() {},
  passThroughOnException() {},
} as unknown as ExecutionContext;

// biome-ignore lint/suspicious/noExplicitAny: the redirect runs before any
// binding is touched, so an empty env is enough to exercise it.
function fetchAs(url: string, init?: RequestInit) {
  return worker.fetch(new Request(url, init), {} as any, ctx);
}

describe('canonical host (tanach.dev)', () => {
  it('redirects the legacy host, keeping path and query', async () => {
    const res = await fetchAs('https://tanach.shaunregenbaum.com/?book=Genesis&chapter=19');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://tanach.dev/?book=Genesis&chapter=19');
  });

  it('redirects the legacy root', async () => {
    const res = await fetchAs('https://tanach.shaunregenbaum.com/');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://tanach.dev/');
  });

  it('does not redirect /api/* on the legacy host', async () => {
    const res = await fetchAs('https://tanach.shaunregenbaum.com/api/chapter/Genesis/19');
    expect(res.status).not.toBe(301);
  });
});
