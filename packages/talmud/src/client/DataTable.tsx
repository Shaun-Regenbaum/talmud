/**
 * Usage-page table + chart kit. One ordered, sortable table component behind
 * every tabular view (latency, cache, cost, errors, lint), plus small inline
 * cells (a meter bar, a heat chip) and a ranked horizontal-bar chart. The point
 * is consistency: click a header to sort, numerics right-align and use tabular
 * figures, and long lists collapse behind a "show all". Styling is inline (the
 * usage page's convention) but funneled through these primitives.
 */

import { createMemo, createSignal, For, type JSX, Show } from 'solid-js';
import { t } from './i18n';

export type Align = 'left' | 'right' | 'center';

export interface Column<T> {
  key: string;
  header: string;
  align?: Align;
  /** Provide to make the column sortable; returns the sort key for a row. */
  sortValue?: (row: T) => number | string;
  /** Cell content. */
  cell: (row: T) => JSX.Element | string;
  width?: string;
  mono?: boolean;
  /** Muted (grey) cell text — for secondary columns. */
  muted?: boolean;
}

const HEAD: JSX.CSSProperties = {
  padding: '0.4rem 0.5rem',
  'font-weight': 600,
  'font-size': '0.72rem',
  'text-transform': 'uppercase',
  'letter-spacing': '0.03em',
  color: '#8a857c',
  'border-bottom': '1px solid var(--line, #e5e3dc)',
  'white-space': 'nowrap',
  'user-select': 'none',
};

export function DataTable<T>(props: {
  columns: Column<T>[];
  rows: T[];
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  /** Collapse to N rows behind a "show all N" toggle. */
  maxRows?: number;
  emptyText?: string;
  onRowClick?: (row: T) => void;
}): JSX.Element {
  const [sort, setSort] = createSignal<{ key: string; dir: 'asc' | 'desc' } | null>(
    props.initialSort ?? null,
  );
  const [expanded, setExpanded] = createSignal(false);

  const sorted = createMemo(() => {
    const s = sort();
    const rows = props.rows.slice();
    if (!s) return rows;
    const col = props.columns.find((c) => c.key === s.key);
    if (!col?.sortValue) return rows;
    const val = col.sortValue;
    rows.sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv));
      return s.dir === 'asc' ? cmp : -cmp;
    });
    return rows;
  });
  const visible = () => {
    const rows = sorted();
    return props.maxRows && !expanded() ? rows.slice(0, props.maxRows) : rows;
  };
  const hiddenCount = () =>
    Math.max(0, sorted().length - (props.maxRows ?? Number.POSITIVE_INFINITY));

  const toggleSort = (col: Column<T>) => {
    if (!col.sortValue) return;
    setSort((s) =>
      s?.key !== col.key
        ? { key: col.key, dir: 'desc' }
        : { key: col.key, dir: s.dir === 'desc' ? 'asc' : 'desc' },
    );
  };

  return (
    <>
      <table style={{ width: '100%', 'border-collapse': 'collapse', 'font-size': '0.83rem' }}>
        <thead>
          <tr>
            <For each={props.columns}>
              {(col) => (
                <th
                  style={{
                    ...HEAD,
                    'text-align': col.align ?? 'left',
                    width: col.width,
                    cursor: col.sortValue ? 'pointer' : 'default',
                  }}
                  onClick={() => toggleSort(col)}
                >
                  {col.header}
                  <Show when={col.sortValue}>
                    <span style={{ color: sort()?.key === col.key ? 'var(--accent)' : '#ccc' }}>
                      {sort()?.key === col.key ? (sort()?.dir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}
                    </span>
                  </Show>
                </th>
              )}
            </For>
          </tr>
        </thead>
        <tbody>
          <Show
            when={visible().length > 0}
            fallback={
              <tr>
                <td
                  colspan={props.columns.length}
                  style={{ padding: '0.6rem 0.5rem', color: '#aaa', 'font-size': '0.82rem' }}
                >
                  {props.emptyText ?? t('usage.table.empty')}
                </td>
              </tr>
            }
          >
            <For each={visible()}>
              {(row) => (
                <tr
                  style={{
                    'border-bottom': '1px solid #f2f0ea',
                    cursor: props.onRowClick ? 'pointer' : undefined,
                  }}
                  onClick={() => props.onRowClick?.(row)}
                >
                  <For each={props.columns}>
                    {(col) => (
                      <td
                        style={{
                          padding: '0.35rem 0.5rem',
                          'text-align': col.align ?? 'left',
                          'font-variant-numeric':
                            col.align === 'right' ? 'tabular-nums' : undefined,
                          'font-family': col.mono ? 'monospace' : undefined,
                          'font-size': col.mono ? '0.78rem' : undefined,
                          color: col.muted ? '#8a857c' : undefined,
                          'vertical-align': 'top',
                        }}
                      >
                        {col.cell(row)}
                      </td>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </Show>
        </tbody>
      </table>
      <Show when={props.maxRows && hiddenCount() > 0}>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          style={{
            'margin-top': '0.4rem',
            border: 'none',
            background: 'none',
            color: 'var(--accent)',
            cursor: 'pointer',
            'font-size': '0.78rem',
            padding: '0.2rem 0',
          }}
        >
          {expanded()
            ? t('usage.table.showLess')
            : t('usage.table.showMore', { count: String(hiddenCount()) })}
        </button>
      </Show>
    </>
  );
}

/** Inline meter: a track + accent fill sized by value/max, with trailing text.
 *  Used for latency, cost, and hit-rate cells so magnitudes read at a glance. */
export function Meter(props: {
  value: number;
  max: number;
  text: string;
  color?: string;
  width?: string;
}): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        'align-items': 'center',
        gap: '0.5rem',
        'justify-content': 'flex-end',
      }}
    >
      <div
        style={{
          flex: props.width ? undefined : 1,
          width: props.width,
          'min-width': '2.5rem',
          height: '7px',
          background: '#f0ede6',
          'border-radius': '3px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${props.max > 0 ? Math.min(100, (props.value / props.max) * 100) : 0}%`,
            height: '100%',
            background: props.color ?? 'var(--accent)',
          }}
        />
      </div>
      <span
        style={{
          'font-variant-numeric': 'tabular-nums',
          'min-width': '3.2rem',
          'text-align': 'right',
        }}
      >
        {props.text}
      </span>
    </div>
  );
}

