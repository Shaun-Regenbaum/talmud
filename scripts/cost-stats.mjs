#!/usr/bin/env node
/**
 * Pulls AI Gateway logs from the Cloudflare API and computes spend stats
 * for the warming runs. Joins to the local warmer log (`--warm-log`) to
 * derive $/daf when given.
 *
 * Auth — needs a CF API token with `AI Gateway:Read` scope:
 *   CF_API_TOKEN=...  node scripts/cost-stats.mjs [flags]
 *
 * Flags:
 *   --since <ISO|relative>   start of window (default: 24h ago)
 *                            relative supports "Nh", "Nd"
 *   --until <ISO>            end of window (default: now)
 *   --account <id>           CF account id (default: ddf8edfc3...)
 *   --gateway <slug>         AI Gateway slug (default: talmud)
 *   --warm-log <path>        warmer log to count pages from
 *   --by-model               break down totals by model
 *
 * The gateway returns per-request: cost (USD), tokens_in, tokens_out,
 * cached (cache hit on the gateway's prompt-cache layer), provider,
 * model, created_at, success. Cached requests are billed as $0 (cache hit
 * = no upstream call).
 */
import { readFileSync, existsSync } from 'node:fs';

const ACCOUNT_DEFAULT = 'ddf8edfc3dfd489567fe3c5b28b51aca';
const GATEWAY_DEFAULT = 'talmud';

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};
const flag = (k) => argv.includes(k);

const TOKEN = process.env.CF_API_TOKEN;
if (!TOKEN) {
  console.error('CF_API_TOKEN env var required (AI Gateway:Read scope).');
  process.exit(1);
}

const account = arg('--account', ACCOUNT_DEFAULT);
const gateway = arg('--gateway', GATEWAY_DEFAULT);
const sinceRaw = arg('--since', '24h');
const untilRaw = arg('--until', null);
const warmLog = arg('--warm-log', null);
const byModel = flag('--by-model');

function parseTime(s, now = Date.now()) {
  if (!s) return null;
  const rel = /^(\d+)([hdms])$/.exec(s);
  if (rel) {
    const n = Number(rel[1]);
    const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[rel[2]];
    return new Date(now - n * mult);
  }
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

const since = parseTime(sinceRaw);
const until = untilRaw ? parseTime(untilRaw) : new Date();
if (!since) {
  console.error(`bad --since: ${sinceRaw}`);
  process.exit(1);
}

console.error(`Window: ${since.toISOString()} → ${until.toISOString()}`);
console.error(`Gateway: ${account}/${gateway}\n`);

const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${account}/ai-gateway/gateways/${gateway}/logs`;

/** Fetch logs, paginated. Filter by created_at server-side via the `start_date` / `end_date` query params. */
async function fetchAllLogs() {
  const all = [];
  let page = 1;
  const perPage = 200;
  while (true) {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
      start_date: since.toISOString(),
      end_date: until.toISOString(),
      order_by: 'created_at',
      order_by_direction: 'desc',
    });
    const url = `${baseUrl}?${params}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`HTTP ${r.status} ${text.slice(0, 400)}`);
    }
    const j = await r.json();
    if (!j.success) throw new Error(`API error: ${JSON.stringify(j.errors)}`);
    const batch = j.result ?? [];
    all.push(...batch);
    process.stderr.write(`  fetched ${all.length} logs…\r`);
    if (batch.length < perPage) break;
    page++;
    if (page > 500) {
      console.error('\n(stopping at 100k logs; rerun with a tighter window if needed)');
      break;
    }
  }
  process.stderr.write('\n');
  return all;
}

const logs = await fetchAllLogs();

if (logs.length === 0) {
  console.log('No logs in window.');
  process.exit(0);
}

let totalCost = 0;
let totalCached = 0;
let totalTokensIn = 0;
let totalTokensOut = 0;
let totalSuccess = 0;
const byMod = new Map();

for (const l of logs) {
  const cost = Number(l.cost ?? 0);
  const tin = Number(l.tokens_in ?? 0);
  const tout = Number(l.tokens_out ?? 0);
  const cached = l.cached === true || l.cached === 1;
  const success = l.success === true || l.success === 1;
  totalCost += cost;
  if (cached) totalCached++;
  totalTokensIn += tin;
  totalTokensOut += tout;
  if (success) totalSuccess++;
  if (byModel) {
    const m = String(l.model ?? 'unknown');
    const cur = byMod.get(m) ?? { count: 0, cost: 0, tin: 0, tout: 0 };
    cur.count++;
    cur.cost += cost;
    cur.tin += tin;
    cur.tout += tout;
    byMod.set(m, cur);
  }
}

const fmt$ = (n) => `$${n.toFixed(4)}`;
const fmt$2 = (n) => `$${n.toFixed(2)}`;
const fmtN = (n) => n.toLocaleString();

console.log(`Logs:        ${fmtN(logs.length)}`);
console.log(`Successful:  ${fmtN(totalSuccess)}`);
console.log(`Cached:      ${fmtN(totalCached)} (${(totalCached / logs.length * 100).toFixed(1)}%)`);
console.log(`Tokens in:   ${fmtN(totalTokensIn)}`);
console.log(`Tokens out:  ${fmtN(totalTokensOut)}`);
console.log(`Total cost:  ${fmt$2(totalCost)}`);
console.log(`Per request: ${fmt$(totalCost / Math.max(1, logs.length))}`);

if (byModel) {
  console.log('\nBy model:');
  for (const [m, s] of [...byMod.entries()].sort((a, b) => b[1].cost - a[1].cost)) {
    console.log(`  ${m.padEnd(48)} ${s.count.toString().padStart(6)} req  ${fmt$2(s.cost).padStart(10)}  in:${fmtN(s.tin)} out:${fmtN(s.tout)}`);
  }
}

if (warmLog) {
  if (!existsSync(warmLog)) {
    console.error(`\n--warm-log ${warmLog} not found`);
    process.exit(0);
  }
  // Count completed pages from the warm log. Each completed page emits:
  //   [N/T] Tractate/page · Ns · ...
  const txt = readFileSync(warmLog, 'utf8');
  const pageLines = txt.split('\n').filter((l) => /^\[\d+\/\d+\]\s/.test(l));
  // Filter to lines whose implicit completion time is within window.
  // The warmer doesn't timestamp lines; we use the file's mtime + line
  // count as a rough proxy by assuming the run started at the first log
  // line (no timestamp available — caller should pass --since aligned to
  // the warm run start for accuracy).
  const pageCount = pageLines.length;
  console.log(`\nWarm log: ${warmLog}`);
  console.log(`Pages completed: ${pageCount}`);
  if (pageCount > 0) {
    console.log(`\nPer-daf estimate:`);
    console.log(`  $/daf (avg):     ${fmt$(totalCost / pageCount)}`);
    console.log(`  tokens-in/daf:   ${fmtN(Math.round(totalTokensIn / pageCount))}`);
    console.log(`  tokens-out/daf:  ${fmtN(Math.round(totalTokensOut / pageCount))}`);
    console.log(`  requests/daf:    ${(logs.length / pageCount).toFixed(1)}`);
  }
}
