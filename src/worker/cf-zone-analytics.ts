/**
 * App activity (accesses + geography) from Cloudflare's zone HTTP analytics.
 * Every request to a zone is seen at the CF edge, so its daily-rollup dataset
 * (`httpRequests1dGroups`) gives a true picture of how often the app is hit and
 * from where — without the app logging anything.
 *
 * The app is served on two hosts in two zones: talmud.shaunregenbaum.com (the
 * shaunregenbaum.com zone, where the app is ~98% of traffic) and talmud.dev
 * (a dedicated zone). CF_ZONE_TAG is a COMMA-SEPARATED list of zone ids; each
 * is queried independently and the daily rows are merged by date so the Usage
 * page shows combined app traffic across both domains. (One visitor hitting
 * both hosts is counted in each zone's `uniques`, so merged "visits" can
 * slightly double-count cross-domain visitors — acceptable for a traffic gauge;
 * `requests` is an exact sum.)
 *
 * Requires a Cloudflare API token with "Zone Analytics: Read" on EVERY zone in
 * CF_ZONE_TAG. The account-scoped CF_ANALYTICS_TOKEN used for AI Gateway cost is
 * NOT enough (it has no zone access). Set a dedicated token:
 *   wrangler secret put CF_ZONE_ANALYTICS_TOKEN
 * and the zone ids (not secret) as a var:  CF_ZONE_TAG = "id1,id2"  in
 * wrangler.toml. (If you instead broaden CF_ANALYTICS_TOKEN to include Zone
 * Analytics: Read on those zones, leave CF_ZONE_ANALYTICS_TOKEN unset — this
 * falls back to it.)
 *
 * Per-zone DEGRADATION: zones are fetched independently, so a zone the token
 * isn't authorized for (or that errors) is dropped from the merge while the
 * others still report — the overall result is `ok` as long as at least one zone
 * succeeds. A combined query (`zoneTag_in`) is deliberately NOT used because CF
 * fails the WHOLE query if the token lacks any one zone. When some zones fail
 * the `error` field names them (the dashboard hides it while `ok`, but it's in
 * the raw payload for diagnosis). A missing token/tag, or ALL zones failing,
 * returns the { configured/ok: false, error } shape like aigw-analytics.ts so
 * the dashboard states the problem plainly instead of inventing numbers.
 *
 * NOTE: httpRequests1dGroups is the aggregated (unsampled) daily dataset — no
 * sampleInterval weighting needed. We use it rather than the adaptive dataset
 * because the latter caps a single query at a 1-day range.
 */

export interface ZoneDayRow {
  date: string;       // YYYY-MM-DD (UTC)
  requests: number;   // total edge requests that day
  visits: number;     // unique visitors that day (uniq.uniques)
}

export interface ZoneCountryRow {
  country: string;    // ISO country name from countryMap ("" -> unknown)
  requests: number;   // edge requests over the window
}

export interface ZoneWindow {
  requests: number;
  visits: number;     // summed daily uniques (visitor-days) over the window
}

export interface ZoneActivity {
  configured: boolean;        // do we have a token + zone tag
  ok: boolean;                // did the query succeed
  error?: string;
  windowStart?: string;
  windowEnd?: string;
  byDay?: ZoneDayRow[];       // ascending by date, up to `days` entries
  byCountry?: ZoneCountryRow[];
  totals?: { day: ZoneWindow; week: ZoneWindow; month: ZoneWindow };
}

interface ZoneEnv {
  CF_ANALYTICS_TOKEN?: string;
  CF_ZONE_ANALYTICS_TOKEN?: string;
  CF_ZONE_TAG?: string;
}

const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';

const QUERY = `
query ZoneActivity($zoneTag: string!, $start: Date!, $end: Date!) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      httpRequests1dGroups(
        limit: 60
        filter: { date_geq: $start, date_leq: $end }
        orderBy: [date_ASC]
      ) {
        dimensions { date }
        sum { requests countryMap { clientCountryName requests } }
        uniq { uniques }
      }
    }
  }
}`;

interface DailyGroup {
  dimensions?: { date?: string };
  sum?: { requests?: number; countryMap?: Array<{ clientCountryName?: string; requests?: number }> };
  uniq?: { uniques?: number };
}