/** Warm heat colour for a 0..1 rate (red → amber → green). For cache-hit chips. */
export function heatColor(rate: number): { fg: string; bg: string } {
  if (rate >= 0.8) return { fg: '#3f6f43', bg: '#e6efe3' };
  if (rate >= 0.5) return { fg: '#8a6d00', bg: '#f7efd6' };
  if (rate >= 0.2) return { fg: '#a05a1e', bg: '#f6e6d6' };
  return { fg: '#9a3b30', bg: '#f5e0dc' };
}

/** A cache-hit% chip coloured by the heat scale. */
export function HitChip(props: { rate: number }): JSX.Element {
  const c = () => heatColor(props.rate);
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.05rem 0.4rem',
        'border-radius': '999px',
        'font-size': '0.74rem',
        'font-variant-numeric': 'tabular-nums',
        color: c().fg,
        background: c().bg,
      }}
    >
      {Math.round(props.rate * 100)}%
    </span>
  );
}

export interface RankedItem {
  label: string;
  value: number;
  sub?: string;
  color?: string;
  /** Optional inner tick (e.g. p50 within a p95 bar), same units as value. */
  tick?: number;
}

/** A ranked horizontal-bar chart: one row per item, bar width ∝ value, an
 *  optional inner tick, and a right-aligned formatted value + sub. Used for
 *  "slowest producers", lint-failure counts, error-reason tallies, etc. */
export function RankedBars(props: {
  items: RankedItem[];
  fmt: (n: number) => string;
  top?: number;
  labelWidth?: string;
}): JSX.Element {
  const items = createMemo(() => {
    const sorted = props.items.slice().sort((a, b) => b.value - a.value);
    return props.top ? sorted.slice(0, props.top) : sorted;
  });
  const max = () => Math.max(1, ...items().map((i) => i.value));
  const lw = () => props.labelWidth ?? '11rem';
  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.28rem' }}>
      <For each={items()}>
        {(it) => (
          <div
            style={{
              display: 'flex',
              'align-items': 'center',
              gap: '0.55rem',
              'font-size': '0.8rem',
            }}
          >
            <span
              style={{
                width: lw(),
                'flex-shrink': 0,
                'font-family': 'monospace',
                'font-size': '0.75rem',
                overflow: 'hidden',
                'text-overflow': 'ellipsis',
                'white-space': 'nowrap',
              }}
              title={it.label}
            >
              {it.label}
            </span>
            <div
              style={{
                flex: 1,
                height: '14px',
                background: '#f1efe9',
                'border-radius': '3px',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${(it.value / max()) * 100}%`,
                  background: it.color ?? 'var(--accent)',
                  'border-radius': '3px',
                }}
              />
              <Show when={it.tick != null}>
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `${Math.min(100, ((it.tick ?? 0) / max()) * 100)}%`,
                    width: '2px',
                    background: 'rgba(0,0,0,0.32)',
                  }}
                />
              </Show>
            </div>
            <span
              style={{
                width: '4rem',
                'text-align': 'right',
                'font-variant-numeric': 'tabular-nums',
                color: '#555',
                'flex-shrink': 0,
              }}
            >
              {props.fmt(it.value)}
            </span>
            <Show when={it.sub}>
              <span
                style={{
                  width: '6rem',
                  'text-align': 'right',
                  color: '#aaa',
                  'font-size': '0.72rem',
                  'flex-shrink': 0,
                }}
              >
                {it.sub}
              </span>
            </Show>
          </div>
        )}
      </For>
    </div>
  );
}
