/**
 * Spine coverage probe — "which pieces of a tractate have been computed yet?"
 *
 * A read-only exploration view over the global spine. For each daf of a tractate
 * and each producer we care about, it answers one question: is there a cached
 * piece for it? The answer is derived purely by listing KV keys by prefix and
 * matching the `{tractate}:{page}` slug that terminates every daf-scoped key
 * (see cache-keys.ts) — no piece is computed here, nothing is mutated. It is the
 * map of the spine filling in as study/warming progresses.
 *
 * Key shapes it reads (all end in the daf slug, optionally + `:q_…`):
 *   ctx:gemara:v1:{tractate}:{page}                          (source text)
 *   mark:{id}:{cache_version}:{tractate}:{page}              (marks)
 *   enrich:{id}:{cache_version}[:he]:{instance}:{tractate}:{page}[:q_…]  (local enrichments)
 *
 * Marks + the gemara source can be listed with a tractate-scoped prefix (the
 * slug sits right after the version). Local enrichments carry an instance_id
 * BEFORE the daf slug, so they must be listed by the producer-wide prefix and
 * filtered by the tractate marker. Per-instance enrichments (per-section voices)
 * count the daf as covered if ANY instance exists for it.
 */

import { iterAmudim, TRACTATE_END_AMUD } from '../lib/sefref/amudim';
import { slugDaf, slugTractate } from './cache-keys';
import { CODE_ENRICHMENTS, CODE_MARKS } from './code-marks';

export interface CoverageColumn {
  id: string;
  label: string;
  kind: 'source' | 'mark' | 'enrichment';
  /** Cache version actually probed (from the live registry), for display/debug. */
  version: string;
}

export interface CoverageRow {
  page: string;
  /** producer id -> computed? */
  cells: Record<string, boolean>;
}

export interface CoverageReport {
  tractate: string;
  endAmud: string;
  columns: CoverageColumn[];
  rows: CoverageRow[];
  summary: { computed: number; total: number; pct: number };
}

/**
 * The producers shown as columns. Curated rather than the whole registry: this
 * is the argument/overview/voice spine the conversation is about, plus the
 * gemara source as the baseline. `id` for marks/enrichments must match a real
 * registry id; the cache_version is read from the registry at probe time.
 */
const COLUMNS: { id: string; label: string; kind: 'source' | 'mark' | 'enrichment' }[] = [
  { id: 'gemara', label: 'text', kind: 'source' },
  { id: 'argument', label: 'argument', kind: 'mark' },
  { id: 'rabbi', label: 'rabbi', kind: 'mark' },
  { id: 'argument-overview', label: 'overview', kind: 'mark' },
  { id: 'argument.voices', label: 'voices', kind: 'enrichment' },
  { id: 'argument-overview.flow', label: 'flow', kind: 'enrichment' },
  { id: 'argument-overview.synthesis', label: 'synthesis', kind: 'enrichment' },
];

/** Cap on KV list pages per producer — a backstop, not an expected limit. One
 *  popular enrichment across all of studied Shas is a few thousand keys = a
 *  handful of 1000-key list calls. */
const MAX_LIST_PAGES = 60;

async function listKeyNames(kv: KVNamespace, prefix: string): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < MAX_LIST_PAGES; i++) {
    const res = await kv.list({ prefix, cursor, limit: 1000 });
    for (const k of res.keys) out.push(k.name);
    if (res.list_complete) break;
    cursor = (res as { cursor?: string }).cursor;
    if (!cursor) break;
  }
  return out;
}

/** Pull the set of page-slugs present in a key list for one tractate. Every key
 *  contains `:{tractateSlug}:{pageSlug}` somewhere near the end; we take the
 *  segment immediately after the tractate marker (which is `:q_…`-safe because
 *  we split on ':'). */
function pageSlugsFrom(keys: string[], tractateSlug: string): Set<string> {
  const marker = `:${tractateSlug}:`;
  const present = new Set<string>();
  for (const key of keys) {
    const idx = key.indexOf(marker);
    if (idx === -1) continue;
    const pageSlug = key.slice(idx + marker.length).split(':')[0];
    if (pageSlug) present.add(pageSlug);
  }
  return present;
}

function resolveColumns(): (CoverageColumn & {
  prefix: (tractateSlug: string) => string | null;
})[] {
  return COLUMNS.map((col) => {
    if (col.kind === 'source') {
      return { ...col, version: 'v1', prefix: (ts: string) => `ctx:gemara:v1:${ts}:` };
    }
    if (col.kind === 'mark') {
      const def = CODE_MARKS.find((m) => m.id === col.id);
      const version = def?.cache_version ?? '?';
      return {
        ...col,
        version,
        prefix: def ? (ts: string) => `mark:${col.id}:${version}:${ts}:` : () => null,
      };
    }
    const def = CODE_ENRICHMENTS.find((e) => e.id === col.id);
    const version = def?.cache_version ?? '?';
    // enrichment: instance_id sits before the daf slug, so we cannot scope the
    // prefix by tractate; list the whole producer and filter by the marker.
    return {
      ...col,
      version,
      prefix: def ? () => `enrich:${col.id}:${version}:` : () => null,
    };
  });
}

export function isKnownTractate(tractate: string): boolean {
  return Object.hasOwn(TRACTATE_END_AMUD, tractate.toLowerCase());
}

export async function computeCoverage(
  kv: KVNamespace,
  tractateRaw: string,
): Promise<CoverageReport> {
  const tractate = tractateRaw.toLowerCase();
  const tractateSlug = slugTractate(tractate);
  const columns = resolveColumns();

  // One KV list per producer, in parallel, then reduce to per-page presence sets.
  const presence = await Promise.all(
    columns.map(async (col) => {
      const prefix = col.prefix(tractateSlug);
      if (!prefix) return new Set<string>();
      const keys = await listKeyNames(kv, prefix);
      return pageSlugsFrom(keys, tractateSlug);
    }),
  );

  const rows: CoverageRow[] = [];
  let computed = 0;
  for (const page of iterAmudim(tractate)) {
    const pageSlug = slugDaf(tractate, page).split(':')[1];
    const cells: Record<string, boolean> = {};
    columns.forEach((col, i) => {
      const hit = presence[i].has(pageSlug);
      cells[col.id] = hit;
      if (hit) computed++;
    });
    rows.push({ page, cells });
  }

  const total = rows.length * columns.length;
  return {
    tractate,
    endAmud: TRACTATE_END_AMUD[tractate] ?? '',
    columns: columns.map(({ id, label, kind, version }) => ({ id, label, kind, version })),
    rows,
    summary: { computed, total, pct: total ? Math.round((computed / total) * 100) : 0 },
  };
}
