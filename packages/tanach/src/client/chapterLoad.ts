/**
 * Chapter load tracker — the data behind the reader's load bar.
 *
 * Tanach has no enrichment queue (the talmud loading bar reads a mark-status +
 * prefetch store); here the pieces are plain createResources, so each one
 * reports its state into this tiny registry and the bar derives a fraction
 * from it. A piece enters the registry the moment it starts loading and is
 * "done" on ok/error, so the bar reflects BOTH the auto-loaded chapter pieces
 * (text, sections, sources) and any on-demand ones (the overview, a note) the
 * moment they fire. resetChapterLoad() clears it on chapter change so a stale
 * piece from the previous chapter never counts.
 */

import { createSignal } from 'solid-js';

export type LoadState = 'loading' | 'ok' | 'error';

export interface LoadEntry {
  id: string;
  label: string;
  state: LoadState;
}

const [entries, setEntries] = createSignal<Record<string, LoadEntry>>({});

/** Report a piece's current load state. Idempotent: a no-op when unchanged
 *  (so the signal only fires on a real transition). */
export function reportLoad(id: string, label: string, state: LoadState): void {
  setEntries((prev) => {
    const cur = prev[id];
    if (cur && cur.state === state && cur.label === label) return prev;
    return { ...prev, [id]: { id, label, state } };
  });
}

/** Clear the tracker — call when the chapter changes. */
export function resetChapterLoad(): void {
  setEntries((prev) => (Object.keys(prev).length === 0 ? prev : {}));
}

/** The tracked pieces, in insertion order. */
export function chapterLoadEntries(): LoadEntry[] {
  return Object.values(entries());
}
