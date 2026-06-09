import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { getRabbiEntryOr404, readJsonBody } from '../src/worker/http-helpers';

// These helpers replace boilerplate that appeared verbatim across ~18 route
// bodies in index.ts. The tests pin the contract those call sites relied on:
// the success value passes through untouched, and the failure path returns the
// exact status + body each handler used to emit by hand.

const app = new Hono();

app.post('/echo', async (c) => {
  const r = await readJsonBody<{ x: number }>(c);
  if (!r.ok) return r.response;
  return c.json({ got: r.value.x });
});

app.post('/echo-custom', async (c) => {
  const r = await readJsonBody(c, { ok: false, error: 'bad-json' });
  if (!r.ok) return r.response;
  return c.json({ ok: true });
});

const RABBIS: Record<string, { name: string }> = { hillel: { name: 'Hillel' } };
app.get('/rabbi/:slug', (c) => {
  const r = getRabbiEntryOr404(c, RABBIS);
  if (!r.ok) return r.response;
  return c.json({ slug: r.slug, name: r.entry.name });
});

describe('readJsonBody', () => {
  it('returns the parsed value on valid JSON', async () => {
    const res = await app.request('/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ x: 42 }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ got: 42 });
  });

  it('returns 400 with the default error body on invalid JSON', async () => {
    const res = await app.request('/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json{',
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid JSON' });
  });

  it('honors a custom error body shape', async () => {
    const res = await app.request('/echo-custom', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{{',
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'bad-json' });
  });
});

describe('getRabbiEntryOr404', () => {
  it('resolves a known slug to its entry', async () => {
    const res = await app.request('/rabbi/hillel');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ slug: 'hillel', name: 'Hillel' });
  });

  it('returns 404 with the unknown-slug message for a missing slug', async () => {
    const res = await app.request('/rabbi/nobody');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'unknown slug: nobody' });
  });
});
