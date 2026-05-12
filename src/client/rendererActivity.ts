/**
 * Shared store for "what mark renderers have just done to the daf HTML."
 * Each entry: most recent apply per mark id, with instance count, html
 * size delta, and elapsed ms.
 *
 * Written by `applyMarkRenderers` in renderers/dispatch.ts on every pass.
 * Read by `RendererActivityPanel` (mounted in the dev shelf).
 *
 * Unlike aiActivity, entries never expire — the panel shows the last
 * outcome per mark so you can see "halacha last applied 12 instances in
 * 3ms" at a glance. Entries are replaced on each subsequent apply.
 */

import { createSignal } from 'solid-js';

export type RendererState =
  | { kind: 'applied'; instances: number; bytesBefore: number; bytesAfter: number; ms: number; at: number }
  | { kind: 'skip-no-run'; at: number }
  | { kind: 'skip-zero-instances'; at: number }
  | { kind: 'skip-no-renderer'; at: number }
  | { kind: 'error'; error: string; at: number };

export interface RendererEntry {
  id: string;
  key: string;
  state: RendererState;
}

const [entries, setEntries] = createSignal<Record<string, RendererEntry>>({});
export const rendererActivity = entries;

export function recordRender(id: string, key: string, state: RendererState): void {
  setEntries((cur) => ({ ...cur, [id]: { id, key, state } }));
}

export function clearRendererActivity(): void {
  setEntries({});
}
