/**
 * GutterOverlay: draws every gutter icon on the daf.
 *
 * Reads the shared `gutterStack` (one entry per kind, published by each
 * `GutterIcons` measurement instance), groups the icons on each side by line,
 * and renders one shared `MarginPod` per line. The pod owns the behaviour
 * (overlapping at rest, spreading on hover or tap, the forgiving edge); this
 * file only places pods and highlights the words of the icon under the
 * pointer.
 *
 * Positioning:
 *   - side='left': at the inside edge of the narrow left gutter
 *     (`calc(26% + 8px)`), text to its right.
 *   - side='right': mirror.
 *   - atEdge pods (anchor sits in a full-width region) move out to the daf
 *     margin instead.
 */

import { paintRangeOverlay, resetOverlay } from '@corpus/ui/highlightOverlay';
import { clusterByLine, MarginPod, type MarginPodItem } from '@corpus/ui/MarginPod';
import { createMemo, For, type JSX } from 'solid-js';
import { type GutterItem, type GutterKind, titleForKind } from './GutterIcons';
import { type GutterSide, type GutterStackEntry, gutterEntries } from './gutterStack';

interface Placed {
  item: GutterItem;
  entry: GutterStackEntry;
  y: number;
}

interface Cluster {
  /** Identifies the pod by its side and line, so a pod keeps its place (and
   *  stays open) while icons elsewhere on the daf finish loading. */
  key: string;
  side: GutterSide;
  /** y-position in px relative to daf-root, averaged across the line. */
  top: number;
  /** True if any icon on the line is atEdge: the whole pod moves out. */
  atEdge: boolean;
  items: Placed[];
}

const Y_BUCKET = 10; // px tolerance: same line if within this band

// CSS positioning. Matches the previous per-kind ARG_X / HALACHA_X math
// in DafViewer so existing visual alignment is preserved.
const LEFT_X = 'calc(26% + 8px)';
const RIGHT_X = 'calc(74% - 8px)';
const LEFT_EDGE_X = '-10px';
const RIGHT_EDGE_X = 'calc(100% + 10px)';

// Stable order within a line, so icons don't shuffle on every measurement.
const KIND_ORDER: GutterKind[] = [
  'argument',
  'pesuk',
  'halacha',
  'chart',
  'aggadata',
  'yerushalmi',
  'rishonim',
];

export function clustersFromEntries(
  entries: Partial<Record<GutterKind, GutterStackEntry>>,
): Cluster[] {
  const out: Cluster[] = [];
  for (const side of ['left', 'right'] as const) {
    const placed: Placed[] = [];
    for (const entry of Object.values(entries)) {
      if (!entry || entry.side !== side) continue;
      for (const item of entry.items) placed.push({ item, entry, y: item.top });
    }
    for (const line of clusterByLine(placed, Y_BUCKET)) {
      line.sort((a, b) => KIND_ORDER.indexOf(a.item.kind) - KIND_ORDER.indexOf(b.item.kind));
      out.push({
        key: `${side}:${Math.round(line[0].y)}`,
        side,
        top: line.reduce((s, p) => s + p.y, 0) / line.length,
        atEdge: line.some((p) => p.item.atEdge),
        items: line,
      });
    }
  }
  return out;
}

const itemKey = (kind: GutterKind, index: number) => `${kind}:${index}`;

/** The words an icon is attached to: from its marker up to the matching end
 *  marker (placed after the range's last word) when the kind has one,
 *  otherwise the marker's excerpt. */
export function gutterPreviewRange(root: Element, kind: GutterKind, index: number): Range | null {
  const start = root.querySelector<HTMLElement>(`.daf-${kind}-anchor[data-idx="${index}"]`);
  const mainText = root.querySelector<HTMLElement>('.daf-main .daf-text');
  if (!start || !mainText) return null;
  const words = Array.from(mainText.querySelectorAll<HTMLElement>('.daf-word'));
  const after = (el: Element) =>
    words.filter((w) => !!(el.compareDocumentPosition(w) & Node.DOCUMENT_POSITION_FOLLOWING));
  const first = after(start)[0];
  if (!first) return null;
  const end = root.querySelector<HTMLElement>(`.daf-${kind}-end-anchor[data-idx="${index}"]`);
  const excerpt = Math.max(1, Number(start.getAttribute('data-excerpt-len')) || 1);
  const upToEnd = end
    ? words.filter((w) => !!(end.compareDocumentPosition(w) & Node.DOCUMENT_POSITION_PRECEDING))
    : [];
  const last = end ? (upToEnd[upToEnd.length - 1] ?? first) : after(start).slice(0, excerpt).pop();
  if (!last || first.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_PRECEDING) return null;
  const range = document.createRange();
  range.setStartBefore(first);
  range.setEndAfter(last);
  return range;
}

export function GutterOverlay(): JSX.Element {
  let layer: HTMLDivElement | undefined;
  const clusters = createMemo(() => clustersFromEntries(gutterEntries()));
  const byKey = createMemo(() => new Map(clusters().map((c) => [c.key, c])));

  // Highlight the words of the icon under the pointer (or keyboard focus) in a
  // layer of its own, so it never disturbs the highlight of an open note.
  const preview = (item: MarginPodItem | null) => {
    const container = layer?.parentElement;
    if (!container) return;
    const host = container.querySelector<HTMLElement>('.daf-root') ?? container;
    const overlay = resetOverlay(host, 'daf-preview-overlay');
    if (!item) return;
    const [kind, index] = item.id.split(':');
    const range = gutterPreviewRange(host, kind as GutterKind, Number(index));
    if (!range) return;
    paintRangeOverlay(overlay, host, [range], {
      className: 'daf-range-highlight daf-range-highlight-preview',
      firstClass: 'daf-range-highlight-first',
      lastClass: 'daf-range-highlight-last',
    });
  };

  return (
    <div
      ref={layer}
      class="gutter-overlay"
      style={{ position: 'absolute', inset: 0, 'pointer-events': 'none' }}
    >
      {/* Keyed by line: new icons loading elsewhere never rebuild or move an
          open pod out from under the pointer. */}
      <For each={clusters().map((c) => c.key)}>
        {(key, ci) => {
          const c = createMemo<Cluster>((prev) => byKey().get(key) ?? (prev as Cluster));
          const items = () =>
            c().items.map(({ item }) => ({
              id: itemKey(item.kind, item.index),
              kind: item.kind,
              label: titleForKind(item.kind),
            }));
          const x = () =>
            c().side === 'left'
              ? c().atEdge
                ? LEFT_EDGE_X
                : LEFT_X
              : c().atEdge
                ? RIGHT_EDGE_X
                : RIGHT_X;
          return (
            <MarginPod
              items={items()}
              textSide={c().side === 'left' ? 'right' : 'left'}
              x={x()}
              y={c().top}
              activeId={c().items[0]?.entry.activeKey ?? null}
              onActivate={(it) => {
                const placed = c().items.find(
                  ({ item }) => itemKey(item.kind, item.index) === it.id,
                );
                placed?.entry.onClick(placed.item.kind, placed.item.index);
              }}
              onPreview={preview}
              tour={ci() === 0 ? 'gutter' : undefined}
            />
          );
        }}
      </For>
    </div>
  );
}
