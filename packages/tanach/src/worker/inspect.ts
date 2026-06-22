/**
 * Chapter inspector — what's cached for a chapter, what it cost, and HOW each
 * piece was built.
 *
 * The tanach analogue of the talmud reader's Inspect surfaces, and like talmud
 * there is no separate index: the CACHE *is* the index. Two read shapes:
 *
 *  - `chapterRuns` — the WATERFALL: every producer piece + its telemetry. The
 *    producer SET, labels, kind, and per-row expandability are DERIVED from the
 *    registry (producers/defs.ts → tanachProducerDefs); only the literal cache-
 *    key bytes are an explicit per-id table (KEY_SHAPES), byte-exact to the
 *    writer in run-ports.ts — the one thing that can't be derived.
 *  - `chapterRunTree` — the DAG: one piece's forward dependency subgraph via the
 *    core `buildRunTree` over that same registry, draped with the root's cached
 *    telemetry. Tanach producers depend only on SOURCES, so every tree is one
 *    level (piece → its source inputs) and `isExpandable` is false for all — the
 *    inspector's flat shape is a property of the registry, not a hard-coded flag.
 *
 * Each producer entry written through runProducer is a StoredArtifact envelope
 * carrying model + elapsed_ms + the CostStamp (+ provenance), so the per-piece
 * time / cost / authority come straight off it; pre-migration raw payloads read
 * as cached-but-untimed.
 *
 * Pure over a minimal KV surface so it unit-tests without a Worker.
 */

import type { CostStamp } from '@corpus/core/model/provenance';
import type { StoredArtifact } from '@corpus/core/store/envelope';
import { authorityOf } from '@corpus/core/store/envelope';
import { buildRunTree, isExpandable, type RunTelemetry } from '@corpus/core/telemetry/runtree';
import type { RunTree } from '@corpus/core/telemetry/types';
import { TANACH_PRODUCERS, tanachProducerDefs } from './producers/defs.ts';
import { isStoredArtifact } from './run-ports.ts';

export interface RunRow {
  /** Producer id. */
  id: string;
  label: string;
  /** The per-instance discriminator for DISPLAY (verse / range) or null. */
  instance: string | null;
  /** The raw key tail used to address this instance's cache entry (null for
   *  whole-chapter pieces). Drives the run-tree fetch. */
  instanceRaw: string | null;
  /** True iff this piece's dependency subgraph reaches another PRODUCER — i.e.
   *  there's a real DAG to drill into. Derived from the registry (false for
   *  every tanach producer today: they depend only on sources). */
  expandable: boolean;
  cached: boolean;
  model: string | null;
  /** Generation wall-time (ms) from the cached envelope, when known. */
  coldMs: number | null;
  /** Estimated (or billed) generation cost in USD, when known. */
  cost: number | null;
  tokens: number | null;
}

export interface ChapterRuns {
  book: string;
  chapter: number;
  runs: RunRow[];
  totals: { count: number; cached: number; cost: number; coldMs: number };
}

/** The minimal KV surface the inspector reads (KVNamespace satisfies this). */
export interface RunsCache {
  get(key: string): Promise<string | null>;
  list(opts: { prefix: string }): Promise<{ keys: { name: string }[] }>;
}

// ── per-producer cache-key bytes (the one thing not derivable) ────────────────
// Byte-exact to the writer (run-ports.ts KEY_TEMPLATES). A `chapter` producer is
// addressed by exact key; an `instance` producer is enumerated by prefix, each
// found key's tail giving the instance.
interface ChapterShape {
  kind: 'chapter';
  key: (b: string, c: string) => string;
}
interface InstanceShape {
  kind: 'instance';
  prefix: (b: string, c: string) => string;
  key: (b: string, c: string, raw: string) => string;
  /** Display form of the instance tail (e.g. a verse number → "v3"). */
  label: (raw: string) => string;
}
const KEY_SHAPES: Record<string, ChapterShape | InstanceShape> = {
  events: { kind: 'chapter', key: (b, c) => `events:v2:${b}:${c}` },
  overview: { kind: 'chapter', key: (b, c) => `overview:v1:${b}:${c}` },
  geography: { kind: 'chapter', key: (b, c) => `geography:v2:${b}:${c}` },
  tidbit: { kind: 'chapter', key: (b, c) => `tidbit:v2:${b}:${c}` },
  note: {
    kind: 'instance',
    prefix: (b, c) => `note:v1:${b}:${c}:`,
    key: (b, c, raw) => `note:v1:${b}:${c}:${raw}`,
    label: (raw) => raw,
  },
  synthesis: {
    kind: 'instance',
    prefix: (b, c) => `synthesis:v1:${b}:${c}:`,
    key: (b, c, raw) => `synthesis:v1:${b}:${c}:${raw}`,
    label: (raw) => `v${raw}`,
  },
  'midrash-synthesis': {
    kind: 'instance',
    prefix: (b, c) => `midrash-synth:v1:${b}:${c}:`,
    key: (b, c, raw) => `midrash-synth:v1:${b}:${c}:${raw}`,
    label: (raw) => `v${raw}`,
  },
};
// The chapter-addressable producers, in waterfall order (KEY_SHAPES is declared
// chapter-pieces-first, then per-instance; object key order is preserved). This
// is exactly the set with a cache-key shape — `translate` is selection-keyed
// (no chapter address), so it has no KEY_SHAPE and is never inspected here.
const INSPECTED_IDS = Object.keys(KEY_SHAPES);

const labelOf = (id: string): string =>
  TANACH_PRODUCERS[id as keyof typeof TANACH_PRODUCERS]?.label ?? id;

