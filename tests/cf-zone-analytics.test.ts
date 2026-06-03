import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchZoneActivity } from '../src/worker/cf-zone-analytics';

// Build a GraphQL httpRequests1dGroups response for one zone.
function zoneResponse(rows: Array<{ date: string; requests: number; uniques: number; countries?: Record<string, number> }>) {
  return {
    data: {
      viewer: {
        zones: [
          {
            httpRequests1dGroups: rows.map((r) => ({
              dimensions: { date: r.date },
              sum: {
                requests: r.requests,
                countryMap: Object.entries(r.countries ?? {}).map(([clientCountryName, requests]) => ({ clientCountryName, requests })),
              },
              uniq: { uniques: r.uniques },
            })),
          },
        ],
      },
    },
  };
}

// Mock fetch keyed by the zoneTag in the request body, so each zone gets its
// own canned response (or error).
function mockFetchByZone(byZone: Record<string, unknown | { httpError: number } | { gqlError: string }>) {
  return vi.fn(async (_url: string, init: { body: string }) => {
    const tag = JSON.parse(init.body).variables.zoneTag as string;
    const r = byZone[tag];
    if (r && typeof r === 'object' && 'httpError' in r) {
      return { ok: false, status: (r as { httpError: number }).httpError, json: async () => ({}) } as Response;
    }
    if (r && typeof r === 'object' && 'gqlError' in r) {
      return { ok: true, status: 200, json: async () => ({ errors: [{ message: (r as { gqlError: string }).gqlError }] }) } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => r } as unknown as Response;
  });
}

afterEach(() => vi.unstubAllGlobals());

const TOK = { CF_ZONE_ANALYTICS_TOKEN: 't' };

describe('fetchZoneActivity multi-zone', () => {
  it('not configured when token or zone tags missing', async () => {
    expect((await fetchZoneActivity({ CF_ZONE_TAG: 'a,b' })).configured).toBe(false);
    expect((await fetchZoneActivity({ ...TOK, CF_ZONE_TAG: '' })).configured).toBe(false);
  });

  it('merges daily rows across two zones by date', async () => {
    vi.stubGlobal('fetch', mockFetchByZone({
      A: zoneResponse([{ date: '2026-06-02', requests: 100, uniques: 10, countries: { US: 80, IL: 20 } }]),
      B: zoneResponse([{ date: '2026-06-02', requests: 5, uniques: 2, countries: { IL: 5 } }]),
    }));
    const act = await fetchZoneActivity({ ...TOK, CF_ZONE_TAG: 'A,B' }, 30);
    expect(act.ok).toBe(true);
    expect(act.error).toBeUndefined();
    // same-date rows from both zones collapse to one merged row
    expect(act.byDay).toHaveLength(1);
    expect(act.byDay?.[0]).toMatchObject({ date: '2026-06-02', requests: 105, visits: 12 });
    // countries summed across zones
    const il = act.byCountry?.find((c) => c.country === 'IL');
    expect(il?.requests).toBe(25);
    expect(act.totals?.day.requests).toBe(105);
  });

  it('drops an unauthorized zone but still reports the authorized one', async () => {
    vi.stubGlobal('fetch', mockFetchByZone({
      A: zoneResponse([{ date: '2026-06-02', requests: 100, uniques: 10 }]),
      B: { gqlError: 'zones [B] are not authorized' },
    }));
    const act = await fetchZoneActivity({ ...TOK, CF_ZONE_TAG: 'A,B' }, 30);
    expect(act.ok).toBe(true);
    expect(act.totals?.day.requests).toBe(100);
    // partial failure is surfaced in the payload (dashboard hides it while ok)
    expect(act.error).toContain('B');
  });

  it('fails (ok:false) only when every zone fails', async () => {
    vi.stubGlobal('fetch', mockFetchByZone({
      A: { httpError: 403 },
      B: { gqlError: 'not authorized' },
    }));
    const act = await fetchZoneActivity({ ...TOK, CF_ZONE_TAG: 'A,B' }, 30);
    expect(act.configured).toBe(true);
    expect(act.ok).toBe(false);
    expect(act.error).toContain('A');
    expect(act.error).toContain('B');
  });
});