function summarize(rows: ZoneDayRow[], tailDays: number): ZoneWindow {
  // rows are ascending by date; the last `tailDays` entries form the window.
  const slice = rows.slice(-tailDays);
  return {
    requests: slice.reduce((a, r) => a + r.requests, 0),
    visits: slice.reduce((a, r) => a + r.visits, 0),
  };
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// One zone's daily rows over [start, end]. Returns the raw groups so the caller
// can merge across zones; an error string (instead of throwing) keeps one
// zone's failure from sinking the others.
interface ZoneResult {
  zoneTag: string;
  ok: boolean;
  error?: string;
  groups: DailyGroup[];
}

async function fetchOneZone(token: string, zoneTag: string, start: string, end: string): Promise<ZoneResult> {
  try {
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ query: QUERY, variables: { zoneTag, start, end } }),
    });
    if (!res.ok) {
      return { zoneTag, ok: false, error: `HTTP ${res.status}`, groups: [] };
    }
    const json = (await res.json()) as {
      data?: { viewer?: { zones?: Array<{ httpRequests1dGroups?: DailyGroup[] }> } };
      errors?: Array<{ message?: string }>;
    };
    if (json.errors && json.errors.length > 0) {
      return { zoneTag, ok: false, error: json.errors.map((e) => e.message).filter(Boolean).join('; ').slice(0, 300), groups: [] };
    }
    const zone = json.data?.viewer?.zones?.[0];
    if (!zone) {
      return { zoneTag, ok: false, error: 'zone not found (check CF_ZONE_TAG and token zone scope)', groups: [] };
    }
    return { zoneTag, ok: true, groups: zone.httpRequests1dGroups ?? [] };
  } catch (err) {
    return { zoneTag, ok: false, error: String((err as Error)?.message ?? err).slice(0, 300), groups: [] };
  }
}

export async function fetchZoneActivity(env: ZoneEnv, days = 30): Promise<ZoneActivity> {
  const token = env.CF_ZONE_ANALYTICS_TOKEN || env.CF_ANALYTICS_TOKEN;
  const zoneTags = (env.CF_ZONE_TAG ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!token || zoneTags.length === 0) {
    const missing = [!token && 'CF_ZONE_ANALYTICS_TOKEN', zoneTags.length === 0 && 'CF_ZONE_TAG']
      .filter(Boolean)
      .join(', ');
    return { configured: false, ok: false, error: `not configured (missing: ${missing})` };
  }

  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const windowStart = ymd(start);
  const windowEnd = ymd(end);

  // Query each zone independently so an unauthorized/failing zone is dropped
  // rather than failing the whole request (see header note on per-zone scope).
  const results = await Promise.all(zoneTags.map((tag) => fetchOneZone(token, tag, windowStart, windowEnd)));
  const okResults = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  if (okResults.length === 0) {
    const err = failed.map((r) => `${r.zoneTag}: ${r.error}`).join('; ').slice(0, 300) || 'all zones failed';
    return { configured: true, ok: false, error: err };
  }

  // Merge daily rows across zones by date (sum requests + visits).
  const dayReq = new Map<string, number>();
  const dayVis = new Map<string, number>();
  const countryReq = new Map<string, number>();
  for (const r of okResults) {
    for (const g of r.groups) {
      const date = g.dimensions?.date ?? '';
      dayReq.set(date, (dayReq.get(date) ?? 0) + (g.sum?.requests ?? 0));
      dayVis.set(date, (dayVis.get(date) ?? 0) + (g.uniq?.uniques ?? 0));
      for (const c of g.sum?.countryMap ?? []) {
        const name = c.clientCountryName || '';
        countryReq.set(name, (countryReq.get(name) ?? 0) + (c.requests ?? 0));
      }
    }
  }

  const byDay: ZoneDayRow[] = [...dayReq.keys()]
    .sort()
    .map((date) => ({ date, requests: dayReq.get(date) ?? 0, visits: dayVis.get(date) ?? 0 }));

  const byCountry: ZoneCountryRow[] = [...countryReq.entries()]
    .map(([country, requests]) => ({ country, requests }))
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 20);

  return {
    configured: true,
    ok: true,
    // Surface partial failures in the payload for diagnosis (the dashboard hides
    // `error` while `ok`, but it's visible in the raw JSON / logs).
    error: failed.length > 0 ? failed.map((r) => `${r.zoneTag}: ${r.error}`).join('; ').slice(0, 300) : undefined,
    windowStart,
    windowEnd,
    byDay,
    byCountry,
    totals: {
      day: summarize(byDay, 1),
      week: summarize(byDay, 7),
      month: summarize(byDay, days),
    },
  };
}
