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
 * Extract the inner HTML of a <div class="shastextN"> block, handling nested
 * <div> elements via depth counting. Returns an empty string if the block
 * isn't found.
 */
function extractShastext(html: string, n: 2 | 3 | 4): string {
  const className = `shastext${n}`;
  const startRe = new RegExp(`<div\\s+class="${className}"[^>]*>`, 'i');
  const startMatch = startRe.exec(html);
  if (!startMatch) return '';

  const contentStart = startMatch.index + startMatch[0].length;
  let depth = 1;
  let pos = contentStart;

  while (depth > 0 && pos < html.length) {
    const openIdx = html.indexOf('<div', pos);
    const closeIdx = html.indexOf('</div>', pos);
    if (closeIdx < 0) break;
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
  return '';
}
