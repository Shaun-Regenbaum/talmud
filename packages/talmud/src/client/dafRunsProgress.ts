/**
 * dafRunsProgress — the PURE (no Solid) shape + reducers shared by the Inspect
 * waterfall and the load bar, split out of dafRunsStore so they're unit-testable
 * without booting the reactive store (whose module-scope createResource trips
 * Solid's SSR build under vitest). The store re-exports these.
 */

import type { Authority, Staleness } from './runTreeShared';

export interface DafRun {
  id: string;
  label: string;
  kind: 'llm' | 'computed';
  producer: 'mark' | 'enrichment';
  model?: string;
  cached: boolean;
  cold_ms: number | null;
  cost: number | null;
  tokens: number | null;
  // additive (older payloads omit them)
  authority?: Authority | null;
  staleness?: Staleness | null;
  /** Per-instance producers report the warmed fraction (e.g. 3/5 pesukim). */
  instances?: { total: number; cached: number };
  /** Dev-only / experimental producers (e.g. chart) — excluded from the load
   *  bar's denominator since the reader never auto-warms them. */
  experimental?: boolean;
}

/** A row the reader auto-warms on daf load — the load bar's denominator. Excludes
 *  experimental (chart) and lazy on-demand leaves (*.qa / *.suggested-questions),
 *  which only warm when a user opens them, so they'd otherwise peg the bar < 100%. */
export function isEagerRow(r: Pick<DafRun, 'id' | 'experimental'>): boolean {
  if (r.experimental) return false;
  if (r.id.endsWith('.qa') || r.id.endsWith('.suggested-questions')) return false;
  return true;
}

/** Reduce the snapshot to a cache-progress fraction over the eager set. Counts
 *  per-instance producers by their instance units (3/5 pesukim = 5 units, 3 done)
 *  so a half-warmed per-pasuk producer reads honestly. */
export function cacheProgressOf(rows: DafRun[]): { total: number; cached: number; pct: number } {
  let total = 0;
  let cached = 0;
  for (const r of rows) {
    if (!isEagerRow(r)) continue;
    total += r.instances?.total ?? 1;
    cached += r.instances?.cached ?? (r.cached ? 1 : 0);
  }
  return { total, cached, pct: total > 0 ? Math.round((cached / total) * 100) : 0 };
}
