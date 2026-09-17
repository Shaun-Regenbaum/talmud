import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { McpEvent } from '../src/mcp/code-mode';
import {
  classifySurface,
  clientHash,
  hitDataPoint,
  mcpDataPoint,
  mcpOutcome,
  statusClass,
  surfaceMiddleware,
  uaFamily,
} from '../src/telemetry/surface';

const headers = (o: Record<string, string>) => new Headers(o);

describe('classifySurface', () => {
  it('the MCP bridge stamps itself', () => {
    expect(classifySurface(headers({ 'x-corpus-via': 'mcp' }))).toBe('mcp');
  });
  it('a browser on our own site is the app', () => {
    expect(classifySurface(headers({ 'sec-fetch-site': 'same-origin' }))).toBe('app');
    expect(classifySurface(headers({ 'sec-fetch-site': 'none' }))).toBe('app');
  });
  it('curl, servers, and other sites are direct API callers', () => {
    expect(classifySurface(headers({}))).toBe('api');
    expect(classifySurface(headers({ 'sec-fetch-site': 'cross-site' }))).toBe('api');
  });
  it('the via header wins even inside a browser', () => {
    expect(
      classifySurface(headers({ 'x-corpus-via': 'mcp', 'sec-fetch-site': 'same-origin' })),
    ).toBe('mcp');
  });
});

describe('uaFamily / clientHash / statusClass', () => {
  it('collapses user agents to a family', () => {
    expect(uaFamily('Mozilla/5.0 (Macintosh) Safari/605')).toBe('browser');
    expect(uaFamily('claude-code/2.1.0')).toBe('claude-code');
    expect(uaFamily('node')).toBe('node');
    expect(uaFamily('')).toBe('none');
    expect(uaFamily(undefined)).toBe('none');
  });
  it('hashes (ip, ua) to a short stable key', async () => {
    const a = await clientHash('1.2.3.4', 'node');
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(await clientHash('1.2.3.4', 'node')).toBe(a);
    expect(await clientHash('1.2.3.5', 'node')).not.toBe(a);
  });
  it('buckets statuses', () => {
    expect(statusClass(200)).toBe('2xx');
    expect(statusClass(404)).toBe('4xx');
    expect(statusClass(503)).toBe('5xx');
  });
});

describe('data points', () => {
  it('hit rows carry the surface, the route pattern, and the latency', () => {
    const p = hitDataPoint({
      surface: 'mcp',
      route: '/api/daf-view/:tractate/:page',
      method: 'GET',
      status: 200,
      ms: 42,
      ua: 'node',
      client: 'abc',
    });
    expect(p.indexes).toEqual(['hit']);
    expect(p.blobs).toEqual([
      'hit',
      'mcp',
      '/api/daf-view/:tractate/:page',
      'GET',
      '2xx',
      'node',
      'abc',
    ]);
    expect(p.doubles).toEqual([42, 1]);
  });
  it('mcp rows classify the outcome and keep a short error snippet', () => {
    const ev: McpEvent = {
      method: 'tools/call',
      tool: 'execute',
      ms: 90_010,
      status: 200,
      error: 'Execution timed out',
      timedOut: true,
    };
    expect(mcpOutcome(ev)).toBe('timeout');
    const p = mcpDataPoint(ev, 'claude-code', 'abc');
    expect(p.blobs?.slice(0, 4)).toEqual(['mcp', 'tools/call', 'execute', 'timeout']);
    expect(p.doubles).toEqual([90_010, 1, 200]);
    expect(mcpOutcome({ timedOut: false, error: 'boom', status: 200 })).toBe('error');
    expect(mcpOutcome({ timedOut: false, status: 500 })).toBe('http-error');
    expect(mcpOutcome({ timedOut: false, status: 200 })).toBe('ok');
  });
});

describe('surfaceMiddleware', () => {
  type B = { SURFACE?: { writeDataPoint(e?: AnalyticsEngineDataPoint): void } };
  function build() {
    const points: AnalyticsEngineDataPoint[] = [];
    const app = new Hono<{ Bindings: B }>();
    app.use(
      '/api/*',
      surfaceMiddleware<B>((env) => env.SURFACE),
    );
    app.get('/api/daf-view/:tractate/:page', (c) => c.json({ ok: true }));
    app.get('/api/boom', (c) => c.json({ error: 'x' }, 500));
    const env: B = { SURFACE: { writeDataPoint: (e) => e && points.push(e) } };
    return { app, env, points };
  }

  it('records the ROUTE PATTERN, not the raw path, and the surface', async () => {
    const { app, env, points } = build();
    const res = await app.request(
      '/api/daf-view/Sotah/4a',
      { headers: { 'x-corpus-via': 'mcp', 'user-agent': 'node' } },
      env,
    );
    expect(res.status).toBe(200);
    expect(points).toHaveLength(1);
    expect(points[0].blobs?.slice(0, 5)).toEqual([
      'hit',
      'mcp',
      '/api/daf-view/:tractate/:page',
      'GET',
      '2xx',
    ]);
  });

  it('records error statuses and never alters the response', async () => {
    const { app, env, points } = build();
    const res = await app.request('/api/boom', {}, env);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'x' });
    expect(points[0].blobs?.[4]).toBe('5xx');
    expect(points[0].blobs?.[1]).toBe('api');
  });

  it('is a no-op without a dataset binding', async () => {
    const { app, points } = build();
    const res = await app.request('/api/daf-view/Sotah/4a', {}, {});
    expect(res.status).toBe(200);
    expect(points).toHaveLength(0);
  });
});
