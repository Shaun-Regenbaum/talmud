/**
 * Daily pre-warm for tomorrow's Daf Yomi. Pulls tomorrow's daf from Sefaria's
 * calendar API and enqueues one enrichment job per canonical mark for both
 * amudim (a + b). Each job is picked up by the queue consumer as its own
 * Worker invocation (its own CPU/wall budget), which reads through the
 * cache-keys.ts helpers and lands a KV entry the next reader hits
 * synchronously.
 *
 * NOTE: this used to POST to `https://talmud.shaunregenbaum.com/api/run`
 * — a subrequest from the Worker back to its own custom-domain route. That is
 * the classic Cloudflare worker-to-self loopback: every such POST returned
 * HTTP 522 (origin connection timeout) and nothing ever warmed. We now enqueue
 * straight onto ENRICHMENT_QUEUE, exactly what the producer endpoint does
 * after validation, so the consumer fan-out (one invocation per mark) is
 * preserved without the loopback.
 *
 * Idempotent: runMarkOnce short-circuits on cache-hit, so re-running the cron
 * costs one KV read per mark once warm — no LLM calls.
 */

import { instanceIdOf } from './cache-keys';
import type { JobMessage } from './types';

const SEFARIA_CALENDAR_URL = 'https://www.sefaria.org/api/calendars';
const WARM_MARKS = ['rabbi', 'argument', 'halacha', 'aggadata', 'yerushalmi', 'pesukim'] as const;
// Marks that carry a Hebrew prompt variant get a second warm pass under
// lang=he so Hebrew readers don't hit a cold structural extraction. Marks
// without a *_he prompt (rabbi) emit identical English structure either way,
// so warming them under :he would just duplicate the cache for no gain.
const WARM_MARKS_HE = ['argument', 'halacha', 'aggadata', 'yerushalmi', 'pesukim'] as const;

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

/**
 * Build a runId matching makeRunId()'s format for the warm case: no mark_input,
 * no user_question, cache-respecting. The instance_id segment is cosmetic for
 * marks (keyForMark ignores it) but we keep the shape identical so run-status
 * polling and the postmortem ring buffer's `:{unixSeconds}` suffix parse the
 * same way.
 */
async function warmRunId(
  markId: string,
  tractate: string,
  page: string,
  lang: 'en' | 'he' = 'en',
): Promise<string> {
  const parts = [
    markId,
    tractate,
    page,
    await instanceIdOf(undefined),
    'noq',
    ...(lang === 'he' ? ['he'] : []),
    'cached',
    String(Math.floor(Date.now() / 1000)),
  ];
  return parts
    .join(':')
    .replace(/[^a-zA-Z0-9._:-]+/g, '_')
    .slice(0, 200);
}

interface YomiCronEnv {
  CACHE?: KVNamespace;
  ENRICHMENT_QUEUE?: Queue<JobMessage>;
}

export async function runYomiWarmCron(env: YomiCronEnv): Promise<void> {
  const { year, month, day } = tomorrowUtc();
  const yomi = await fetchDafYomi(year, month, day);
  if (!yomi) {
    console.warn(`[yomi-cron] no Daf Yomi entry for ${year}-${month}-${day}`);
    return;
  }
  const { tractate, daf } = yomi;
  if (!env.ENRICHMENT_QUEUE) {
    console.error('[yomi-cron] ENRICHMENT_QUEUE binding not available; cannot warm');
    return;
  }
  console.log(`[yomi-cron] warming ${tractate} ${daf} for ${year}-${month}-${day}`);

  const pages = [`${daf}a`, `${daf}b`];
  const jobs: Promise<void>[] = [];
  const queue = env.ENRICHMENT_QUEUE;
  const enqueue = async (markId: string, page: string, lang: 'en' | 'he'): Promise<void> => {
    const runId = await warmRunId(markId, tractate, page, lang);
    const job: JobMessage = {
      runId,
      mark_id: markId,
      tractate,
      page,
      ...(lang === 'he' ? { lang: 'he' } : {}),
    };
    try {
      await queue.send(job);
      console.log(
        `[yomi-cron] enqueued mark=${markId} lang=${lang} ${tractate}/${page} runId=${runId}`,
      );
    } catch (e) {
      console.error(
        `[yomi-cron] enqueue mark=${markId} lang=${lang} ${tractate}/${page} failed:`,
        e,
      );
    }
  };
  for (const page of pages) {
    for (const markId of WARM_MARKS) jobs.push(enqueue(markId, page, 'en'));
    // Second pass: Hebrew structural marks so HE readers hit a warm :he cache.
    for (const markId of WARM_MARKS_HE) jobs.push(enqueue(markId, page, 'he'));
    // Reverse-index capture — enqueued last; it depends on the marks above and
    // pulls any not-yet-warmed ones (incl. argument-move) via dependency
    // resolution, so it runs only once they've landed. mark_input { id: 'daf' }
    // keys the canonical daf-level cache the browse-path prefetch shares.
    const obsRunId = await warmRunId('rabbi.observations', tractate, page);
    const obsJob: JobMessage = {
      runId: obsRunId,
      enrichment_id: 'rabbi.observations',
      mark_input: { id: 'daf' },
      tractate,
      page,
    };
    jobs.push(
      env.ENRICHMENT_QUEUE.send(obsJob)
        .then(() => {
          console.log(
            `[yomi-cron] enqueued rabbi.observations ${tractate}/${page} runId=${obsRunId}`,
          );
        })
        .catch((e) => {
          console.error(`[yomi-cron] enqueue rabbi.observations ${tractate}/${page} failed:`, e);
        }),
    );
    // Deep-warm the daf so the section-typing views are ready for the daf-yomi
    // crowd — notably argument.narrative on story sections, which the deep-warm
    // path pre-warms only for narrative-primary sections (cache-respecting, so
    // the marks above are reused, not re-paid). One full deep-warm per daily daf.
    const deepRunId = (await warmRunId('warm-deep', tractate, page))
      .replace(/[^a-zA-Z0-9._:-]+/g, '_')
      .slice(0, 200);
    jobs.push(
      env.ENRICHMENT_QUEUE.send({ runId: deepRunId, warm_deep: true, tractate, page })
        .then(() => {
          console.log(`[yomi-cron] enqueued deep-warm ${tractate}/${page} runId=${deepRunId}`);
        })
        .catch((e) => {
          console.error(`[yomi-cron] enqueue deep-warm ${tractate}/${page} failed:`, e);
        }),
    );
  }
  await Promise.allSettled(jobs);
  console.log(`[yomi-cron] enqueued ${jobs.length} warm job(s) for ${tractate} ${daf}`);
}
