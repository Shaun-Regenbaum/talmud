/**
 * Shared renderer for a comparison chart — a clean bordered table in the app's
 * own palette (muted earth borders + a per-card accent for headers/row-labels),
 * NOT the source-site yellow/blue look. Cells are language-resolved strings; the
 * caller passes `dir`/`lang` so the same component renders Hebrew (RTL, Vilna
 * serif) or English (LTR, system sans). Used by the dafyomi context workbench
 * (ContextSourcePanel, HE) and the experimental `chart` mark's sidebar card
 * (follows the reader's language).
 */
import { For, type JSX, Show } from 'solid-js';

export interface ChartTableShape {
  headers: string[];
  rows: string[][];
  notes?: { marker: string; text: string }[];
}

/** Strip any residual HTML tags from scraped/generated cell text. */
function stripTags(s: string | undefined): string {
  return (s ?? '').replace(/<[^>]*>/g, '').trim();
}

export function ChartTableView(props: {
  table: ChartTableShape;
  /** Reading direction of the cell text. Default 'rtl' (Hebrew). */
  dir?: 'rtl' | 'ltr';
  /** BCP-47 lang for the cells. Default 'he'. */
  lang?: string;
  /** Card accent for headers + row labels. Default the chart cyan. */
  accent?: string;
}): JSX.Element {
  const dir = () => props.dir ?? 'rtl';
  const lang = () => props.lang ?? 'he';
  const accent = () => props.accent ?? '#0e7490';
  const font = () =>
    lang() === 'he' ? '"Mekorot Vilna", serif' : 'system-ui, -apple-system, sans-serif';
  const start = () => (dir() === 'rtl' ? 'right' : 'left');
  const cell = (): JSX.CSSProperties => ({
    border: '1px solid #e4e0d4',
    padding: '0.32rem 0.5rem',
    'vertical-align': 'top',
    'line-height': 1.4,
  });
  const hasHeaders = () => props.table.headers.some((h) => stripTags(h));
  return (
    <div style={{ 'overflow-x': 'auto', 'margin-top': '0.4rem' }}>
      <table
        dir={dir()}
        lang={lang()}
        style={{
          'border-collapse': 'collapse',
          'font-family': font(),
          'font-size': '0.82rem',
          width: '100%',
          border: '1px solid #e4e0d4',
        }}
      >
        <Show when={hasHeaders()}>
          <thead>
            <tr>
              <For each={props.table.headers}>
                {(h, ci) => (
                  <th
                    style={{
                      ...cell(),
                      background: '#faf9f6',
                      color: accent(),
                      'font-weight': 600,
                      'text-align': ci() === 0 ? start() : 'center',
                    }}
                  >
                    {stripTags(h)}
                  </th>
                )}
              </For>
            </tr>
          </thead>
        </Show>
        <tbody>
          <For each={props.table.rows}>
            {(row) => (
              <tr>
                <For each={row}>
                  {(c, ci) => (
                    <td
                      style={{
                        ...cell(),
                        color: ci() === 0 ? accent() : '#2a2723',
                        'font-weight': ci() === 0 ? 600 : 400,
                        'text-align': ci() === 0 ? start() : 'center',
                        background: ci() === 0 ? '#fcfbf8' : '#fff',
                      }}
                    >
                      {stripTags(c)}
                    </td>
                  )}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <Show when={props.table.notes?.length}>
        <div
          style={{
            'margin-top': '0.4rem',
            'font-size': '0.72rem',
            color: '#777',
            display: 'flex',
            'flex-direction': 'column',
            gap: '0.15rem',
          }}
        >
          <For each={props.table.notes}>
            {(n) => (
              <div dir={dir()} lang={lang()} style={{ 'font-family': font() }}>
                <span
                  style={{
                    color: accent(),
                    'font-family': 'ui-monospace, monospace',
                    'margin-inline-end': '0.25rem',
                  }}
                >
                  {n.marker}
                </span>
                {stripTags(n.text)}
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
