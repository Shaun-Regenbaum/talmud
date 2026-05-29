/**
 * @fileoverview On-demand dafyomi.co.il fetch + parse, for dapim not in the
 * committed static corpus.
 *
 * Rather than rely on a hand-maintained dir/prefix table (which is easy to get
 * wrong per masechet), this is HUB-DRIVEN: it reads the daf's hub page
 * (`new_daflinks.php?gid=&daf=`), which lists the authoritative content URLs
 * for that daf, then fetches + parses each with the SAME pure parsers. The
 * caller (getDafyomiContentCached) memoizes the result in KV, so each daf is
 * fetched once-ever then served from cache. Failures/absent pages are recorded,
 * never fabricated.
 */

import { getDafyomiMasechet, buildRevachUrl, type DafyomiContentType } from '../lib/sefref/dafyomi/masechtos';
import { assembleDaf, type FetchedType } from '../lib/sefref/dafyomi/assemble';
import type { DafyomiDaf } from '../lib/sefref/dafyomi/schema';

const ORIGIN = 'https://www.dafyomi.co.il';
const USER_AGENT = 'talmud-viewer/0.1 (+https://github.com/shaunregenbaum/talmud; study-context ingestion)';

/** dafyomi.co.il folder name -> our content type. */
const FOLDER_TO_TYPE: Record<string, DafyomiContentType> = {
  insites: 'insights', backgrnd: 'background', halachah: 'halacha', tosfos: 'tosfos',
  review: 'review', points: 'points', hebcharts: 'hebcharts', yerushalmi: 'yerushalmi',
};

/** Fetch a page, retrying once on a transient failure. `requiredMarker` is a
 *  substring that a real page must contain (folder pages have `id="content"`;
 *  Revach pages predate it and instead carry "A BIT MORE"); pass null for the
 *  hub page, which has neither. A page missing its marker (a 404/landing/SPA
 *  fallback) returns null = "absent", without burning the retry. */
async function fetchText(url: string, requiredMarker: string | null): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, accept: 'text/html' } });
      if (res.ok) {
        const body = await res.text();
        if (requiredMarker && !body.includes(requiredMarker)) return null;
        return body;
      }
      if (res.status === 404) return null; // genuinely absent — no retry
    } catch {
      // network blip — fall through to retry
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

/** Parse the hub page's hrefs into one URL per content type present. */
function urlsFromHub(hubHtml: string): Map<DafyomiContentType, string> {
  const re = /href="([a-z0-9]+\/(insites|backgrnd|halachah|tosfos|review|points|hebcharts|yerushalmi)\/[a-z0-9]+-[a-z]{2}-\d+\.htm)"/gi;
  const out = new Map<DafyomiContentType, string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(hubHtml)) !== null) {
    const rel = m[1];
    const type = FOLDER_TO_TYPE[m[2].toLowerCase()];
    if (type && !out.has(type)) out.set(type, `${ORIGIN}/${rel}${type === 'review' ? '?q=1' : ''}`);
  }
  return out;
}

export async function scrapeDafyomiLive(tractate: string, daf: number): Promise<DafyomiDaf | null> {
  const m = getDafyomiMasechet(tractate);
  if (!m || daf < 2 || daf > m.lastDaf) return null;

  const hub = await fetchText(`${ORIGIN}/new_daflinks.php?gid=${m.gid}&daf=${daf}`, null);
  if (!hub) return null;
  const urls = urlsFromHub(hub);

  // Revach l'Daf isn't in the hub (it lives in the memdb app), so fetch it
  // directly when the masechet has a known tid.
  const revachUrl = buildRevachUrl(m, daf);
  if (revachUrl) urls.set('revach', revachUrl);
  if (urls.size === 0) return null;

  // Fetch sequentially, not in a burst: hammering their Apache server with ~9
  // simultaneous requests both trips transient failures (which would cache a
  // partial daf) and is impolite. Sequential is ~3s for a cold daf, then cached.
  const fetched: FetchedType[] = [];
  for (const [type, url] of urls) {
    const marker = type === 'revach' ? 'A BIT MORE' : 'id="content"';
    fetched.push({ type, url, html: await fetchText(url, marker) });
  }

  const { daf: dafObj } = assembleDaf(tractate, daf, fetched);
  const present = Object.keys(dafObj.amudim.a ?? {}).length + Object.keys(dafObj.amudim.b ?? {}).length;
  return present > 0 ? dafObj : null;
}
