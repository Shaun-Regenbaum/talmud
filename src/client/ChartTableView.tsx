/**
 * Shared renderer for a Hebrew comparison chart — a bordered RTL table whose
 * first column holds the (blue, bold) row labels, with footnotes below. Used by
 * the dafyomi context workbench (ContextSourcePanel) and the experimental
 * `chart` mark's sidebar card, so both render identically.
 */
import { For, Show, type JSX } from 'solid-js';

export interface ChartTableShape {
  headers: string[];
  rows: string[][];
  notes?: { marker: string; text: string }[];
}

/** Strip any residual HTML tags from scraped/generated cell text. */
function stripTags(s: string | undefined): string {
  return (s ?? '').replace(/<[^>]*>/g, '').trim();
}

export function ChartTableView(props: { table: ChartTableShape }): JSX.Element {
  const cell = { border: '1px solid #4b5563', padding: '0.25rem 0.45rem', 'text-align': 'center', 'vertical-align': 'middle' } as const;
  const hasHeaders = () => props.table.headers.some((h) => stripTags(h));
  return (
    <div style={{ 'overflow-x': 'auto', 'margin-top': '0.35rem' }}>
      <table dir="rtl" lang="he" style={{ 'border-collapse': 'collapse', 'font-family': '"Mekorot Vilna", serif', 'font-size': '0.85rem', width: '100%' }}>
        <Show when={hasHeaders()}>
          <thead>
            <tr>
              <For each={props.table.headers}>
                {(h) => <th style={{ ...cell, background: '#fef9c3', color: '#1e3a8a', 'font-weight': 700 }}>{stripTags(h)}</th>}
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
                    <td style={{ ...cell, color: ci() === 0 ? '#1e3a8a' : '#333', 'font-weight': ci() === 0 ? 700 : 400 }}>{stripTags(c)}</td>
                  )}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <Show when={props.table.notes?.length}>
        <div style={{ 'margin-top': '0.35rem', 'font-size': '0.72rem', color: '#666' }}>
          <For each={props.table.notes}>
            {(n) => (
              <div dir="rtl" lang="he" style={{ 'font-family': '"Mekorot Vilna", serif' }}>
                <span style={{ color: '#0369a1', 'font-family': 'monospace' }}>{n.marker}</span> {stripTags(n.text)}
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
