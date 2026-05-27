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

import { getDafyomiMasechet, type DafyomiContentType } from '../lib/sefref/dafyomi/masechtos';
import { assembleDaf, type FetchedType } from '../lib/sefref/dafyomi/assemble';
import type { DafyomiDaf } from '../lib/sefref/dafyomi/schema';

const ORIGIN = 'https://www.dafyomi.co.il';
const USER_AGENT = 'talmud-viewer/0.1 (+https://github.com/shaunregenbaum/talmud; study-context ingestion)';

/** dafyomi.co.il folder name -> our content type. */
const FOLDER_TO_TYPE: Record<string, DafyomiContentType> = {
  insites: 'insights', backgrnd: 'background', halachah: 'halacha', tosfos: 'tosfos',
  review: 'review', points: 'points', hebcharts: 'hebcharts', yerushalmi: 'yerushalmi',
};

async function fetchText(url: string, expectContent: boolean): Promise<string | null> {
  // One retry: firing the hub + up to 8 content pages in parallel occasionally
  // sees a transient failure, and since the result is cached we don't want a
  // partial daf persisted. A genuine 404 (page has no #content) returns null
  // without burning the retry on a real "absent".
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, accept: 'text/html' } });
      if (res.ok) {
        const body = await res.text();
        // Real content pages always have the #content container; 404/landing
        // pages don't. (The hub page itself is exempt.)
        if (expectContent && !body.includes('id="content"')) return null;
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

  const hub = await fetchText(`${ORIGIN}/new_daflinks.php?gid=${m.gid}&daf=${daf}`, false);
  if (!hub) return null;
  const urls = urlsFromHub(hub);
  if (urls.size === 0) return null;

  // Fetch sequentially, not in a burst: hammering their Apache server with ~9
  // simultaneous requests both trips transient failures (which would cache a
  // partial daf) and is impolite. Sequential is ~3s for a cold daf, then cached.
  const fetched: FetchedType[] = [];
  for (const [type, url] of urls) {
    fetched.push({ type, url, html: await fetchText(url, true) });
  }

  const { daf: dafObj } = assembleDaf(tractate, daf, fetched);
  const present = Object.keys(dafObj.amudim.a ?? {}).length + Object.keys(dafObj.amudim.b ?? {}).length;
  return present > 0 ? dafObj : null;
}
