/**
 * Daily pre-warm for tomorrow's Daf Yomi. Pulls tomorrow's daf from Sefaria's
 * calendar API, then fires self-fetches against every AI-backed daf endpoint
 * for both amudim (a and b):
 *   - /api/analyze      — argument skeleton + sugya structure
 *   - /api/halacha      — halachic codifications
 *   - /api/aggadata     — aggadata detection
 *   - /api/daf-context  — rabbi identification (feeds the generation timeline
 *                         AND the geography map on the client); a single hit
 *                         triggers Stage 1 (Gemma) synchronously and Stage 2
 *                         (Kimi+thinking) via the endpoint's own waitUntil, so
 *                         one self-fetch covers both stages.
 *
 * Uses subrequests to the public hostname rather than in-process dispatch so
 * each AI call runs as its own Worker invocation with its own CPU/wall-time
 * budget — Kimi K2.6 analyze alone can take 4–5 min, and fitting eight of
 * those into one scheduled invocation would blow the time limit.
 *
 * Idempotent: the downstream endpoints short-circuit on cache-hit, so
 * re-running the cron is effectively free once warm.
 */

const SEFARIA_CALENDAR_URL = 'https://www.sefaria.org/api/calendars';
const PUBLIC_BASE_URL = 'https://talmud.shaunregenbaum.com';
const WARM_ENDPOINTS = ['analyze', 'halacha', 'aggadata', 'daf-context'] as const;

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

export async function runYomiWarmCron(): Promise<void> {
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
    for (const ep of WARM_ENDPOINTS) {
      const url = `${PUBLIC_BASE_URL}/api/${ep}/${encodeURIComponent(tractate)}/${page}`;
      jobs.push(
        fetch(url)
          .then((r) => {
            // eslint-disable-next-line no-console
            console.log(`[yomi-cron] ${ep} ${tractate}/${page} -> ${r.status}`);
          })
          .catch((e) => {
            // eslint-disable-next-line no-console
            console.error(`[yomi-cron] ${ep} ${tractate}/${page} failed:`, e);
          }),
      );
    }
  }
  await Promise.allSettled(jobs);
}
