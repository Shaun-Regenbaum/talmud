/**
 * Shared store for the per-kind gutter icon measurements.
 *
 * Each `GutterIcons` instance measures its anchors in the daf DOM and
 * publishes a `GutterStackEntry` here. `GutterOverlay` reads the merged
 * store, groups items per side by y-bucket, and renders one cluster per
 * bucket — letting same-line icons across kinds (e.g. halacha + aggadata +
 * rishonim) stack with a slight offset in the rest state and fan out on
 * hover/focus so each is clickable.
 *
 * Without this layer, each GutterIcons instance rendered its own absolute
 * overlay without awareness of the others, so collisions stacked directly
 * on top of each other and only the topmost was clickable.
 */

import { createSignal } from 'solid-js';
import type { GutterItem, GutterKind } from './GutterIcons';

export type GutterSide = 'left' | 'right';

export interface GutterStackEntry {
  kind: GutterKind;
  side: GutterSide;
  /** Measured items (one per anchor in the daf for this kind). */
  items: GutterItem[];
  /** Stable id of the currently-active item across all kinds, e.g.
   *  "argument:2" / "rishonim:7". The overlay highlights the matching icon. */
  activeKey: string | null;
  /** Click handler — same signature DafViewer's onGutterClick has. */
  onClick: (kind: GutterKind, index: number) => void;
}

const [entries, setEntries] = createSignal<Partial<Record<GutterKind, GutterStackEntry>>>({});

export const gutterEntries = entries;

export function publishGutterEntry(entry: GutterStackEntry): void {
  setEntries((cur) => ({ ...cur, [entry.kind]: entry }));
}

export function clearGutterEntry(kind: GutterKind): void {
  setEntries((cur) => {
    if (!cur[kind]) return cur;
    const next = { ...cur };
    delete next[kind];
    return next;
  });
}
