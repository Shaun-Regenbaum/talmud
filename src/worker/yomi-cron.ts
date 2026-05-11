/**
 * Daily pre-warm for tomorrow's Daf Yomi. Pulls tomorrow's daf from Sefaria's
 * calendar API and POSTs to `/api/studio/run` once per canonical mark for
 * both amudim (a + b). The studio endpoint reads through the cache-keys.ts
 * helpers, so a successful run lands a KV entry that the next reader hits
 * synchronously.
 *
 * Uses subrequests to the public hostname rather than in-process dispatch so
 * each mark run executes as its own Worker invocation with its own CPU/wall
 * budget — fitting all of them into one cron tick would blow the time limit.
 *
 * Idempotent: the studio handler short-circuits on cache-hit, so re-running
 * the cron is effectively free once warm.
 */

const SEFARIA_CALENDAR_URL = 'https://www.sefaria.org/api/calendars';
const PUBLIC_BASE_URL = 'https://talmud.shaunregenbaum.com';
const WARM_MARKS = ['rabbi', 'argument', 'halacha', 'aggadata', 'pesukim'] as const;

interface CalendarItem {
  title?: { en?: string };
  displayValue?: { en?: string };
  category?: string;
}

interface CalendarResponse {
  calendar_items?: CalendarItem[];
}

function tomorrowUtc(now: Date = new Date()): { year: number; month: number; day: number } {
  const t = new Date(now.getTime());
  t.setUTCDate(t.getUTCDate() + 1);
  return {
    year: t.getUTCFullYear(),
    month: t.getUTCMonth() + 1,
    day: t.getUTCDate(),
  };
}

async function fetchDafYomi(
  year: number,
  month: number,
  day: number,
): Promise<{ tractate: string; daf: number } | null> {
  const url = `${SEFARIA_CALENDAR_URL}?year=${year}&month=${month}&day=${day}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as CalendarResponse;
  const item = data.calendar_items?.find(
    (ci) => ci.title?.en === 'Daf Yomi' && ci.category === 'Talmud',
  );
  const display = item?.displayValue?.en;
  if (!display) return null;
  // Tractate names can contain spaces ("Rosh Hashanah", "Bava Kamma"), so
  // match greedily up to the trailing daf number.
  const m = display.match(/^(.+?)\s+(\d+)$/);
  if (!m) return null;
  return { tractate: m[1].trim(), daf: parseInt(m[2], 10) };
}

interface YomiCronEnv {
  CACHE?: KVNamespace;
}

export async function runYomiWarmCron(_env: YomiCronEnv): Promise<void> {
  const { year, month, day } = tomorrowUtc();
  const yomi = await fetchDafYomi(year, month, day);
  if (!yomi) {
    // eslint-disable-next-line no-console
    console.warn(`[yomi-cron] no Daf Yomi entry for ${year}-${month}-${day}`);
    return;
  }
  const { tractate, daf } = yomi;
  // eslint-disable-next-line no-console
  console.log(`[yomi-cron] warming ${tractate} ${daf} for ${year}-${month}-${day}`);

  const pages = [`${daf}a`, `${daf}b`];
  const jobs: Promise<void>[] = [];
  for (const page of pages) {
    for (const markId of WARM_MARKS) {
      const url = `${PUBLIC_BASE_URL}/api/studio/run`;
      jobs.push(
        fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mark_id: markId, tractate, page }),
        })
          .then((r) => {
            // eslint-disable-next-line no-console
            console.log(`[yomi-cron] mark=${markId} ${tractate}/${page} -> ${r.status}`);
          })
          .catch((e) => {
            // eslint-disable-next-line no-console
            console.error(`[yomi-cron] mark=${markId} ${tractate}/${page} failed:`, e);
          }),
      );
    }
  }
  await Promise.allSettled(jobs);
}
