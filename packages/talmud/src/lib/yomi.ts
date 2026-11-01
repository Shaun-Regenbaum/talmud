/**
 * Today's Daf Yomi, from Sefaria's public calendar. The answer for a given
 * calendar day is kept in localStorage so later opens that day need no fetch.
 */

export interface YomiDaf {
  tractate: string;
  page: string;
}

const CACHE_KEY = 'talmud:yomi';

/** "Berakhot 2" -> { tractate: 'Berakhot', page: '2a' }; null if it does not parse. */
export function parseYomiDisplay(display: string | undefined): YomiDaf | null {
  const m = display?.match(/^(.+?)\s+(\d+)$/);
  if (!m) return null;
  return { tractate: m[1].trim(), page: `${parseInt(m[2], 10)}a` };
}

function dayStamp(now: Date): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

/** The saved answer for today, or null. Never throws. */
export function cachedYomi(now = new Date()): YomiDaf | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { day?: string; tractate?: string; page?: string };
    if (v.day !== dayStamp(now) || !v.tractate || !v.page) return null;
    return { tractate: v.tractate, page: v.page };
  } catch {
    return null;
  }
}

/** Ask Sefaria for today's daf and save the answer. Throws on failure. */
export async function fetchYomi(now = new Date()): Promise<YomiDaf> {
  const url = `https://www.sefaria.org/api/calendars?year=${now.getFullYear()}&month=${now.getMonth() + 1}&day=${now.getDate()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sefaria ${res.status}`);
  const data = (await res.json()) as {
    calendar_items?: Array<{
      title?: { en?: string };
      displayValue?: { en?: string };
      category?: string;
    }>;
  };
  const item = data.calendar_items?.find(
    (ci) => ci.title?.en === 'Daf Yomi' && ci.category === 'Talmud',
  );
  const daf = parseYomiDisplay(item?.displayValue?.en);
  if (!daf) throw new Error('No Daf Yomi entry for today');
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ day: dayStamp(now), ...daf }));
  } catch {
    // Storage blocked: the daf still opens, it is just fetched again next time.
  }
  return daf;
}
