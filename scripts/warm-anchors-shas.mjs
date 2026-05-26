#!/usr/bin/env node
/**
 * Fire-and-forget anchors warmer. For every (tractate, page, mark) tuple,
 * POSTs to /api/studio/run and moves on without polling — cache hits return
 * 200 immediately, cold ones return 202 with a runId and get processed by the
 * worker queue at its own pace (max_concurrency=10 per wrangler.toml).
 *
 * "Anchors" = the 8 canonical marks (rabbi, argument, argument-move, halacha,
 * pesukim, places, rishonim, aggadata). NO syntheses, NO suggested-questions,
 * NO per-instance fan-out. Just the highlighted-spans extractor per page.
 *
 * Why fire-and-forget: warm-pages.mjs blocks on each mark, which scales
 * terribly across Shas (~150 hours). Pushing all jobs into the queue at once
 * lets the consumer's concurrency cap parallelize the work properly.
 *
 * Usage:
 *   node scripts/warm-anchors-shas.mjs
 *     [--worker https://talmud...]        # default talmud.shaunregenbaum.com
 *     [--tractates "Berakhot,Shabbat"]    # optional subset
 *     [--sides a|b|both]                  # default 'a' — amud-A only
 *     [--marks "rabbi,places"]            # default = all 8
 *     [--concurrency 20]                  # parallel enqueue requests
 *     [--dry-run]                         # print the plan and exit
 *     [--per-fetch-timeout-ms 15000]      # AbortController cap per POST
 */
import dns from 'node:dns';
dns.setServers(['1.1.1.1', '1.0.0.1', '8.8.8.8']);

const args = process.argv.slice(2);
const arg = (k, def) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : def;
};

const WORKER = arg('--worker', 'https://talmud.shaunregenbaum.com');
const SIDES = arg('--sides', 'a');  // 'a' | 'b' | 'both'
const CONCURRENCY = Math.max(1, parseInt(arg('--concurrency', '20'), 10));
const DRY_RUN = args.includes('--dry-run');
const FETCH_TIMEOUT_MS = Math.max(1000, parseInt(arg('--per-fetch-timeout-ms', '15000'), 10));
const TRACTATE_FILTER = (() => {
  const v = arg('--tractates', null);
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : null;
})();
const MARKS_FILTER = (() => {
  const v = arg('--marks', null);
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : null;
})();

const ALL_MARKS = ['rabbi', 'argument', 'argument-move', 'halacha', 'pesukim', 'places', 'rishonim', 'aggadata'];
const MARKS = MARKS_FILTER ?? ALL_MARKS;

// Kept in sync with scripts/warm-skeleton-shas.mjs and warm-shas-sample.mjs.
const TRACTATES = {
  Berakhot: '64a', Shabbat: '157b', Eruvin: '105a', Pesachim: '121b',
  Shekalim: '22b', Yoma: '88a', Sukkah: '56b', Beitzah: '40b',
  'Rosh Hashanah': '35a', Taanit: '31a', Megillah: '32a', 'Moed Katan': '29a',
  Chagigah: '27a', Yevamot: '122b', Ketubot: '112b', Nedarim: '91b',
  Nazir: '66b', Sotah: '49b', Gittin: '90b', Kiddushin: '82b',
  'Bava Kamma': '119b', 'Bava Metzia': '119a', 'Bava Batra': '176b',
  Sanhedrin: '113b', Makkot: '24b', Shevuot: '49b', 'Avodah Zarah': '76b',
  Horayot: '14a', Zevachim: '120b', Menachot: '110a', Chullin: '142a',
  Bekhorot: '61a', Arakhin: '34a', Temurah: '34a', Keritot: '28b',
  Meilah: '22a', Niddah: '73a',
};

function amudToNumber(amud) {
  const m = amud.match(/^(\d+)([ab])$/);
  if (!m) throw new Error(`bad amud: ${amud}`);
  return parseInt(m[1], 10) * 2 + (m[2] === 'a' ? -1 : 0);
}

