#!/usr/bin/env node
/**
 * Sample N% of amud-A pages across all 37 tractates of Bavli and run
 * warm-pages.mjs over them with --include-questions.
 *
 * The sample is seeded (default = today's UTC date) so re-running on the
 * same day picks the same pages — useful for resuming after a network
 * blip or budget-cap pause. Pass --seed <string> to override.
 *
 * Usage:
 *   node scripts/warm-shas-sample.mjs
 *     [--pct 10]                          # default 10
 *     [--seed YYYY-MM-DD | freeform]      # default today's UTC date
 *     [--worker https://talmud...]        # default talmud.shaunregenbaum.com
 *     [--tractates "Berakhot,Shabbat"]    # optional subset
 *     [--dry-run]                         # print the page list and exit
 *     [--no-questions]                    # skip the suggested-questions pass
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const arg = (k, def) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : def;
};

const PCT = parseFloat(arg('--pct', '10'));
const SEED = arg('--seed', new Date().toISOString().slice(0, 10));
const WORKER = arg('--worker', 'https://talmud.shaunregenbaum.com');
const TRACTATE_FILTER = (() => {
  const v = arg('--tractates', null);
  return v
    ? v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : null;
})();
const DRY_RUN = args.includes('--dry-run');
const INCLUDE_QUESTIONS = !args.includes('--no-questions');

// Kept in sync with scripts/warm-skeleton-shas.mjs TRACTATES.
const TRACTATES = {
  Berakhot: '64a',
  Shabbat: '157b',
  Eruvin: '105a',
  Pesachim: '121b',
  Shekalim: '22b',
  Yoma: '88a',
  Sukkah: '56b',
  Beitzah: '40b',
  'Rosh Hashanah': '35a',
  Taanit: '31a',
  Megillah: '32a',
  'Moed Katan': '29a',
  Chagigah: '27a',
  Yevamot: '122b',
  Ketubot: '112b',
  Nedarim: '91b',
  Nazir: '66b',
  Sotah: '49b',
  Gittin: '90b',
  Kiddushin: '82b',
  'Bava Kamma': '119b',
  'Bava Metzia': '119a',
  'Bava Batra': '176b',
  Sanhedrin: '113b',
  Makkot: '24b',
  Shevuot: '49b',
  'Avodah Zarah': '76b',
  Horayot: '14a',
  Zevachim: '120b',
  Menachot: '110a',
  Chullin: '142a',
  Bekhorot: '61a',
  Arakhin: '34a',
  Temurah: '34a',
  Keritot: '28b',
  Meilah: '22a',
  Niddah: '73a',
};

function amudToNumber(amud) {
  const m = amud.match(/^(\d+)([ab])$/);
  if (!m) throw new Error(`bad amud: ${amud}`);
  return parseInt(m[1], 10) * 2 + (m[2] === 'a' ? -1 : 0);
}

// FNV-1a → mulberry32. Deterministic PRNG keyed off the seed string so
// re-running with the same --seed yields the same sample.
function fnv1a(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const allPages = [];
for (const [tractate, endAmud] of Object.entries(TRACTATES)) {
  if (TRACTATE_FILTER && !TRACTATE_FILTER.includes(tractate)) continue;
  const end = amudToNumber(endAmud);
  // Amud-A only: n=3 → "2a", n=5 → "3a", ... step 2.
  for (let n = 3; n <= end; n += 2) {
    const daf = Math.ceil(n / 2);
    allPages.push(`${tractate}:${daf}a`);
  }
}

const rng = mulberry32(fnv1a(SEED));
// Fisher–Yates shuffle then take the first ceil(pct%) — preserves uniform
// random sampling and the ordering inside the sampled subset is also random,
// which spreads errors across tractates rather than clustering them.
const shuffled = allPages.slice();
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(rng() * (i + 1));
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}
const sampleCount = Math.max(1, Math.ceil((PCT / 100) * shuffled.length));
const sample = shuffled.slice(0, sampleCount);

// Re-sort the sampled subset by tractate then daf-number so the log reads
// linearly. The sample itself is still random; only the run order is sorted.
const TRACTATE_ORDER = new Map(Object.keys(TRACTATES).map((t, i) => [t, i]));
sample.sort((a, b) => {
  const [ta, pa] = a.split(':');
  const [tb, pb] = b.split(':');
  const di = TRACTATE_ORDER.get(ta) - TRACTATE_ORDER.get(tb);
  if (di !== 0) return di;
  return parseInt(pa, 10) - parseInt(pb, 10);
});

console.log(
  `[warm-shas-sample] seed=${SEED} pct=${PCT}% total-amud-a=${allPages.length} sampled=${sample.length}`,
);
console.log(`[warm-shas-sample] worker=${WORKER} include-questions=${INCLUDE_QUESTIONS}`);

if (DRY_RUN) {
  for (const p of sample) console.log(p);
  process.exit(0);
}

const childArgs = [
  path.join(__dirname, 'warm-pages.mjs'),
  '--worker',
  WORKER,
  '--pages',
  sample.join(','),
];
if (INCLUDE_QUESTIONS) childArgs.push('--include-questions');

const child = spawn(process.execPath, childArgs, { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
