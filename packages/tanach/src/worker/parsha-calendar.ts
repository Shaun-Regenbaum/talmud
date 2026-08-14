import { isBook } from '../lib/books.ts';
import { parseParshaRef, type WeeklyParsha } from '../lib/parsha.ts';

interface CalendarItem {
  title?: { en?: string };
  displayValue?: { en?: string; he?: string };
  ref?: string;
  /** The calendar hands us the week's aliyot for free — seven refs plus
   *  maftir, which re-reads the tail of the seventh. */
  extraDetails?: { aliyot?: unknown };
}

/** The aliyah refs as strings, POSITIONS PRESERVED — a bad entry becomes an
 *  empty string rather than being spliced out, because position is what makes
 *  the fourth ref the fourth aliyah (and the eighth entry maftir). Anything
 *  unparseable is dropped later, per band, when the map is built. A cache
 *  entry written before aliyot were captured simply has none, which costs the
 *  map its aliyah rail for at most the six-hour calendar TTL. */
function normalizeAliyot(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((ref) => (typeof ref === 'string' ? ref : ''));
}

function normalizeParsha(value: unknown): WeeklyParsha | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<WeeklyParsha>;
  if (typeof raw.ref !== 'string') return null;
  const range = parseParshaRef(raw.ref);
  if (!range || !isBook(range.book)) return null;
  return {
    name: String(raw.name ?? 'Parsha'),
    heName: String(raw.heName ?? ''),
    ref: raw.ref,
    ...range,
    chapter: range.startChapter,
    aliyot: normalizeAliyot(raw.aliyot),
  };
}

/** Current weekly portion, location-aware and cached for six hours. */
export async function currentParsha(
  cache: KVNamespace,
  israel: boolean,
  waitUntil?: (promise: Promise<unknown>) => void,
): Promise<WeeklyParsha | null> {
  const cacheKey = `parsha:current:${israel ? 'il' : 'gola'}`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    try {
      const parsed = normalizeParsha(JSON.parse(cached));
      if (parsed) return parsed;
    } catch {
      // A malformed calendar cache is a miss; the live calendar repairs it.
    }
  }

  const response = await fetch(`https://www.sefaria.org/api/calendars?diaspora=${israel ? 0 : 1}`);
  if (!response.ok) throw new Error(`Calendar fetch failed: HTTP ${response.status}`);
  const calendar = (await response.json()) as { calendar_items?: CalendarItem[] };
  const item = (calendar.calendar_items ?? []).find(
    (candidate) => candidate?.title?.en === 'Parashat Hashavua',
  );
  const range = item?.ref ? parseParshaRef(item.ref) : null;
  if (!item?.ref || !range || !isBook(range.book)) return null;

  const payload: WeeklyParsha = {
    name: item.displayValue?.en ?? item.title?.en ?? 'Parsha',
    heName: item.displayValue?.he ?? '',
    ref: item.ref,
    ...range,
    chapter: range.startChapter,
    aliyot: normalizeAliyot(item.extraDetails?.aliyot),
  };
  const write = cache.put(cacheKey, JSON.stringify(payload), { expirationTtl: 6 * 3600 });
  if (waitUntil) waitUntil(write);
  else await write;
  return payload;
}
