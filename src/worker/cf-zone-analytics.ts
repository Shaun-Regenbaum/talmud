/**
 * App activity (accesses + geography) from Cloudflare's zone HTTP analytics.
 * Every request to the shaunregenbaum.com zone is seen at the CF edge, so its
 * daily-rollup dataset (`httpRequests1dGroups`) gives a true picture of how
 * often the app is hit and from where — without the app logging anything.
 *
 * Scope note: the dataset is whole-zone (it has no per-host filter), but
 * talmud.shaunregenbaum.com is ~98% of the zone's traffic, so the figures are
 * effectively the app. `uniques` (deduped daily visitors) is the human-facing
 * "accesses" signal; `requests` is total edge volume and includes bots,
 * crawlers, and assets.
 *
 * Requires a Cloudflare API token with "Zone Analytics: Read" on the
 * shaunregenbaum.com zone. The account-scoped CF_ANALYTICS_TOKEN used for AI
 * Gateway cost is NOT enough (it has no zone access). Set a dedicated token:
 *   wrangler secret put CF_ZONE_ANALYTICS_TOKEN
 * and the zone id (not secret) as a var:  CF_ZONE_TAG = "..."   in wrangler.toml
 * (If you instead broaden CF_ANALYTICS_TOKEN to include Zone Analytics: Read,
 * leave CF_ZONE_ANALYTICS_TOKEN unset — this falls back to it.)
 *
 * Degrades gracefully exactly like aigw-analytics.ts: a missing token/zone or a
 * failed query returns a { configured/ok: false, error } shape so the dashboard
 * states the problem plainly instead of inventing numbers. The GraphQL field
 * names follow CF's documented zone analytics schema; if one is wrong the query
 * errors and the dashboard surfaces that string verbatim for diagnosis.
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

export async function fetchZoneActivity(env: ZoneEnv, days = 30): Promise<ZoneActivity> {
  const token = env.CF_ZONE_ANALYTICS_TOKEN || env.CF_ANALYTICS_TOKEN;
  const zoneTag = env.CF_ZONE_TAG;
  if (!token || !zoneTag) {
    const missing = [!token && 'CF_ZONE_ANALYTICS_TOKEN', !zoneTag && 'CF_ZONE_TAG']
      .filter(Boolean)
      .join(', ');
    return { configured: false, ok: false, error: `not configured (missing: ${missing})` };
  }

  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const variables = { zoneTag, start: ymd(start), end: ymd(end) };

  try {
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ query: QUERY, variables }),
    });
    if (!res.ok) {
      return { configured: true, ok: false, error: `HTTP ${res.status}` };
    }
    const json = (await res.json()) as {
      data?: { viewer?: { zones?: Array<{ httpRequests1dGroups?: DailyGroup[] }> } };
      errors?: Array<{ message?: string }>;
    };
    if (json.errors && json.errors.length > 0) {
      return { configured: true, ok: false, error: json.errors.map((e) => e.message).filter(Boolean).join('; ').slice(0, 300) };
    }
    const zone = json.data?.viewer?.zones?.[0];
    if (!zone) {
      return { configured: true, ok: false, error: 'zone not found (check CF_ZONE_TAG and token zone scope)' };
    }

    const groups = zone.httpRequests1dGroups ?? [];
    const byDay: ZoneDayRow[] = groups.map((g) => ({
      date: g.dimensions?.date ?? '',
      requests: g.sum?.requests ?? 0,
      visits: g.uniq?.uniques ?? 0,
    }));

    // "From where" aggregates each day's countryMap across the whole window.
    const countryReq = new Map<string, number>();
    for (const g of groups) {
      for (const c of g.sum?.countryMap ?? []) {
        const name = c.clientCountryName || '';
        countryReq.set(name, (countryReq.get(name) ?? 0) + (c.requests ?? 0));
      }
    }
    const byCountry: ZoneCountryRow[] = [...countryReq.entries()]
      .map(([country, requests]) => ({ country, requests }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 20);

    return {
      configured: true,
      ok: true,
      windowStart: variables.start,
      windowEnd: variables.end,
      byDay,
      byCountry,
      totals: {
        day: summarize(byDay, 1),
        week: summarize(byDay, 7),
        month: summarize(byDay, days),
      },
    };
  } catch (err) {
    return { configured: true, ok: false, error: String((err as Error)?.message ?? err).slice(0, 300) };
  }
}
