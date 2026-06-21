/**
 * Chapter inspector — what's cached for a chapter, and what it cost.
 *
 * The tanach analogue of the talmud reader's Inspect waterfall. Like talmud,
 * there is no separate index: the CACHE *is* the index. The producers' keys are
 * deterministic, so we read the two chapter-level ones by exact key (showing
 * them even when cold = a miss), and enumerate the per-instance ones (note,
 * synthesis, midrash-synthesis) by KV prefix list. Each producer entry written
 * through runProducer is a StoredArtifact envelope carrying model + elapsed_ms
 * + the CostStamp, so the per-piece time and cost come straight off it; the
 * pre-migration raw-payload entries read as cached-but-untimed.
 *
 * Pure over a minimal KV surface so it unit-tests without a Worker.
 */

import type { CostStamp } from '@corpus/core/model/provenance';
import type { StoredArtifact } from '@corpus/core/store/envelope';
import { isStoredArtifact } from './run-ports.ts';

export interface RunRow {
  /** Producer id. */
  id: string;
  label: string;
  /** The per-instance discriminator (verse / range) or null for whole-chapter. */
  instance: string | null;
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

const NO_TELEMETRY = { model: null, coldMs: null, cost: null, tokens: null };

/** Project a stored cache value into a row's cache/telemetry fields. A null raw
 *  means a miss; a non-envelope (legacy raw payload) is cached-but-untimed. */
export function telemetryOf(
  raw: string | null,
): Pick<RunRow, 'cached' | 'model' | 'coldMs' | 'cost' | 'tokens'> {
  if (raw === null) return { cached: false, ...NO_TELEMETRY };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { cached: true, ...NO_TELEMETRY };
  }
  if (!isStoredArtifact(parsed)) return { cached: true, ...NO_TELEMETRY };
  const env = parsed as StoredArtifact;
  const cost = (env.cost ?? null) as CostStamp | null;
  return {
    cached: true,
    // 'legacy-cache' is the synthetic model the read adapter stamps on wrapped
    // pre-envelope payloads — not a real model.
    model: env.model && env.model !== 'legacy-cache' ? env.model : null,
    coldMs: env.elapsed_ms || null,
    cost: cost ? (cost.estimatedUsd ?? cost.billedUsd ?? null) : null,
    tokens: cost ? cost.tokensIn + cost.tokensOut : null,
  };
}

/** The two whole-chapter producers, addressed by exact key. */
const CHAPTER_PRODUCERS = [
  { id: 'events', label: 'Sections', key: (b: string, c: string) => `events:v2:${b}:${c}` },
  { id: 'overview', label: 'Overview', key: (b: string, c: string) => `overview:v1:${b}:${c}` },
];

/** The per-instance producers, enumerated by KV prefix; `inst` labels the row
 *  from the key tail (the range for note, the verse for the per-verse ones). */
const INSTANCE_PRODUCERS = [
  {
    id: 'note',
    label: 'Section note',
    prefix: (b: string, c: string) => `note:v1:${b}:${c}:`,
    inst: (tail: string) => tail,
  },
  {
    id: 'synthesis',
    label: 'Commentary synthesis',
    prefix: (b: string, c: string) => `synthesis:v1:${b}:${c}:`,
    inst: (tail: string) => `v${tail}`,
  },
  {
    id: 'midrash-synthesis',
    label: 'Midrash synthesis',
    prefix: (b: string, c: string) => `midrash-synth:v1:${b}:${c}:`,
    inst: (tail: string) => `v${tail}`,
  },
];

/** Enumerate every cached producer piece for a chapter + its telemetry. */
export async function chapterRuns(
  cache: RunsCache,
  book: string,
  chapter: string,
): Promise<ChapterRuns> {
  // Chapter-level: exact reads in parallel (shown even on a miss).
  const chapterRows = await Promise.all(
    CHAPTER_PRODUCERS.map(async (p): Promise<RunRow> => {
      const raw = await cache.get(p.key(book, chapter));
      return { id: p.id, label: p.label, instance: null, ...telemetryOf(raw) };
    }),
  );

  // Per-instance: list each prefix, then read the found keys in parallel.
  const instanceRows: RunRow[] = [];
  for (const p of INSTANCE_PRODUCERS) {
    const prefix = p.prefix(book, chapter);
    const { keys } = await cache.list({ prefix });
    const rows = await Promise.all(
      keys.map(async (k): Promise<RunRow> => {
        const raw = await cache.get(k.name);
        return {
          id: p.id,
          label: p.label,
          instance: p.inst(k.name.slice(prefix.length)),
          ...telemetryOf(raw),
        };
      }),
    );
    instanceRows.push(...rows);
  }

  const runs = [...chapterRows, ...instanceRows];
  const totals = {
    count: runs.length,
    cached: runs.filter((r) => r.cached).length,
    cost: runs.reduce((s, r) => s + (r.cost ?? 0), 0),
    coldMs: runs.reduce((s, r) => s + (r.coldMs ?? 0), 0),
  };
  return { book, chapter: Number(chapter), runs, totals };
}
