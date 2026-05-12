#!/usr/bin/env node
/**
 * Full-page warmer. For each (tractate, page):
 *   Phase 1 — fire each canonical mark and wait for completion (200 cache
 *             hit OR poll the runId until done). Parse the instance list
 *             from the result.
 *   Phase 2 — for each instance of each mark, fire the synthesis
 *             enrichment. Synthesis declares the full leaf enrichment set
 *             as dependencies, so the worker's resolveDependencies fans
 *             out and warms every per-instance enrichment transitively.
 *             Phase 2 is fire-and-forget — the queue drains in the
 *             background with concurrency=2 from the consumer.
 *
 * Idempotent — already-cached marks return 200 immediately, so re-runs
 * just confirm existing cache + fire syntheses (which themselves are
 * cache-aware).
 *
 * Usage:
 *   node scripts/warm-pages.mjs \
 *     --pages "Chullin:2a,Chullin:2b,..." \
 *     [--worker https://talmud.shaunregenbaum.com] \
 *     [--mark-timeout 240]  # seconds to wait for a mark to complete
 */

// The local DNS resolver (127.0.2.2 — Pi-hole / VPN / corporate
// resolver) has been observed to intermittently drop A-record lookups
// for talmud.shaunregenbaum.com, killing the warmer mid-page with
// ETIMEDOUT. Force Node to use Cloudflare's public DNS (1.1.1.1) so the
// run is decoupled from the local resolver's stability.
import dns from 'node:dns';
dns.setServers(['1.1.1.1', '1.0.0.1', '8.8.8.8']);

const args = process.argv.slice(2);
const arg = (k, def) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : def;
};

const WORKER = arg('--worker', 'https://talmud.shaunregenbaum.com');
const PAGES_RAW = arg('--pages', '');
const MARK_TIMEOUT_S = parseInt(arg('--mark-timeout', '240'), 10);
if (!PAGES_RAW) {
  console.error('Usage: --pages "Tractate:page,Tractate:page,..."');
  process.exit(1);
}
const PAGES = PAGES_RAW.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
  const [tractate, page] = s.split(':');
  if (!tractate || !page) throw new Error(`bad page spec: ${s}`);
  return { tractate, page };
});

// Marks → their synthesis enrichment (the aggregate that fans out to
// every leaf via dependencies). Skip any mark whose synthesis hasn't been
// shipped yet.
const MARK_SYNTHESIS = {
  rabbi: 'rabbi.synthesis',
  argument: 'argument.synthesis',
  halacha: 'halacha.synthesis',
  pesukim: 'pesukim.synthesis',
  // aggadata has no synthesis enrichment yet — anchor only.
  aggadata: null,
};
const MARKS = Object.keys(MARK_SYNTHESIS);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function postRun(body) {
  // Retry on transient network errors (DNS flakes, ETIMEDOUT, connection
  // resets). Up to 4 attempts with exponential backoff. Returns null
  // status code only after exhausting retries.
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(`${WORKER}/api/studio/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      let j = null;
      try { j = await r.json(); } catch { /* ignore */ }
      return { status: r.status, body: j };
    } catch (e) {
      if (attempt === 3) {
        return { status: 0, body: { error: `network: ${(e && e.message) || e}` } };
      }
      await sleep(500 * Math.pow(2, attempt));
    }
  }
  return { status: 0, body: null };
}

async function pollUntilDone(runId, timeoutS) {
  const start = Date.now();
  let consecutiveNetworkErrs = 0;
  while (Date.now() - start < timeoutS * 1000) {
    await sleep(1500);
    try {
      const r = await fetch(`${WORKER}/api/studio/run-status/${encodeURIComponent(runId)}`);
      let j = null;
      try { j = await r.json(); } catch { return null; }
      if (j && j.status === 'ok') return j;
      if (j && j.status === 'error') return j;
      consecutiveNetworkErrs = 0;
    } catch (e) {
      // Transient network blip (DNS flake, ETIMEDOUT, etc.). Tolerate up
      // to 10 consecutive failures (= ~15s of network unavailability)
      // before giving up. Single blips just lose a poll tick.
      consecutiveNetworkErrs++;
      if (consecutiveNetworkErrs >= 10) return null;
    }
  }
  return null;
}

/** Fire a mark and wait for the result. Returns { ok, parsed, error } */
async function runMarkSync(tractate, page, markId) {
  const { status, body } = await postRun({ mark_id: markId, tractate, page });
  if (status === 200 && body?.status === 'ok') {
    return { ok: true, parsed: body.result?.parsed, source: 'cache' };
  }
  if (status === 202 && body?.runId) {
    const out = await pollUntilDone(body.runId, MARK_TIMEOUT_S);
    if (!out) return { ok: false, error: 'timeout' };
    if (out.status === 'error') return { ok: false, error: out.error ?? 'unknown' };
    return { ok: true, parsed: out.result?.parsed, source: 'fresh' };
  }
  return { ok: false, error: `HTTP ${status} ${JSON.stringify(body).slice(0, 120)}` };
}

/** Fire a synthesis fire-and-forget — don't wait. */
async function fireSynthesis(tractate, page, enrichmentId, markInput) {
  try {
    await fetch(`${WORKER}/api/studio/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enrichment_id: enrichmentId, tractate, page, mark_input: markInput }),
    });
  } catch (e) {
    // Network blip — skip; the queue's prior fire may have already enqueued it.
  }
}

let pagesDone = 0;
let syntheses = 0;
let markErrors = 0;
const t0 = Date.now();

for (const { tractate, page } of PAGES) {
  pagesDone++;
  const pT0 = Date.now();
  const synthesesBefore = syntheses;
  // Fire all marks for this page in parallel.
  const results = await Promise.all(
    MARKS.map(async (mark) => {
      const out = await runMarkSync(tractate, page, mark);
      return { mark, ...out };
    }),
  );
  // For each successful mark, fan out syntheses per instance.
  for (const r of results) {
    if (!r.ok) {
      markErrors++;
      console.error(`✗ ${tractate}/${page} ${r.mark}: ${r.error}`);
      continue;
    }
    const synthId = MARK_SYNTHESIS[r.mark];
    if (!synthId) continue;
    const instances = r.parsed?.instances;
    if (!Array.isArray(instances)) continue;
    for (const inst of instances) {
      await fireSynthesis(tractate, page, synthId, inst);
      syntheses++;
    }
  }
  const pElapsed = Math.round((Date.now() - pT0) / 1000);
  const totalElapsed = Math.round((Date.now() - t0) / 1000);
  const sCount = syntheses - synthesesBefore;
  console.log(`[${pagesDone}/${PAGES.length}] ${tractate}/${page} · ${pElapsed}s · +${sCount} syntheses · running ${totalElapsed}s · total syntheses=${syntheses} err=${markErrors}`);
}

const totalElapsed = Math.round((Date.now() - t0) / 1000);
console.log('');
console.log(`Done. pages=${PAGES.length} syntheses-fired=${syntheses} mark-errors=${markErrors} · ${totalElapsed}s`);
console.log('Synthesis enrichments fire-and-forget — they fan out the full leaf set via deps, drained by the queue (concurrency=2). The KV will become fully hot as they complete in the background.');
