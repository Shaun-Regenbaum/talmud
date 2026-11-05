/**
 * A bare visit to "/" (no daf in the URL) is sent to today's Daf Yomi before
 * the page loads, so the browser never shows another daf first.
 *
 * "Today" is the visitor's own calendar day (Cloudflare gives us their
 * timezone). Sefaria's answer is kept in the edge cache for each day, so
 * Sefaria is asked about once per day per data centre.
 */

import { fetchYomiFor } from '../lib/yomi';

/** The visitor's calendar day, as year/month/day. Falls back to UTC. */
export function localDay(now: Date, timeZone: string | undefined) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(now);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    return { year: get('year'), month: get('month'), day: get('day') };
  } catch {
    return localDay(now, 'UTC');
  }
}

/** The redirect target for a bare visit, or null to serve the page as usual. */
export async function yomiRedirectUrl(req: Request, now = new Date()): Promise<string | null> {
  const url = new URL(req.url);
  if (url.searchParams.has('tractate') || url.searchParams.has('page')) return null;
  const tz = (req as Request & { cf?: { timezone?: string } }).cf?.timezone;
  const { year, month, day } = localDay(now, tz);
  const cacheKey = new Request(`https://yomi.internal/${year}-${month}-${day}`);
  try {
    const cache = (caches as unknown as { default: Cache }).default;
    let res = await cache.match(cacheKey);
    if (!res) {
      const daf = await fetchYomiFor(year, month, day);
      res = new Response(JSON.stringify(daf), {
        headers: { 'content-type': 'application/json', 'cache-control': 'max-age=21600' },
      });
      await cache.put(cacheKey, res.clone());
    }
    const daf = (await res.json()) as { tractate: string; page: string };
    url.searchParams.set('tractate', daf.tractate);
    url.searchParams.set('page', daf.page);
    return url.toString();
  } catch {
    return null;
  }
}
