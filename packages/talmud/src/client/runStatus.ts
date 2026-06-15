/**
 * runStatus — the pure state-machine the Inspector's waterfall rows use to
 * reconcile two INDEPENDENT sources: live run state (the in-memory aiActivity
 * signal) and cached telemetry (the /api/daf-runs snapshot). Extracted from
 * RunTreeDock so the reconciliation is unit-testable (tests/inspect-row-status)
 * — the thing that silently drifted before: a finished per-instance producer
 * would sit on "run" then flip to "miss" (never "hit") because the snapshot
 * probed the wrong key. With the endpoint fixed, this pins run -> hit.
 */

/** Minimal shape of one aiActivity entry (avoids importing the Solid store). */
export interface ActivityLike {
  id: string;
  state: { kind: string };
}

const LIVE_KINDS = new Set(['loading', 'queued']);

/**
 * The producer id an activity id refers to. Reader warms key activity as
 * `${producerId}:${tractate}:${page}:${instance}[:lang]` (enrichmentQueue /
 * MarkEnrichmentCards / QAPanel), so the producer is the first segment — EXCEPT
 * the dev MarksRegistryPanel, which prefixes `mark:` / `enrichment:`. Strip that
 * so both map to the real producer id (the bare first segment matched no row).
 */
export function producerIdOf(activityId: string): string {
  const parts = activityId.split(':');
  if ((parts[0] === 'mark' || parts[0] === 'enrichment') && parts[1]) return parts[1];
  return parts[0] ?? '';
}

/** Producer ids with >=1 instance currently loading/queued. Collapsing per
 *  instance to producer is intentional (a row is one producer) — but the COUNT
 *  matters for "2 warming", so see liveProducerCounts. */
export function liveProducerSet(activities: Record<string, ActivityLike>): Set<string> {
  const out = new Set<string>();
  for (const e of Object.values(activities)) {
    if (!LIVE_KINDS.has(e.state.kind)) continue;
    const pid = producerIdOf(e.id);
    if (pid) out.add(pid);
  }
  return out;
}

/** How many instances of each producer are loading/queued right now. Lets a row
 *  show "2 warming" instead of a single binary spinner that hid the fan-out. */
export function liveProducerCounts(activities: Record<string, ActivityLike>): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of Object.values(activities)) {
    if (!LIVE_KINDS.has(e.state.kind)) continue;
    const pid = producerIdOf(e.id);
    if (pid) out.set(pid, (out.get(pid) ?? 0) + 1);
  }
  return out;
}

/** The badge a waterfall row shows: live work wins, else the snapshot's
 *  hit/miss. (Once the snapshot keys per-instance producers correctly, a warmed
 *  row settles on 'hit' instead of bouncing back to 'miss'.) */
export function rowStatus(o: { loading: boolean; cached: boolean }): 'run' | 'hit' | 'miss' {
  if (o.loading) return 'run';
  return o.cached ? 'hit' : 'miss';
}
