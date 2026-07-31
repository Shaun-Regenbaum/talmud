import { isBook } from '../lib/books.ts';
import { parseParshaRef, type WeeklyParsha } from '../lib/parsha.ts';

interface CalendarItem {
  title?: { en?: string };
  displayValue?: { en?: string; he?: string };
  ref?: string;
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
  };
  const write = cache.put(cacheKey, JSON.stringify(payload), { expirationTtl: 6 * 3600 });
  if (waitUntil) waitUntil(write);
  else await write;
  return payload;
}
