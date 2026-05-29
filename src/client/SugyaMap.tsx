/**
 * Cross-page sugya map (Track C #2). Calls GET /api/studio/sugya/:t/:p — which
 * walks the continuing bridges to a window of dapim and assembles cross-page
 * sugya units — and draws them: one row per daf, the daf's sections as cells,
 * and the sugya CONTAINING the current daf highlighted across whatever pages it
 * spans. The headline is "this discussion runs from 125b to 126a", which no
 * per-daf view can show. Dev-mode only (mounted in DevModeShelf) while the
 * cross-daf flow is still warming.
 */

import { createResource, For, Show, type JSX } from 'solid-js';

interface DafRow { tractate: string; page: string; segs: number[] }
interface SugyaUnit { dapim: DafRow[]; crossesDaf: boolean }
interface SugyaResponse { tractate: string; page: string; window: string[]; count: number; sugyot: SugyaUnit[]; current: SugyaUnit | null }

export default function SugyaMap(props: {
  tractate: string;
  page: string;
  /** Highlight a segment span on the current daf (null clears). */
  onHighlight?: (range: { start: number; end: number } | null) => void;
}): JSX.Element {
  const [data] = createResource(
    () => `${props.tractate}|${props.page}`,
    async (): Promise<SugyaResponse | null> => {
      const r = await fetch(`/api/studio/sugya/${encodeURIComponent(props.tractate)}/${encodeURIComponent(props.page)}`);
      if (!r.ok) return null;
      return (await r.json()) as SugyaResponse;
    },
  );

  const inCurrent = (page: string, seg: number) =>
    (data()?.current?.dapim ?? []).some((d) => d.page === page && d.segs.includes(seg));

  return (
    <Show when={data() && data()!.window.length > 0}>
      <div style={{ border: '1px solid #eee', 'border-radius': '4px', background: '#fff', padding: '0.4rem 0.55rem', 'font-size': '0.78rem' }}>
        <div style={{
          'font-size': '0.65rem', 'text-transform': 'uppercase', 'letter-spacing': '0.06em', color: '#888',
          'margin-bottom': '0.35rem', display: 'flex', 'justify-content': 'space-between',
        }}>
          <span>Sugya map</span>
          <Show when={data()!.current?.crossesDaf}>
            <span style={{ color: '#9333ea' }}>spans {data()!.current!.dapim.map((d) => d.page).join(' → ')}</span>
          </Show>
        </div>

        {/* One row per daf in the window; each section a cell. The cells of the
            sugya containing the current daf are highlighted across the pages. */}
        <For each={data()!.window}>{(pg) => {
          const row = () => data()!.sugyot.flatMap((s) => s.dapim).filter((d) => d.page === pg);
          const segs = () => [...new Set(row().flatMap((d) => d.segs))].sort((a, b) => a - b);
          return (
            <div style={{ display: 'flex', 'align-items': 'center', gap: '0.4rem', padding: '0.12rem 0' }}>
              <span style={{
                'flex-shrink': 0, width: '2.6rem', 'font-size': '0.7rem', 'font-weight': pg === props.page ? 700 : 400,
                color: pg === props.page ? '#111' : '#999',
              }}>{pg}</span>
              <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '0.2rem' }}>
                <For each={segs()}>{(seg) => {
                  const active = () => inCurrent(pg, seg);
                  return (
                    <span
                      onClick={() => { if (pg === props.page) props.onHighlight?.({ start: seg, end: seg }); }}
                      title={pg === props.page ? `seg ${seg} — highlight` : `${pg} seg ${seg}`}
                      style={{
                        'font-size': '0.62rem', 'font-variant-numeric': 'tabular-nums',
                        padding: '0 0.3rem', 'border-radius': '3px',
                        cursor: pg === props.page ? 'pointer' : 'default',
                        background: active() ? '#f3e8ff' : '#f4f4f5',
                        color: active() ? '#7c3aed' : '#999',
                        border: active() ? '1px solid #c4b5fd' : '1px solid transparent',
                      }}
                    >{seg}</span>
                  );
                }}</For>
              </div>
            </div>
          );
        }}</For>

        <div style={{ 'margin-top': '0.3rem', 'font-size': '0.68rem', color: '#aaa' }}>
          {data()!.count} sugy{data()!.count === 1 ? 'a' : 'ot'} in window · purple = the sugya here
        </div>
      </div>
    </Show>
  );
}
