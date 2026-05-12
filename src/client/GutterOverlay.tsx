/**
 * GutterOverlay — unified renderer for all gutter icons.
 *
 * Reads the shared `gutterStack` (one entry per kind, published by each
 * `GutterIcons` measurement instance), groups items per side by y-bucket
 * (~10px tolerance), and renders one cluster per bucket. Same-line items
 * across kinds (halacha + aggadata + rishonim on a single visual line)
 * stack with a slight horizontal offset in the rest state and fan out on
 * hover / focus so each is clickable.
 *
 * Positioning:
 *   • side='left': cluster anchored at the inside edge of the narrow left
 *     gutter (`calc(SIDE_PCT% + 8px)`), icons fan rightward into the daf
 *     edge zone on hover so they don't push back into the main column.
 *   • side='right': mirror.
 *   • atEdge clusters (anchor sits in a full-width region) push out to the
 *     daf margin instead.
 */

import { createMemo, For, type JSX } from 'solid-js';
import { gutterEntries, type GutterStackEntry, type GutterSide } from './gutterStack';
import { GutterGlyph, colorForKind, titleForKind, type GutterItem, type GutterKind } from './GutterIcons';

interface ClusterItem {
  kind: GutterKind;
  index: number;
  activeKey: string | null;
  onClick: (kind: GutterKind, index: number) => void;
}

interface Cluster {
  side: GutterSide;
  /** y-position in px relative to daf-root, averaged across the bucket. */
  top: number;
  /** True if any item in the bucket is atEdge — the whole cluster shifts out. */
  atEdge: boolean;
  items: ClusterItem[];
}

const Y_BUCKET = 10; // px tolerance — same line if within this band

// CSS positioning. Matches the previous per-kind ARG_X / HALACHA_X math
// in DafViewer so existing visual alignment is preserved.
const LEFT_X = 'calc(26% + 8px)';
const RIGHT_X = 'calc(74% - 8px)';
const LEFT_EDGE_X = '-10px';
const RIGHT_EDGE_X = 'calc(100% + 10px)';

function clustersFromEntries(entries: Partial<Record<GutterKind, GutterStackEntry>>): Cluster[] {
  const bySide: Record<GutterSide, ClusterItem[][]> = { left: [], right: [] };
  // Flatten + sort by y so bucketing is stable.
  const allBySide: Record<GutterSide, Array<{ item: GutterItem; entry: GutterStackEntry }>> = {
    left: [], right: [],
  };
  for (const entry of Object.values(entries)) {
    if (!entry) continue;
    for (const item of entry.items) allBySide[entry.side].push({ item, entry });
  }
  const out: Cluster[] = [];
  for (const side of ['left', 'right'] as const) {
    const flat = allBySide[side].slice().sort((a, b) => a.item.top - b.item.top);
    let bucket: Array<{ item: GutterItem; entry: GutterStackEntry }> = [];
    const flushBucket = () => {
      if (bucket.length === 0) return;
      const topSum = bucket.reduce((s, b) => s + b.item.top, 0);
      const atEdge = bucket.some((b) => b.item.atEdge);
      out.push({
        side,
        top: topSum / bucket.length,
        atEdge,
        items: bucket.map(({ item, entry }) => ({
          kind: item.kind,
          index: item.index,
          activeKey: entry.activeKey,
          onClick: entry.onClick,
        })),
      });
      bucket = [];
    };
    for (const entry of flat) {
      if (bucket.length === 0 || Math.abs(entry.item.top - bucket[bucket.length - 1].item.top) <= Y_BUCKET) {
        bucket.push(entry);
      } else {
        flushBucket();
        bucket.push(entry);
      }
    }
    flushBucket();
  }
  // Within a cluster, give the icons a stable order so collisions don't
  // shuffle visually on every measurement. Sort by kind priority — argument
  // first on left, halacha first on right (matches user mental model).
  const KIND_ORDER: GutterKind[] = ['argument', 'pesuk', 'halacha', 'aggadata', 'rishonim'];
  for (const c of out) {
    c.items.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  }
  // Suppress noise: discard side+null containers
  void bySide;
  return out;
}

export function GutterOverlay(): JSX.Element {
  const clusters = createMemo(() => clustersFromEntries(gutterEntries()));

  const renderItem = (item: ClusterItem, idx: number, total: number): JSX.Element => {
    const key = `${item.kind}:${item.index}`;
    const isActive = item.activeKey === key;
    const color = colorForKind(item.kind);
    return (
      <button
        type="button"
        onClick={() => item.onClick(item.kind, item.index)}
        title={titleForKind(item.kind)}
        class="gutter-icon"
        data-cluster-index={idx}
        data-cluster-total={total}
        style={{
          width: '14px',
          height: '14px',
          'border-radius': '50%',
          border: 'none',
          background: color,
          color: '#fff',
          display: 'inline-flex',
          'align-items': 'center',
          'justify-content': 'center',
          padding: 0,
          'line-height': 0,
          cursor: 'pointer',
          'box-shadow': isActive ? `0 0 0 2px ${color}60` : 'none',
          'pointer-events': 'auto',
        }}
      >
        <GutterGlyph kind={item.kind} />
      </button>
    );
  };

  return (
    <div
      class="gutter-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        'pointer-events': 'none',
      }}
    >
      <For each={clusters()}>{(c) => {
        const side = c.side;
        const x = side === 'left'
          ? (c.atEdge ? LEFT_EDGE_X : LEFT_X)
          : (c.atEdge ? RIGHT_EDGE_X : RIGHT_X);
        return (
          <div
            class="gutter-cluster"
            data-side={side}
            data-count={c.items.length}
            style={{
              position: 'absolute',
              top: `${c.top}px`,
              left: x,
              transform: 'translate(-50%, -50%)',
              'pointer-events': 'auto',
            }}
          >
            <For each={c.items}>{(item, i) => renderItem(item, i(), c.items.length)}</For>
          </div>
        );
      }}</For>
    </div>
  );
}
