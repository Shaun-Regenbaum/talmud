/**
 * Cross-page sugya map (Track C #2). A sugya is one continuous discussion; it
 * often does not begin or end on the daf you're reading. This panel answers the
 * one question no per-daf view can: "does the discussion at the top of this daf
 * spill across the page break?" It calls GET /api/studio/sugya/:t/:p — which
 * walks the continuing cross-daf bridges to a window of neighbouring dapim and
 * assembles the sugya containing this daf — and lists that sugya's sections by
 * their titles, grouped by daf. Sections ON this daf are clickable (they paint
 * the matching text); sections on a neighbouring daf show what you'd be reading
 * if you kept going. Reader-facing: mounted at the foot of the Overview sidebar.
 */

import { createResource, For, Show, type JSX } from 'solid-js';

interface SectionCell { start: number; end: number; title: string }
interface DafRow { tractate: string; page: string; segs: number[]; sections: SectionCell[] }
interface SugyaUnit { dapim: DafRow[]; crossesDaf: boolean }
interface SugyaResponse {
  tractate: string; page: string; window: string[]; count: number;
  sugyot: SugyaUnit[]; current: SugyaUnit | null;
}

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

  const current = () => data()?.current ?? null;
  const dapim = () => current()?.dapim ?? [];

  return (
    <Show when={current() && dapim().length > 0}>
      <div style={{ 'margin-top': '0.6rem', border: '1px solid #ede9fe', 'border-radius': '6px', background: '#faf8ff', padding: '0.55rem 0.65rem' }}>
        <div style={{
          'font-size': '0.62rem', 'text-transform': 'uppercase', 'letter-spacing': '0.07em',
          color: '#9333ea', 'font-weight': 700, 'margin-bottom': '0.3rem',
        }}>Sugya — this discussion</div>

        {/* Plain-language headline: does it cross the page break, or not? */}
        <div style={{ 'font-size': '0.8rem', color: '#555', 'line-height': 1.45, 'margin-bottom': '0.45rem' }}>
          <Show
            when={current()!.crossesDaf}
            fallback={<>The discussion that opens this daf stays on <b>{props.page}</b>.</>}
          >
            The discussion that opens this daf runs across{' '}
            <b style={{ color: '#7c3aed' }}>{dapim().map((d) => d.page).join(' → ')}</b> — it doesn't begin and end here.
          </Show>
        </div>

        {/* The sugya's sections, grouped by daf. Sections on THIS daf are
            clickable (paint the text); neighbouring dapim are context. */}
        <For each={dapim()}>{(d) => {
          const here = () => d.page === props.page;
          return (
            <div style={{ 'margin-bottom': '0.35rem' }}>
              <div style={{
                'font-size': '0.66rem', 'font-weight': 700, 'text-transform': 'uppercase', 'letter-spacing': '0.04em',
                color: here() ? '#111' : '#a78b6a', 'margin-bottom': '0.15rem',
              }}>{d.page}{here() ? ' · this daf' : ''}</div>
              <For each={d.sections}>{(s) => (
                <div
                  onClick={() => { if (here()) props.onHighlight?.({ start: s.start, end: s.end }); }}
                  title={here() ? 'Click to highlight this section on the daf' : `On ${d.page}`}
                  style={{
                    'font-size': '0.78rem', 'line-height': 1.4, padding: '0.12rem 0.35rem',
                    'border-radius': '4px', 'margin-bottom': '0.1rem',
                    cursor: here() ? 'pointer' : 'default',
                    color: here() ? '#333' : '#999',
                    background: here() ? '#fff' : 'transparent',
                    border: here() ? '1px solid #eee' : '1px solid transparent',
                  }}
                >{s.title || `section at segment ${s.start}`}</div>
              )}</For>
            </div>
          );
        }}</For>
      </div>
    </Show>
  );
}