const NO_TELEMETRY = { model: null, coldMs: null, cost: null, tokens: null };

/** Parse a stored cache value into the envelope (or null for miss / non-envelope). */
function envelopeOf(raw: string | null): StoredArtifact | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isStoredArtifact(parsed) ? (parsed as StoredArtifact) : null;
}

/** Project a stored cache value into a waterfall row's cache/telemetry fields. A
 *  null raw means a miss; a non-envelope (legacy raw payload) is
 *  cached-but-untimed. */
export function telemetryOf(
  raw: string | null,
): Pick<RunRow, 'cached' | 'model' | 'coldMs' | 'cost' | 'tokens'> {
  if (raw === null) return { cached: false, ...NO_TELEMETRY };
  const env = envelopeOf(raw);
  if (!env) return { cached: true, ...NO_TELEMETRY };
  const cost = (env.cost ?? null) as CostStamp | null;
  return {
    cached: true,
    // 'legacy-cache' is the synthetic model the read adapter stamps on wrapped
    // pre-envelope payloads — not a real model.
    model: env.model && env.model !== 'legacy-cache' ? env.model : null,
    coldMs: env.elapsed_ms || null,
    // Prefer the provider's billed cost; fall back to the price-table estimate.
    cost: cost ? (cost.billedUsd ?? cost.estimatedUsd ?? null) : null,
    tokens: cost ? cost.tokensIn + cost.tokensOut : null,
  };
}

/** Project a stored envelope into a run-tree node's RunTelemetry — the richer
 *  shape (adds authority / createdAt / recipeHash for the provenance pane). */
function treeTelemetryOf(raw: string | null): RunTelemetry {
  const env = envelopeOf(raw);
  if (!env) return { cached: raw !== null };
  const cost = (env.cost ?? null) as CostStamp | null;
  return {
    cached: true,
    model: env.model && env.model !== 'legacy-cache' ? env.model : null,
    cold_ms: env.elapsed_ms || null,
    cost: cost ? (cost.billedUsd ?? cost.estimatedUsd ?? null) : null,
    tokens: cost ? cost.tokensIn + cost.tokensOut : null,
    authority: authorityOf(env),
    createdAt: cost?.computedAt ? new Date(cost.computedAt).toISOString() : null,
    recipeHash: env.recipe_hash ?? null,
  };
}

/** Enumerate every cached producer piece for a chapter + its telemetry. */
export async function chapterRuns(
  cache: RunsCache,
  book: string,
  chapter: string,
): Promise<ChapterRuns> {
  const defs = tanachProducerDefs();
  const expandableOf = (id: string) => isExpandable(defs, id);

  const rows: RunRow[] = [];
  for (const id of INSPECTED_IDS) {
    const shape = KEY_SHAPES[id];
    const base = { id, label: labelOf(id), expandable: expandableOf(id) };
    if (shape.kind === 'chapter') {
      const raw = await cache.get(shape.key(book, chapter));
      rows.push({ ...base, instance: null, instanceRaw: null, ...telemetryOf(raw) });
    } else {
      const prefix = shape.prefix(book, chapter);
      const { keys } = await cache.list({ prefix });
      const found = await Promise.all(
        keys.map(async (k): Promise<RunRow> => {
          const tail = k.name.slice(prefix.length);
          const raw = await cache.get(k.name);
          return {
            ...base,
            instance: shape.label(tail),
            instanceRaw: tail,
            ...telemetryOf(raw),
          };
        }),
      );
      rows.push(...found);
    }
  }

  const totals = {
    count: rows.length,
    cached: rows.filter((r) => r.cached).length,
    cost: rows.reduce((s, r) => s + (r.cost ?? 0), 0),
    coldMs: rows.reduce((s, r) => s + (r.coldMs ?? 0), 0),
  };
  return { book, chapter: Number(chapter), runs: rows, totals };
}

/** The source-input ids the registry references (dep ids that aren't producers).
 *  Marked available ($0, cached) as run-tree leaves. Derived, not listed. */
function sourceIdsOf(defs: ReturnType<typeof tanachProducerDefs>): Set<string> {
  const producerIds = new Set(defs.map((d) => d.id));
  const sources = new Set<string>();
  for (const d of defs)
    for (const dep of d.dependencies ?? []) {
      if (typeof dep === 'string' && !producerIds.has(dep)) sources.add(dep);
    }
  return sources;
}

/** Build the build-provenance DAG for ONE piece: its forward dependency subgraph
 *  (the core derivation over the registry) with the root's cached telemetry
 *  attached. Returns null for a non-chapter-addressable id (unknown producer, or
 *  the selection-keyed `translate` — nothing to read per chapter). */
export async function chapterRunTree(
  cache: RunsCache,
  book: string,
  chapter: string,
  id: string,
  instanceRaw: string | null,
  lang: string,
): Promise<RunTree | null> {
  const shape = KEY_SHAPES[id];
  if (!shape) return null;
  const defs = tanachProducerDefs();

  const telemetry: Record<string, RunTelemetry> = {};
  const key =
    shape.kind === 'chapter'
      ? shape.key(book, chapter)
      : shape.key(book, chapter, instanceRaw ?? '');
  telemetry[id] = treeTelemetryOf(await cache.get(key));
  // Source inputs are fetched/assembled on demand — show them as available.
  for (const s of sourceIdsOf(defs)) telemetry[s] = { cached: true };

  return buildRunTree(defs, telemetry, id, { tractate: book, page: chapter, lang });
}
