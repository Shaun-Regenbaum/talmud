// Copy source-text caches from the old CACHE namespace to the new
// CACHE_ENTITY_CONTRACT namespace so this branch starts with HebrewBooks +
// Sefaria pre-aligned data preloaded but everything else fresh.
//
// Migrates these prefixes only (see src/worker/source-cache.ts):
//   hb:v1:                   HebrewBooksDaf JSON
//   sefaria-bundle:v1:       Sefaria main+commentary bundle (pre-aligned)
//   rishonim:v1:             Sefaria Rishonim
//   halacha-refs:v1:         Sefaria halachic refs
//   daf-topics:v1:           Sefaria topic links
//   sa-commentary:v1:        Shulchan Aruch commentary walks
//
// Everything else (analyze:*, enrich:*, mark-defs:*, llm-settings:*, etc.)
// stays in the old namespace and is NOT carried over.
//
// Run: node Sandbox/2026-05-04-kv-fork/migrate.mjs [--dry]

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execP = promisify(execFile);

const OLD_ID = '957172c219734565a172371f98c22056';
const NEW_ID = 'f373689f767c477e98cf3b644a4d05bd';

const PREFIXES = [
  'hb:v1:',
  'sefaria-bundle:v1:',
  'rishonim:v1:',
  'halacha-refs:v1:',
  'daf-topics:v1:',
  'sa-commentary:v1:',
];

const DRY = process.argv.includes('--dry');
const CONCURRENCY = 16;             // parallel `wrangler kv key get` calls
const BULK_CHUNK = 1000;            // keys per `wrangler kv bulk put` call

/** Run wrangler async, capture stdout, suppress noisy stderr warnings. */
async function wrangler(args, { input } = {}) {
  const { stdout } = await execP('wrangler', args, {
    encoding: 'utf-8',
    input,
    maxBuffer: 256 * 1024 * 1024,
  });
  return stdout;
}

async function listKeys(prefix) {
  const out = await wrangler([
    'kv', 'key', 'list',
    '--namespace-id', OLD_ID,
    '--prefix', prefix,
  ]);
  const arr = JSON.parse(out);
  return arr.map((entry) => entry.name).sort();
}

async function getValue(key) {
  return wrangler([
    'kv', 'key', 'get',
    '--namespace-id', OLD_ID,
    '--text',
    key,
  ]);
}

async function bulkPut(rows) {
  if (rows.length === 0) return;
  const dir = mkdtempSync(join(tmpdir(), 'kv-fork-'));
  const file = join(dir, 'bulk.json');
  writeFileSync(file, JSON.stringify(rows));
  if (DRY) {
    console.log(`  [dry] would bulk-put ${rows.length} rows`);
    return;
  }
  await wrangler([
    'kv', 'bulk', 'put',
    '--namespace-id', NEW_ID,
    file,
  ]);
}

async function pmap(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

async function migratePrefix(prefix) {
  process.stdout.write(`\n[${prefix}] listing… `);
  const keys = await listKeys(prefix);
  console.log(`${keys.length} keys`);
  if (keys.length === 0) return;

  let copied = 0;
  let chunk = [];
  for (let start = 0; start < keys.length; start += CONCURRENCY) {
    const batch = keys.slice(start, start + CONCURRENCY);
    const values = await pmap(batch, CONCURRENCY, async (k) => {
      try { return await getValue(k); }
      catch (err) { console.warn(`  GET fail ${k}: ${err.message}`); return null; }
    });
    for (let j = 0; j < batch.length; j++) {
      if (values[j] === null || values[j] === undefined) continue;
      chunk.push({ key: batch[j], value: values[j] });
      if (chunk.length >= BULK_CHUNK) {
        await bulkPut(chunk);
        copied += chunk.length;
        process.stdout.write(`\r[${prefix}] copied ${copied}/${keys.length}`);
        chunk = [];
      }
    }
  }
  if (chunk.length > 0) {
    await bulkPut(chunk);
    copied += chunk.length;
  }
  console.log(`\r[${prefix}] copied ${copied}/${keys.length} ✓`);
}

async function main() {
  console.log(`old: ${OLD_ID}`);
  console.log(`new: ${NEW_ID}`);
  console.log(`mode: ${DRY ? 'DRY-RUN' : 'LIVE'}`);
  for (const p of PREFIXES) await migratePrefix(p);
  console.log('\ndone');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
