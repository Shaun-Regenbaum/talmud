import { describe, expect, it } from 'vitest';
import {
  aggregateHitsByDay,
  aggregateMcpByDay,
  aggregateRoutes,
  aggregateTools,
  assembleApp,
  distinctClients,
  SQL,
  windowSums,
} from '../src/worker/surface-analytics';

// Fixed "now": 2026-09-17T12:00Z.
const NOW = Date.UTC(2026, 8, 17, 12);

describe('windowSums', () => {
  it('buckets a daily series into today / 7d / 30d', () => {
    const w = windowSums(
      [
        { date: '2026-09-17', value: 3 },
        { date: '2026-09-12', value: 5 }, // inside 7d (window starts 09-11)
        { date: '2026-09-10', value: 7 }, // outside 7d, inside 30d
        { date: '2026-08-01', value: 100 }, // outside 30d
      ],
      NOW,
    );
    expect(w).toEqual({ day: 3, week: 8, month: 15 });
  });
});

describe('aggregateHitsByDay', () => {
  it('pivots (day, surface, hits) rows into one row per day', () => {
    const rows = aggregateHitsByDay([
      { day: '2026-09-16 00:00:00', surface: 'app', hits: '10' },
      { day: '2026-09-16 00:00:00', surface: 'mcp', hits: 4 },
      { day: '2026-09-17 00:00:00', surface: 'api', hits: 2 },
      { day: '2026-09-17 00:00:00', surface: 'weird', hits: 9 }, // ignored
    ]);
    expect(rows).toEqual([
      { date: '2026-09-16', app: 10, mcp: 4, api: 0 },
      { date: '2026-09-17', app: 0, mcp: 0, api: 2 },
    ]);
  });
});

describe('aggregateMcpByDay', () => {
  it('separates connects from tool calls, and counts errors vs timeouts', () => {
    const { byDay, connects } = aggregateMcpByDay([
      { day: '2026-09-17', method: 'initialize', outcome: 'ok', calls: 3 },
      { day: '2026-09-17', method: 'tools/call', outcome: 'ok', calls: 10 },
      { day: '2026-09-17', method: 'tools/call', outcome: 'timeout', calls: 2 },
      { day: '2026-09-17', method: 'tools/call', outcome: 'error', calls: 1 },
      { day: '2026-09-17', method: 'tools/list', outcome: 'ok', calls: 5 }, // not a call
    ]);
    expect(byDay).toEqual([{ date: '2026-09-17', calls: 13, errors: 1, timeouts: 2 }]);
    expect(connects).toEqual([{ date: '2026-09-17', value: 3 }]);
  });
});

describe('aggregateTools / aggregateRoutes', () => {
  it('folds outcome rows into one row per tool with latency from the ok row', () => {
    const t = aggregateTools([
      { tool: 'execute', outcome: 'ok', calls: 20, p50: 800, p95: 30000 },
      { tool: 'execute', outcome: 'timeout', calls: 3, p50: 90000, p95: 90000 },
      { tool: 'search', outcome: 'ok', calls: 8, p50: 100, p95: 300 },
    ]);
    expect(t[0]).toEqual({
      tool: 'execute',
      calls: 23,
      ok: 20,
      errors: 0,
      timeouts: 3,
      p50Ms: 800,
      p95Ms: 30000,
    });
    expect(t[1].tool).toBe('search');
  });
  it('folds status rows into one row per route with an error count', () => {
    const r = aggregateRoutes([
      { route: '/api/daf-view/:tractate/:page', status: '2xx', hits: 50, p95: 900 },
      { route: '/api/daf-view/:tractate/:page', status: '4xx', hits: 2, p95: 10 },
      { route: '/api/run', status: '2xx', hits: 7, p95: 5000 },
    ]);
    expect(r[0]).toEqual({
      route: '/api/daf-view/:tractate/:page',
      hits: 52,
      errors: 2,
      p95Ms: 900,
    });
    expect(r[1].route).toBe('/api/run');
  });
});

describe('distinctClients', () => {
  it('counts distinct callers per window (a caller seen twice counts once)', () => {
    const w = distinctClients(
      [
        { day: '2026-09-17', client: 'a' },
        { day: '2026-09-17', client: 'b' },
        { day: '2026-09-15', client: 'a' },
        { day: '2026-09-01', client: 'c' },
      ],
      NOW,
    );
    expect(w).toEqual({ day: 2, week: 2, month: 3 });
  });
});

describe('assembleApp + SQL', () => {
  it('builds the full per-app shape from the six result sets', () => {
    const a = assembleApp(
      {
        hits: [{ day: '2026-09-17', surface: 'mcp', hits: 4 }],
        mcp: [{ day: '2026-09-17', method: 'tools/call', outcome: 'ok', calls: 4 }],
        tools: [{ tool: 'execute', outcome: 'ok', calls: 4, p50: 1, p95: 2 }],
        clients: [{ day: '2026-09-17', client: 'x' }],
        routes: [{ route: '/api/daf/:tractate/:page', status: '2xx', hits: 4, p95: 3 }],
        errors: [],
      },
      NOW,
    );
    expect(a.ok).toBe(true);
    expect(a.hits.mcp).toEqual({ day: 4, week: 4, month: 4 });
    expect(a.mcp.calls.day).toBe(4);
    expect(a.mcp.clients.day).toBe(1);
    expect(a.mcp.byTool[0].tool).toBe('execute');
    expect(a.mcp.topRoutes[0].route).toBe('/api/daf/:tractate/:page');
  });
  it('queries the right dataset and only its own record kind', () => {
    expect(SQL.hitsByDay('talmud_surface', 30)).toContain(
      "FROM talmud_surface WHERE index1 = 'hit'",
    );
    expect(SQL.mcpTools('tanach_surface', 30)).toContain("blob2 = 'tools/call'");
    expect(SQL.mcpRoutes('talmud_surface', 30)).toContain("blob2 = 'mcp'");
  });
});
