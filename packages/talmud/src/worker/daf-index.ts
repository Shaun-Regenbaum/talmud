/**
 * daf-index — WRITE side of the `daf -> cached pieces` reverse index (the read
 * side of the provenance build manifest). On every FRESH mark/enrichment write
 * the run shims stamp one tiny KV entry per (daf, producer, instance, lang) under
 * a daf-PREFIXED key, with per-piece telemetry in the entry's KV metadata. A
 * later reader then answers "what's cached on this daf" with ONE `cache.list()`
 * instead of re-deriving keys and probing each — which is the whole point: the
 * inspector reads recorded truth instead of guessing.
 *
 * ADDITIVE + best-effort: a brand-new `dafidx:v1:` namespace (never touches the
 * frozen `mark:`/`enrich:` keys), written off the request critical path
 * (`ctx.waitUntil`) and swallowing its own errors, so it can never affect a run.
 *
 * Scope (v1): marks (always per-daf) + LOCAL enrichments. Skips global/spine
 * (daf-agnostic) and qualified `.qa` runs (lazy, not in the eager set). Already-
 * warmed entries written before this aren't indexed — the reader falls back to
 * the enumerate-and-probe path for an un-indexed daf.
 */

import { instanceIdOf, keyForDafIndex } from './cache-keys';
import { type InspectEntry, inspectorCostOf, tokensOfEntry } from './inspect';

/** Minimal KV surface the recorder needs (so tests pass a fake). */
export interface DafIndexCache {
  put(key: string, value: string, opts?: { metadata?: unknown }): Promise<void>;
}

/** Per-piece telemetry carried in the index entry's KV metadata. Compact keys to
 *  stay well under KV's 1024-byte metadata cap; null/absent fields are dropped. */
export interface DafIndexMeta {
  /** producer id */ p: string;
  /** kind */ k: 'mark' | 'enrichment';
  /** lang */ l: 'en' | 'he';
  /** instance_id (omitted for whole-daf marks) */ i?: string;
  /** model */ m?: string;
  /** cost USD (billed-or-estimated) */ c?: number;
  /** total tokens */ t?: number;
  /** cold generation time (ms) */ ms?: number;
  /** recipe hash */ rh?: string;
  /** computedAt (epoch ms) */ at?: number;
}

/** Build the compact metadata, dropping empty fields. */
export function dafIndexMetaOf(o: {
  producerId: string;
  kind: 'mark' | 'enrichment';
  lang: 'en' | 'he';
  instanceId?: string;
  model?: string;
  cost?: number | null;
  tokens?: number | null;
  coldMs?: number | null;
  recipeHash?: string | null;
  at?: number | null;
}): DafIndexMeta {
  const meta: DafIndexMeta = { p: o.producerId, k: o.kind, l: o.lang };
  if (o.instanceId && o.instanceId !== '-') meta.i = o.instanceId;
  if (o.model) meta.m = o.model;
  if (typeof o.cost === 'number') meta.c = o.cost;
  if (typeof o.tokens === 'number') meta.t = o.tokens;
  if (typeof o.coldMs === 'number') meta.ms = o.coldMs;
  if (o.recipeHash) meta.rh = o.recipeHash;
  if (typeof o.at === 'number') meta.at = o.at;
  return meta;
}

/** Telemetry the recorder reads off a fresh RunResult (a superset of the cost/
 *  usage InspectEntry needs, plus model/recipe_hash and the stamp's computedAt). */
interface IndexableResult extends Omit<InspectEntry, 'cost'> {
  model?: string;
  recipe_hash?: string;
  cost?: { billedUsd: number | null; estimatedUsd: number | null; computedAt?: number } | null;
}

/** Record a fresh MARK write: one entry per (daf, mark, lang). */
export async function recordMarkDafIndex(
  cache: DafIndexCache,
  producerId: string,
  tractate: string,
  page: string,
  lang: 'en' | 'he',
  res: IndexableResult,
): Promise<void> {
  const meta = dafIndexMetaOf({
    producerId,
    kind: 'mark',
    lang,
    model: res.model,
    cost: inspectorCostOf(res),
    tokens: tokensOfEntry(res),
    coldMs: res.elapsed_ms,
    recipeHash: res.recipe_hash,
    at: res.cost?.computedAt ?? null,
  });
  await cache.put(keyForDafIndex(tractate, page, producerId, '-', lang), '', { metadata: meta });
}

/** Record a fresh LOCAL ENRICHMENT write: one entry per (daf, enrichment, instance, lang). */
export async function recordEnrichmentDafIndex(
  cache: DafIndexCache,
  producerId: string,
  tractate: string,
  page: string,
  markInput: unknown,
  lang: 'en' | 'he',
  res: IndexableResult,
): Promise<void> {
  const instanceId = await instanceIdOf(markInput);
  const meta = dafIndexMetaOf({
    producerId,
    kind: 'enrichment',
    lang,
    instanceId,
    model: res.model,
    cost: inspectorCostOf(res),
    tokens: tokensOfEntry(res),
    coldMs: res.elapsed_ms,
    recipeHash: res.recipe_hash,
    at: res.cost?.computedAt ?? null,
  });
  await cache.put(keyForDafIndex(tractate, page, producerId, instanceId, lang), '', {
    metadata: meta,
  });
}
