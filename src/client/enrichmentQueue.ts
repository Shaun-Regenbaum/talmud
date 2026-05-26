/**
 * Shared client-side enrichment queue + result cache.
 *
 * Extracted from MarkEnrichmentCards so the caching / queueing / abort
 * behaviour can be unit-tested without dragging in the Solid component tree
 * (tests run in a plain `node` env with no JSX transform). The component owns
 * the singleton `RequestQueue` instance and the fetch logic; this module owns
 * the reusable primitives.
 */

import { queueActivity } from './aiActivity';

export interface RunResult {
  content: string;
  parsed: unknown;
  parse_error: string | null;
  model: string;
  total_ms: number;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number } | null;
  transport?: string;
  attempts?: number;
  elapsed_ms?: number;
  resolved?: { system_prompt: string; user_prompt: string };
  /** Aggregate-only: parsed output of each dep enrichment, keyed by dep id.
   *  Lets the client surface leaves in the inspector without a second
   *  round-trip. */
  deps_resolved?: Record<string, unknown>;
  /** Aggregate-only: parsed output of each dep MARK (e.g. `{ mark: 'rabbi' }`
   *  → instances list under the 'rabbi' key). Same fetch as deps_resolved;
   *  surfaced so a sidebar can render mark-specific UI without re-fetching. */
  anchors_resolved?: Record<string, unknown>;
}

/** True for an AbortError (DOMException or any error whose name is set). */
export function isAbort(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === 'AbortError';
}

// ---------------------------------------------------------------------------
// Client-side result cache
// ---------------------------------------------------------------------------

// Memo of completed enrichment runs, keyed by
// enrichmentId:tractate:page:instanceKey. The server already caches in KV, but
// every sidebar mount otherwise re-POSTs /api/studio/run and waits behind the
// shared queue — so re-opening an anchor (or the second/third click on a page)
// showed a spinner even though the result was already known. With this memo a
// re-click renders instantly and never touches the queue at all. Within a
// session, instanceKey ↔ mark_input is stable per (tractate, page), so this is
// safe. Cleared wholesale on `marks-runs-invalidate` (model/prompt changes)
// and on full reload.
export const runResultCache = new Map<string, RunResult>();

export function runCacheKey(enrichmentId: string, tractate: string, page: string, instanceKey: string, lang: string): string {
  return `${enrichmentId}:${tractate}:${page}:${instanceKey}:${lang}`;
}

/** Drop every cached run. Wired to the `marks-runs-invalidate` event below so
 *  switching models / editing prompts re-fetches instead of showing stale
 *  output. Exported so callers (and tests) can invalidate directly. */
export function clearRunResultCache(): void {
  runResultCache.clear();
}

if (typeof window !== 'undefined') {
  window.addEventListener('marks-runs-invalidate', () => clearRunResultCache());
}

// ---------------------------------------------------------------------------
// Priority queue
// ---------------------------------------------------------------------------

// Queue priority tiers (lower = drains first). A user opening an anchor must
// not wait behind speculative work: background prefetch (LOW) and
// scroll-deferred move cards (NORMAL) yield to the synthesis the user just
// clicked (HIGH). Within a tier, ties break FIFO so ordering stays stable.
export const QUEUE_PRIORITY = { high: 0, normal: 1, low: 2 } as const;
export type QueuePriority = (typeof QUEUE_PRIORITY)[keyof typeof QUEUE_PRIORITY];

// Shared priority queue with bounded concurrency so opening one section that
// mounts many move cards doesn't barrage `/api/studio/run` in parallel
// (workerd dies on the simultaneous fan-out + 30k-char prompts; see
// 2026-05-07 incident). KV cache hits still go through the queue but resolve
// fast, so there's no penalty once a section has been opened before.
//
// Two scheduling guarantees on top of plain concurrency:
//   - Priority: a waiting HIGH task drains before NORMAL before LOW.
//   - Foreground reservation: LOW (background prefetch) may occupy at most
//     `concurrency - reserve` slots, so a slot is always kept free for a
//     foreground click. Priority alone isn't enough — it only reorders
//     WAITING tasks and can't preempt an in-flight cold generation, so without
//     the reservation a burst of cold LOW prefetch fills every slot and a
//     user's HIGH click still stalls ~60s waiting for one to finish.
interface QueueItem { run: () => void; priority: number; seq: number; isLow: boolean }
export class RequestQueue {
  private queue: QueueItem[] = [];
  private active = 0;
  private activeLow = 0;
  private seq = 0;
  constructor(private readonly concurrency: number, private readonly reserve = 1) {}
  // `activityId` + `activityLabel` are reported to the shared activity
  // store as a `queued` entry the instant the task is pushed onto the
  // queue. When pump() finally invokes the task, trackAI() inside the work
  // function promotes the same id to `loading`. If a slot is free
  // immediately (active < concurrency), the queued state is set then
  // overwritten on the same tick — that's fine; the panel just never
  // shows a flash of "queued" for fast-path enqueues.
  enqueue<T>(
    activityId: string,
    activityLabel: string,
    task: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
    priority: QueuePriority = QUEUE_PRIORITY.normal,
  ): Promise<T> {
    queueActivity(activityId, activityLabel);
    const isLow = priority >= QUEUE_PRIORITY.low;
    return new Promise((resolve, reject) => {
      const run = () => {
        // Dropped while still waiting for a slot (sidebar closed, anchor
        // switched, daf changed). Reject without burning a concurrency slot
        // so the queue keeps draining for the current daf.
        if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
        this.active++;
        if (isLow) this.activeLow++;
        const done = () => { this.active--; if (isLow) this.activeLow--; this.pump(); };
        task(signal ?? new AbortController().signal).then(
          (v) => { done(); resolve(v); },
          (e) => { done(); reject(e); },
        );
      };
      this.queue.push({ run, priority, seq: this.seq++, isLow });
      this.pump();
    });
  }
  private pump() {
    const lowCap = Math.max(0, this.concurrency - this.reserve);
    while (this.active < this.concurrency && this.queue.length > 0) {
      // Highest-priority eligible task (lowest tier, then FIFO). A LOW task is
      // ineligible once `concurrency - reserve` LOW tasks are already running,
      // keeping a slot open for foreground work.
      let bestIdx = -1;
      for (let i = 0; i < this.queue.length; i++) {
        const item = this.queue[i];
        if (item.isLow && this.activeLow >= lowCap) continue;
        const best = bestIdx === -1 ? null : this.queue[bestIdx];
        if (!best || item.priority < best.priority || (item.priority === best.priority && item.seq < best.seq)) {
          bestIdx = i;
        }
      }
      if (bestIdx === -1) break; // only LOW tasks remain and the LOW cap is full
      const next = this.queue.splice(bestIdx, 1)[0];
      next.run();
    }
  }
}
