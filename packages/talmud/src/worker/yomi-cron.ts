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
import type { DafWarmParams } from './workflow-warm';

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
  /** The per-daf generation Workflow. When bound, the daily warm runs each daf's
   *  marks + enrichments as bounded per-step Workflow invocations (memory-safe,
   *  parallel) instead of a queue fan-out of mark + deep-warm jobs. */
  DAF_WARM_WORKFLOW?: Workflow<DafWarmParams>;
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
  const wf = env.DAF_WARM_WORKFLOW;

  // Trigger the per-daf generation Workflow for one language: it generates the
  // daf's marks -> whole-daf -> per-instance enrichments as bounded per-step
  // invocations (parallel, memory-safe) — the same surface the legacy per-mark +
  // deep-warm jobs warmed, but without the queue fan-out that risked an isolate
  // OOM on a dense daf.
  const triggerWorkflow = async (page: string, lang: 'en' | 'he'): Promise<void> => {
    if (!wf) return;
    try {
      const inst = await wf.create({ params: { tractate, page, lang } });
      console.log(`[yomi-cron] DafWarmWorkflow lang=${lang} ${tractate}/${page} id=${inst.id}`);
    } catch (e) {
      console.error(`[yomi-cron] DafWarmWorkflow lang=${lang} ${tractate}/${page} failed:`, e);
    }
  };

  // Legacy fallback (only when the Workflow binding is somehow unavailable):
  // enqueue a mark / deep-warm job onto the queue, exactly as before.
  const enqueueMark = async (markId: string, page: string, lang: 'en' | 'he'): Promise<void> => {
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
    } catch (e) {
      console.error(`[yomi-cron] enqueue mark=${markId} ${tractate}/${page} failed:`, e);
    }
  };
  const enqueueDeepWarm = async (page: string, lang: 'en' | 'he'): Promise<void> => {
    const deepRunId = (await warmRunId('warm-deep', tractate, page, lang))
      .replace(/[^a-zA-Z0-9._:-]+/g, '_')
      .slice(0, 200);
    const deepJob: JobMessage = {
      runId: deepRunId,
      warm_deep: true,
      tractate,
      page,
      ...(lang === 'he' ? { lang: 'he' } : {}),
    };
    try {
      await queue.send(deepJob);
    } catch (e) {
      console.error(`[yomi-cron] enqueue deep-warm lang=${lang} ${tractate}/${page} failed:`, e);
    }
  };

  // Reverse-index capture (rabbi.observations) — stays on the queue: it warms the
  // DAF-LEVEL { id: 'daf' } aggregation key (the browse-path prefetch shares it),
  // which the Workflow's per-rabbi enumeration does not produce.
  const enqueueObservations = async (page: string): Promise<void> => {
    const obsRunId = await warmRunId('rabbi.observations', tractate, page);
    const obsJob: JobMessage = {
      runId: obsRunId,
      enrichment_id: 'rabbi.observations',
      mark_input: { id: 'daf' },
      tractate,
      page,
    };
    try {
      await queue.send(obsJob);
    } catch (e) {
      console.error(`[yomi-cron] enqueue rabbi.observations ${tractate}/${page} failed:`, e);
    }
  };

  for (const page of pages) {
    if (wf) {
      // Memory-safe parallel path: one Workflow per language warms the full
      // mark + enrichment surface for that daf.
      for (const lang of ['en', 'he'] as const) jobs.push(triggerWorkflow(page, lang));
    } else {
      // Fallback to the legacy queue fan-out (mark jobs + a per-language deep-warm)
      // if the Workflow binding is missing.
      console.warn('[yomi-cron] DAF_WARM_WORKFLOW unavailable; falling back to queue warm');
      for (const markId of WARM_MARKS) jobs.push(enqueueMark(markId, page, 'en'));
      for (const markId of WARM_MARKS_HE) jobs.push(enqueueMark(markId, page, 'he'));
      for (const lang of ['en', 'he'] as const) jobs.push(enqueueDeepWarm(page, lang));
    }
    jobs.push(enqueueObservations(page));
  }
  await Promise.allSettled(jobs);
  console.log(
    `[yomi-cron] warmed ${tractate} ${daf} via ${wf ? 'DafWarmWorkflow' : 'queue fallback'} (${jobs.length} task(s))`,
  );
}
