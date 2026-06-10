/**
 * READ-ONLY audit of the remote KV definition registries against the unified
 * producer registry (src/worker/producer-registry.ts).
 *
 * For every id in mark-defs:v2:_index and enrichment-defs:v2:_index it fetches
 * the stored flat def, runs it through BOTH:
 *   - the OLD loader behavior (inline golden copies of the pre-unification
 *     index.ts bodies: the flat->rich mark synthesis / the verbatim
 *     enrichment passthrough), and
 *   - the NEW path (producer-registry's loadMarkDef / loadEnrichmentDef,
 *     i.e. resolve -> Producer -> project back),
 * then diffs every field plus the derived cache keys (keyForMark /
 * keyForEnrichment on a fixed probe daf + instance, en + he). Any mismatch is
 * printed and the process exits 1; a clean run prints per-id OK lines.
 *
 * How to run (from packages/talmud; wrangler must be logged in):
 *
 *   npx tsx scripts/audit-kv-defs.ts
 *
 * (tsx is not a repo dependency; npx fetches it. The script resolves the
 * worker's TS modules directly — same raw-.ts setup vitest uses.)
 *
 * KV access is via `wrangler kv key get --remote` against the CACHE namespace
 * id parsed from wrangler.toml — the only wrangler subcommand used; nothing is
 * written. Each key is one wrangler invocation, so a large hand-authored
 * registry will be slow but safe.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keyForEnrichment, keyForMark } from '../src/worker/cache-keys.ts';
import { loadEnrichmentDef, loadMarkDef } from '../src/worker/producer-registry.ts';
import type {
  EnrichmentDefinition as KvEnrichmentDefinition,
  MarkDefinition as KvMarkDefinition,
  RegistryEnv,
} from '../src/worker/studio-registry.ts';
import type { MarkDefinition as SchemaMarkDefinition } from '../src/worker/studio-schema.ts';

const PKG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- wrangler plumbing (read-only) ------------------------------------------

function cacheNamespaceId(): string {
  const toml = readFileSync(join(PKG_DIR, 'wrangler.toml'), 'utf8');
  // The [[kv_namespaces]] block with binding = "CACHE": take the id that
  // follows it (comments between the two lines are fine).
  const m = toml.match(/binding\s*=\s*"CACHE"[\s\S]*?\nid\s*=\s*"([0-9a-f]{32})"/);
  if (!m) throw new Error('could not find the CACHE kv_namespaces id in wrangler.toml');
  return m[1];
}

function kvGet(namespaceId: string, key: string): string | null {
  const res = spawnSync(
    'pnpm',
    ['exec', 'wrangler', 'kv', 'key', 'get', '--remote', '--namespace-id', namespaceId, key],
    { cwd: PKG_DIR, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (res.status !== 0) {
    // Missing keys come back non-zero; treat as absent but surface other noise.
    if (/not found/i.test(res.stderr ?? '')) return null;
    process.stderr.write(res.stderr ?? '');
    return null;
  }
  return res.stdout;
}

function kvGetJson<T>(namespaceId: string, key: string): T | null {
  const raw = kvGet(namespaceId, key);
  if (raw === null) return null;
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Some wrangler versions prefix a banner on stdout; skip to the JSON.
    const start = Math.min(
      ...['{', '['].map((c) => {
        const i = trimmed.indexOf(c);
        return i === -1 ? Number.POSITIVE_INFINITY : i;
      }),
    );
    if (!Number.isFinite(start)) return null;
    try {
      return JSON.parse(trimmed.slice(start)) as T;
    } catch {
      return null;
    }
  }
}

// --- golden copies of the OLD index.ts loader behavior ----------------------

function oldKvMarkSynthesis(kv: KvMarkDefinition): SchemaMarkDefinition {
  return {
    id: kv.id,
    label: kv.label,
    description: kv.description,
    anchor: 'phrase',
    render: { kind: 'inline', style: 'underline', color: '#0066CC' },
    extractor: {
      kind: 'llm',
      system_prompt: kv.system_prompt ?? '',
      user_prompt_template: kv.user_prompt_template ?? '',
    },
    dependencies: kv.dependencies,
    status: 'draft',
    def_hash: 'kv',
    cache_version: kv.cache_version,
    source: 'kv',
    updated_at: kv.updated_at,
  };
}

// Old loadEnrichmentDef returned the stored KV def verbatim.
const oldKvEnrichmentPassthrough = (kv: KvEnrichmentDefinition): KvEnrichmentDefinition => kv;

// --- structural diff ---------------------------------------------------------

function diffPaths(a: unknown, b: unknown, path = ''): string[] {
  if (Object.is(a, b)) return [];
  const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
  if (!isObj(a) || !isObj(b) || Array.isArray(a) !== Array.isArray(b)) {
    return [`${path || '<root>'}: old=${JSON.stringify(a)} new=${JSON.stringify(b)}`];
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: string[] = [];
  for (const k of keys) {
    const p = path ? `${path}.${k}` : k;
    if (!(k in a)) out.push(`${p}: missing in old, new=${JSON.stringify(b[k])}`);
    else if (!(k in b)) out.push(`${p}: missing in new, old=${JSON.stringify(a[k])}`);
    else out.push(...diffPaths(a[k], b[k], p));
  }
  return out;
}

// --- main --------------------------------------------------------------------

const PROBE_DAF = { tractate: 'Berakhot', page: '5a' };
const PROBE_INSTANCE = 'audit-instance';

async function main(): Promise<void> {
  const ns = cacheNamespaceId();
  console.log(`CACHE namespace: ${ns}`);

  const markIds = kvGetJson<string[]>(ns, 'mark-defs:v2:_index') ?? [];
  const enrichmentIds = kvGetJson<string[]>(ns, 'enrichment-defs:v2:_index') ?? [];
  console.log(`mark-defs:v2:_index        -> ${markIds.length} ids`);
  console.log(`enrichment-defs:v2:_index  -> ${enrichmentIds.length} ids`);

  // Mirror the fetched defs into a Map-backed RegistryEnv so the NEW loaders
  // run exactly as in the worker, against exactly the remote bytes.
  const store = new Map<string, string>();
  const env: RegistryEnv = {
    CACHE: {
      get: async (k: string) => store.get(k) ?? null,
    } as unknown as KVNamespace,
  };

  let mismatches = 0;

  for (const id of markIds) {
    const raw = kvGet(ns, `mark-defs:v2:${id}`);
    if (raw === null) {
      console.log(`MARK ${id}: indexed but entry missing (skipped)`);
      continue;
    }
    let kv: KvMarkDefinition;
    try {
      kv = JSON.parse(raw.trim()) as KvMarkDefinition;
    } catch {
      console.log(`MARK ${id}: entry is not valid JSON (skipped)`);
      continue;
    }
    store.set(`mark-defs:v2:${id}`, JSON.stringify(kv));

    const oldDef = oldKvMarkSynthesis(kv);
    const newDef = await loadMarkDef(env, id);
    const fieldDiffs = diffPaths(oldDef, newDef);
    const keyDiffs: string[] = [];
    for (const lang of ['en', 'he'] as const) {
      const oldKey = keyForMark(oldDef, PROBE_DAF.tractate, PROBE_DAF.page, lang);
      const newKey = newDef ? keyForMark(newDef, PROBE_DAF.tractate, PROBE_DAF.page, lang) : null;
      if (oldKey !== newKey) keyDiffs.push(`key(${lang}): old=${oldKey} new=${newKey}`);
    }
    report('MARK', id, fieldDiffs, keyDiffs);
    mismatches += fieldDiffs.length + keyDiffs.length;
  }

  for (const id of enrichmentIds) {
    const raw = kvGet(ns, `enrichment-defs:v2:${id}`);
    if (raw === null) {
      console.log(`ENRICH ${id}: indexed but entry missing (skipped)`);
      continue;
    }
    let kv: KvEnrichmentDefinition;
    try {
      kv = JSON.parse(raw.trim()) as KvEnrichmentDefinition;
    } catch {
      console.log(`ENRICH ${id}: entry is not valid JSON (skipped)`);
      continue;
    }
    store.set(`enrichment-defs:v2:${id}`, JSON.stringify(kv));

    const oldDef = oldKvEnrichmentPassthrough(kv);
    const newDef = await loadEnrichmentDef(env, id);
    const fieldDiffs = diffPaths(oldDef, newDef);
    const keyDiffs: string[] = [];
    // local/spine scopes need the daf; global must not get one.
    const daf = oldDef.scope === 'global' ? undefined : PROBE_DAF;
    for (const lang of ['en', 'he'] as const) {
      const oldKey = safeKey(() => keyForEnrichment(oldDef, PROBE_INSTANCE, daf, undefined, lang));
      const newKey = newDef
        ? safeKey(() => keyForEnrichment(newDef, PROBE_INSTANCE, daf, undefined, lang))
        : null;
      if (oldKey !== newKey) keyDiffs.push(`key(${lang}): old=${oldKey} new=${newKey}`);
    }
    report('ENRICH', id, fieldDiffs, keyDiffs);
    mismatches += fieldDiffs.length + keyDiffs.length;
  }

  if (mismatches > 0) {
    console.log(
      `\n${mismatches} mismatch(es) — the unified registry diverges from the old loaders.`,
    );
    process.exit(1);
  }
  console.log('\nAll KV defs project identically through old and new loaders.');
}

function safeKey(fn: () => string): string {
  try {
    return fn();
  } catch (e) {
    return `<throws: ${(e as Error).message}>`;
  }
}

function report(kind: string, id: string, fieldDiffs: string[], keyDiffs: string[]): void {
  if (fieldDiffs.length === 0 && keyDiffs.length === 0) {
    console.log(`${kind} ${id}: OK`);
    return;
  }
  console.log(`${kind} ${id}: MISMATCH`);
  for (const d of [...keyDiffs, ...fieldDiffs]) console.log(`  ${d}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
