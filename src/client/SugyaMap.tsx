/**
 * Cross-page sugya map (Track C #2). A sugya is one continuous discussion, and
 * it often does not begin or end on the daf you're reading. A daf holds SEVERAL
 * sugyot: the first usually carries over from the previous daf, the last often
 * spills onto the next, and several sit wholly in between. This panel lists
 * EVERY discussion on the daf in order, flags the ones that cross a page break
 * (showing the neighbouring-daf sections as context — the part you'd otherwise
 * miss), and lets you click any section on this daf to highlight its text.
 *
 * Data: GET /api/studio/sugya/:t/:p returns `sugyot` (every sugya in the window
 * around this daf, each with titled section ranges grouped by daf). We render
 * the ones that touch this daf. Reader-facing: foot of the Overview sidebar.
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

  // Smallest section-start on THIS daf — used to order the discussions top-down.
  const firstSegHere = (s: SugyaUnit): number => {
    const here = s.dapim.find((d) => d.page === props.page);
    return here && here.sections.length ? Math.min(...here.sections.map((x) => x.start)) : Number.MAX_SAFE_INTEGER;
  };

  // Every sugya that touches this daf, in reading order.
  const onThisDaf = (): SugyaUnit[] =>
    (data()?.sugyot ?? [])
      .filter((s) => s.dapim.some((d) => d.page === props.page))
      .sort((a, b) => firstSegHere(a) - firstSegHere(b));

  const crossingCount = () => onThisDaf().filter((s) => s.crossesDaf).length;

  return (
    <Show when={onThisDaf().length > 0}>
      <div style={{ 'margin-top': '0.6rem', border: '1px solid #ede9fe', 'border-radius': '6px', background: '#faf8ff', padding: '0.55rem 0.65rem' }}>
        <div style={{
          'font-size': '0.62rem', 'text-transform': 'uppercase', 'letter-spacing': '0.07em',
          color: '#9333ea', 'font-weight': 700, 'margin-bottom': '0.15rem',
        }}>Sugya map — discussions on this daf</div>
        <div style={{ 'font-size': '0.72rem', color: '#888', 'margin-bottom': '0.5rem' }}>
          {onThisDaf().length} discussion{onThisDaf().length === 1 ? '' : 's'}
          <Show when={crossingCount() > 0}>{`, ${crossingCount()} cross${crossingCount() === 1 ? 'es' : ''} a page break`}</Show>
        </div>

        <For each={onThisDaf()}>{(s) => (
          <div style={{
            'border-left': `3px solid ${s.crossesDaf ? '#a78bfa' : '#e5e5e5'}`,
            'padding-left': '0.5rem', 'margin-bottom': '0.55rem',
          }}>
            {/* Cross-boundary flag: which pages this one discussion spans. */}
            <Show when={s.crossesDaf}>
              <div style={{ 'font-size': '0.68rem', 'font-weight': 700, color: '#7c3aed', 'margin-bottom': '0.18rem' }}>
                spans <For each={s.dapim}>{(d, i) => (
                  <>{i() > 0 ? ' → ' : ''}<span style={{ 'text-decoration': d.page === props.page ? 'underline' : 'none' }}>{d.page}</span></>
                )}</For>
              </div>
            </Show>

            {/* Sections grouped by daf; this daf clickable, neighbours muted. */}
            <For each={s.dapim}>{(d) => {
              const here = () => d.page === props.page;
              return (
                <div>
                  <Show when={!here()}>
                    <div style={{ 'font-size': '0.62rem', 'text-transform': 'uppercase', 'letter-spacing': '0.04em', color: '#a78b6a', margin: '0.1rem 0 0.05rem' }}>{d.page}</div>
                  </Show>
                  <For each={d.sections}>{(sec) => (
                    <div
                      onClick={() => { if (here()) props.onHighlight?.({ start: sec.start, end: sec.end }); }}
                      title={here() ? 'Click to highlight this section on the daf' : `On ${d.page}`}
                      style={{
                        'font-size': '0.78rem', 'line-height': 1.4, padding: '0.12rem 0.35rem',
                        'border-radius': '4px', 'margin-bottom': '0.1rem',
                        cursor: here() ? 'pointer' : 'default',
                        color: here() ? '#333' : '#aaa',
                        background: here() ? '#fff' : 'transparent',
                        border: here() ? '1px solid #eee' : '1px solid transparent',
                      }}
                    >{sec.title || `section at segment ${sec.start}`}</div>
                  )}</For>
                </div>
              );
            }}</For>
          </div>
        )}</For>
      </div>
    </Show>
  );
}
