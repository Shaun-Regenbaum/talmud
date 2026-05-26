export interface HebrewBooksPage {
  tractate: string;
  daf: string;
  amud: string;
  mainText: string;
  rashi?: string;
  tosafot?: string;
  otherCommentaries?: Record<string, string>;
  timestamp: number;
}

export interface HebrewBooksParams {
  mesechta: number;
  daf: number;
  format?: 'text' | 'pdf';
}

export const TRACTATE_IDS: Record<string, number> = {
  'Berakhot': 1,
  'Shabbat': 2,
  'Eruvin': 3,
  'Pesachim': 4,
  'Shekalim': 5,
  'Yoma': 6,
  'Sukkah': 7,
  'Beitzah': 8,
  'Rosh Hashanah': 9,
  'Taanit': 10,
  'Megillah': 11,
  'Moed Katan': 12,
  'Chagigah': 13,
  'Yevamot': 14,
  'Ketubot': 15,
  'Nedarim': 16,
  'Nazir': 17,
  'Sotah': 18,
  'Gittin': 19,
  'Kiddushin': 20,
  'Bava Kamma': 21,
  'Bava Metzia': 22,
  'Bava Batra': 23,
  'Sanhedrin': 24,
  'Makkot': 25,
  'Shevuot': 26,
  'Avodah Zarah': 27,
  'Horayot': 28,
  'Zevachim': 29,
  'Menachot': 30,
  'Chullin': 31,
  'Bekhorot': 32,
  'Arakhin': 33,
  'Temurah': 34,
  'Keritot': 35,
  'Meilah': 36,
  'Niddah': 37,
};

export function convertDafToHebrewBooksFormat(daf: string): string {
  const pageNum = parseInt(daf.replace(/[ab]/, ''));
  const amud = daf.includes('b') ? 'b' : 'a';
  const dafSupplierNum = amud === 'a' ? (pageNum * 2) : (pageNum * 2 + 1);
  return dafSupplierNum.toString();
}

/**
 * Translate a Sefaria page identifier like "2a" / "12b" to the daf query-string
 * value used by hebrewbooks.org/shas.aspx. The site accepts integers for A-pages
 * and "{n}b" for B-pages (e.g. daf=2 → 2a, daf=2b → 2b, daf=3 → 3a).
 */
export function sefariaPageToHebrewBooksDaf(page: string): string {
  return page.replace(/a$/i, '');
}

export interface HebrewBooksDaf {
  main: string;
  rashi: string;
  tosafot: string;
}

/**
 * Fetch a daf's main Gemara + Rashi + Tosafot from hebrewbooks.org as HTML
 * fragments preserving the site's decorative markup (e.g. <span class="gdropcap">
 * for the big opening word, <span class="shastitle7"> for commentary lemmas).
 *
 * Unlike Sefaria, HebrewBooks mirrors the Vilna print layout's emphasis cues
 * which makes it a better source for faithful visual rendering. Sefaria
 * remains the source for translations and structured refs.
 */
async function fetchHebrewBooksDafOnce(
  url: string,
  tractate: string,
  page: string,
  fetchImpl: typeof fetch,
): Promise<HebrewBooksDaf> {
  const res = await fetchImpl(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'he,en;q=0.8',
    },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`HebrewBooks HTTP ${res.status} for ${tractate} ${page}`);
  const html = await res.text();
  return {
    main: extractShastext(html, 2),
    rashi: extractShastext(html, 3),
    tosafot: extractShastext(html, 4),
  };
}

/**
 * hebrewbooks.org's ASP.NET origin occasionally stalls for 1–3 consecutive
 * requests (confirmed via probe: ~5x latency for a brief window, then
 * normal). One retry after a short sleep usually lands on a recovered
 * request.
 */
export async function fetchHebrewBooksDaf(
  tractate: string,
  page: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HebrewBooksDaf> {
  const mesechta = TRACTATE_IDS[tractate];
  if (!mesechta) throw new Error(`Unknown tractate: ${tractate}`);

  const daf = sefariaPageToHebrewBooksDaf(page);
  const url = `https://hebrewbooks.org/shas.aspx?mesechta=${mesechta}&daf=${daf}&format=text`;

  try {
    return await fetchHebrewBooksDafOnce(url, tractate, page, fetchImpl);
  } catch (err) {
    await new Promise((r) => setTimeout(r, 150));
    try {
      return await fetchHebrewBooksDafOnce(url, tractate, page, fetchImpl);
    } catch {
      throw err;
    }
  }
}

/**
 * Extract the inner HTML of a <div class="shastextN"> block.
 *
 * Each shastext block (2 = Gemara, 3 = Rashi, 4 = Tosafot) is the sole content
 * of its enclosing <fieldset>. On most dapim the block's <div> is well-formed
 * and a plain <div>-depth scan finds its matching </div>. But HebrewBooks'
 * markup is malformed at CHAPTER BOUNDARIES, in two opposite ways that both
 * broke the old pure-depth scan:
 *
 *   - Perek END (e.g. Chullin 26b): the shastext2 <div> is left UNCLOSED — it
 *     is closed implicitly by </fieldset>. A depth scan never returns to 0
 *     within the block and runs on, swallowing the following Rashi/Tosafot
 *     fieldsets (over-capture). Downstream, the segment aligner then drifts
 *     and only a handful of segments align.
 *   - Perek START (e.g. Chullin 27a): a STRAY leading </div> sits right after
 *     the opening tag (`<div class="shastext2"> </div><span ...>השוחט...`). A
 *     depth scan hits depth 0 on that first close and returns an empty block.
 *
 * So we bound the scan by the enclosing </fieldset>, skip a stray leading
 * </div>, and — if the block's own closing </div> is missing — fall back to
 * everything up to that </fieldset>. Returns '' if the block isn't found.
 */
export function extractShastext(html: string, n: 2 | 3 | 4): string {
  const className = `shastext${n}`;
  const startRe = new RegExp(`<div\\s+class="${className}"[^>]*>`, 'i');
  const startMatch = startRe.exec(html);
  if (!startMatch) return '';

  let contentStart = startMatch.index + startMatch[0].length;

  // The block lives inside one <fieldset>; its end can never be past that
  // fieldset's close. This is the hard bound that tames the unclosed-div case.
  let fieldsetEnd = html.indexOf('</fieldset>', contentStart);
  if (fieldsetEnd < 0) fieldsetEnd = html.length;

  // Skip a stray leading </div> (perek-start pages emit one before the text).
  const leadingClose = html.slice(contentStart, fieldsetEnd).match(/^\s*<\/div>/i);
  if (leadingClose) contentStart += leadingClose[0].length;

  let depth = 1;
  let pos = contentStart;

  while (pos < fieldsetEnd) {
    let openIdx = html.indexOf('<div', pos);
    let closeIdx = html.indexOf('</div>', pos);
    if (openIdx >= fieldsetEnd) openIdx = -1;
    if (closeIdx >= fieldsetEnd) closeIdx = -1;
    if (closeIdx < 0) break; // no closing </div> before the fieldset ends
    if (openIdx >= 0 && openIdx < closeIdx) {
      depth++;
      pos = openIdx + 4;
    } else {
      depth--;
      if (depth === 0) {
        return html.slice(contentStart, closeIdx).trim();
      }
      pos = closeIdx + 6;
    }
  }

  // Block's own </div> is missing (unclosed at a perek end): take everything
  // up to the enclosing fieldset close.
  return html.slice(contentStart, fieldsetEnd).trim();
}