const jobs = [];  // { tractate, page, mark }
for (const [tractate, endAmud] of Object.entries(TRACTATES)) {
  if (TRACTATE_FILTER && !TRACTATE_FILTER.includes(tractate)) continue;
  const end = amudToNumber(endAmud);
  for (let n = 3; n <= end; n++) {
    const daf = Math.ceil(n / 2);
    const side = n % 2 === 1 ? 'a' : 'b';
    if (SIDES === 'a' && side !== 'a') continue;
    if (SIDES === 'b' && side !== 'b') continue;
    const page = `${daf}${side}`;
    for (const mark of MARKS) jobs.push({ tractate, page, mark });
  }
}

console.log(`[warm-anchors] worker=${WORKER} sides=${SIDES} marks=${MARKS.join(',')} concurrency=${CONCURRENCY}`);
console.log(`[warm-anchors] tractates=${TRACTATE_FILTER ? TRACTATE_FILTER.join(',') : 'ALL'}`);
console.log(`[warm-anchors] total jobs to enqueue: ${jobs.length}`);

if (DRY_RUN) {
  console.log(`[warm-anchors] DRY RUN — first 10 jobs:`);
  for (const j of jobs.slice(0, 10)) console.log(`  ${j.tractate} ${j.page} ${j.mark}`);
  process.exit(0);
}

const counters = { cached: 0, queued: 0, badStatus: 0, networkErr: 0, timeout: 0 };
const t0 = Date.now();

/**
 * POST one job. Returns the bucket counter key that was incremented.
 * Per-fetch AbortController so a hung connection doesn't wedge the script
 * (the bug we just fixed worker-side, applied here too on the client).
 */
async function enqueueOne(job) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(`${WORKER}/api/studio/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mark_id: job.mark, tractate: job.tractate, page: job.page }),
      signal: controller.signal,
    });
    if (r.status === 200) return 'cached';
    if (r.status === 202) return 'queued';
    return 'badStatus';
  } catch (err) {
    if ((err && err.name) === 'AbortError') return 'timeout';
    return 'networkErr';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pool-based concurrency: keep N requests in flight at all times. Simpler
 * than a worker-pool abstraction and gives uniform pressure on the producer.
 */
async function runPool(items, limit, worker) {
  let idx = 0;
  let lastLog = Date.now();
  const lap = async () => {
    while (idx < items.length) {
      const i = idx++;
      const bucket = await worker(items[i]);
      counters[bucket]++;
      const done = idx;
      if (Date.now() - lastLog > 5000 || done === items.length) {
        const elapsed = Math.round((Date.now() - t0) / 1000);
        const rate = elapsed > 0 ? Math.round(done / elapsed) : 0;
        const eta = rate > 0 ? Math.round((items.length - done) / rate) : 0;
        console.log(`[${done}/${items.length}] elapsed=${elapsed}s rate=${rate}/s eta=${eta}s · cached=${counters.cached} queued=${counters.queued} bad=${counters.badStatus} net-err=${counters.networkErr} timeout=${counters.timeout}`);
        lastLog = Date.now();
      }
    }
  };
  await Promise.all(Array.from({ length: limit }, () => lap()));
}

await runPool(jobs, CONCURRENCY, enqueueOne);

const totalElapsed = Math.round((Date.now() - t0) / 1000);
console.log(`\nDone enqueueing. total=${jobs.length} elapsed=${totalElapsed}s`);
console.log(`  cached (instant 200):     ${counters.cached}`);
console.log(`  queued (202, runId):      ${counters.queued}`);
console.log(`  bad-status (non-200/202): ${counters.badStatus}`);
console.log(`  network errors:           ${counters.networkErr}`);
console.log(`  fetch timeouts (${FETCH_TIMEOUT_MS}ms): ${counters.timeout}`);
console.log(`\nQueued jobs drain in the background via the worker's enrichment-jobs queue (concurrency=10).`);
console.log(`Monitor backlog via /api/admin/cache-stats or the Cloudflare Queues dashboard.`);
