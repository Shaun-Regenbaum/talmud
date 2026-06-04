/**
 * inspectBridge — a tiny cross-component channel so an "inspect" affordance
 * anywhere (a sidebar card's `(i)`, a dev recipe row) can ask the Inspect panel
 * (RunTreeDock) to open and focus a piece's build DAG. Replaces the old
 * per-instance bottom drawer (InstanceInspectorShelf).
 *
 * Each request carries a monotonic nonce so re-requesting the SAME piece still
 * fires the consumers' effects (a plain value wouldn't change).
 */

import { createSignal } from 'solid-js';

export interface InspectRequest { piece: string; nonce: number; }

const [inspectRequest, setInspectRequest] = createSignal<InspectRequest | null>(null);
let nonce = 0;

export { inspectRequest };

/** Ask the Inspect panel to open and focus `pieceId`'s build DAG. */
export function requestInspect(pieceId: string): void {
  setInspectRequest({ piece: pieceId, nonce: ++nonce });
}
