/**
 * CodificationMap — the halacha lineage (Gemara → Rambam → Tur → Shulchan Aruch
 * → Rema) rendered in the Voices visual grammar, with codifier disagreements as
 * relation edges and Sephardi/Ashkenazi practice folded onto the nodes. This is
 * the "merged lineage + Voices" design (mockup: Sandbox/halacha/v6.html).
 *
 * Tech note: like ArgumentVoiceMap the *look* is white rounded cards + a spine
 * with side-colour dots + colour/dash relation edges + a legend — but the cards
 * here carry richer content (ref + ruling + a practice chip), so they render as
 * HTML and a single SVG layer draws the spine + edges over them (positions
 * measured from the laid-out cards). The geometry/colour mapping lives in
 * ./flow/codeMapLayout (unit-tested); this file is the Solid shell.
 *
 * Presentational only — props in, no data fetching. The collection/enrichment
 * PRs feed it real grounded codifier data.
 */

import { For, Show, createSignal, onMount, onCleanup, type JSX } from 'solid-js';
import {
  SIDE_COLOR, relationStyle, gutterEdgePath,
  type NodeSide, type RelationKind, type CodeMapNode, type CodeMapEdge,
} from './flow/codeMapLayout';

export type { CodeMapNode, CodeMapEdge } from './flow/codeMapLayout';

interface Props {
  nodes: CodeMapNode[];
  edges?: CodeMapEdge[];
  /** Which relations appear in the legend (defaults to the ones in `edges`,
   *  plus "transmits" for the spine). */
  legend?: RelationKind[];
}

const PRACTICE_STYLE: Record<'sef' | 'ashk' | 'both', JSX.CSSProperties> = {
  sef: { background: '#eaf0fb', color: '#1a3e7e' },
  ashk: { background: '#fbeaea', color: '#7e1a1a' },
  both: { background: '#eef6ef', color: '#2f6b43' },
};

const LEGEND_LABEL: Record<RelationKind, string> = {
  transmits: 'transmits', agrees: 'agrees', disagrees: 'disagrees', cites: 'cites',
};

const SPINE_X = 18;       // left-gutter x of the spine + dots
// Wide right gutter so the relation connectors have room to bow out clearly
// (narrows the cards, which is the intent — the lines need the space).
const GUTTER = 46;        // right gutter width for relation lanes
const LANE_STEP = 9;      // x between parallel relation lanes

export default function CodificationMap(props: Props): JSX.Element {
  let mapEl: HTMLDivElement | undefined;
  const [svg, setSvg] = createSignal('');

  const draw = () => {
    const root = mapEl;
    if (!root) return;
    const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-node]'));
    if (cards.length === 0) { setSvg(''); return; }
    const box = root.getBoundingClientRect();
    const W = root.clientWidth;
    const center = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return { right: r.right - box.left, cy: (r.top + r.bottom) / 2 - box.top };
    };
    const pos = new Map<string, { right: number; cy: number }>();
    for (const c of cards) pos.set(c.dataset.node!, center(c));

    const first = center(cards[0]);
    const last = center(cards[cards.length - 1]);
    let s = `<line x1="${SPINE_X}" y1="${first.cy}" x2="${SPINE_X}" y2="${last.cy}" stroke="#cfc9bb" stroke-width="1.5" stroke-linecap="round"/>`;
    for (const c of cards) {
      const p = center(c);
      const color = SIDE_COLOR[(c.dataset.side as NodeSide) ?? 'neutral'];
      s += `<circle cx="${SPINE_X}" cy="${p.cy}" r="5" fill="${color}" stroke="#fdfcf9" stroke-width="2"/>`;
    }
    (props.edges ?? []).forEach((e, i) => {
      const a = pos.get(e.from), b = pos.get(e.to);
      if (!a || !b) return;
      const { color, dash } = relationStyle(e.kind);
      const laneX = W - 11 - i * LANE_STEP;
      const rightX = Math.max(a.right, b.right);
      const d = gutterEdgePath(a.cy, b.cy, rightX, laneX);
      s += `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-opacity="0.85"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
    });
    setSvg(s);
  };

  onMount(() => {
    draw();
    // Redraw on resize so the edges track reflowed cards. Guarded — ResizeObserver
    // is absent under jsdom (tests) and irrelevant there (no real layout).
    if (typeof ResizeObserver !== 'undefined' && mapEl) {
      const ro = new ResizeObserver(() => draw());
      ro.observe(mapEl);
      onCleanup(() => ro.disconnect());
    }
  });

  const legendKinds = (): RelationKind[] => {
    if (props.legend) return props.legend;
    const used = new Set<RelationKind>(['transmits']);
    for (const e of props.edges ?? []) used.add(e.kind);
    return Array.from(used);
  };

  return (
    <div style={{ border: '1px solid #ece9df', 'border-radius': '8px', background: '#fdfcf9', padding: '8px 6px' }}>
      <div
        ref={mapEl}
        style={{ position: 'relative', padding: `6px ${GUTTER}px 6px 38px` }}
      >
        <svg
          innerHTML={svg()}
          style={{ position: 'absolute', inset: 0, 'pointer-events': 'none', 'z-index': 0, overflow: 'visible' }}
        />
        <For each={props.nodes}>{(n) => (
          <div
            data-node={n.id}
            data-side={n.side}
            style={{
              position: 'relative', 'z-index': 1, background: '#fff',
              border: '1px solid #e4e0d4', 'border-radius': '10px',
              padding: '8px 11px 9px 13px', 'margin-bottom': '15px',
              'box-shadow': '0 1px 1.4px rgba(58,51,32,0.12)',
            }}
          >
            <div style={{ 'font-family': 'system-ui, -apple-system, sans-serif', 'font-size': '11.5px', 'font-weight': 600, color: '#2a2723', 'line-height': 1.3 }}>
              {n.label}
              <Show when={n.ref}><span style={{ 'font-weight': 400, color: '#1e5fae' }}>{` · ${n.ref}`}</span></Show>
              <Show when={n.era}><span style={{ 'font-weight': 400, color: '#a39e92', 'font-size': '10px', 'text-transform': 'uppercase', 'letter-spacing': '0.04em', 'margin-left': '4px' }}>{n.era}</span></Show>
            </div>
            <Show when={n.ruling}>
              <div style={{ 'font-size': '12px', color: '#585348', 'line-height': 1.45, 'margin-top': '2px' }}>{n.ruling}</div>
            </Show>
            <Show when={n.practice}>
              {(p) => (
                <span style={{
                  display: 'inline-block', 'font-family': 'system-ui, -apple-system, sans-serif',
                  'font-size': '10px', 'border-radius': '6px', padding: '2px 7px',
                  'margin-top': '6px', 'line-height': 1.35, ...PRACTICE_STYLE[p().tone],
                }}>
                  <Show when={p().he}><span lang="he" style={{ 'font-weight': 700 }}>{p().he}</span>{' · '}</Show>
                  {p().en}
                </span>
              )}
            </Show>
          </div>
        )}</For>
      </div>
      <div style={{ display: 'flex', gap: '13px', margin: '10px 2px 2px', 'font-family': 'system-ui, -apple-system, sans-serif', 'font-size': '10px', color: '#999', 'align-items': 'center', 'flex-wrap': 'wrap' }}>
        <For each={legendKinds()}>{(k) => {
          const st = relationStyle(k);
          return (
            <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '5px' }}>
              <span style={{ display: 'inline-block', width: '15px', height: 0, 'border-top': `${st.dash ? '1.6px dashed' : '1.6px solid'} ${st.color}` }} />
              {LEGEND_LABEL[k]}
            </span>
          );
        }}</For>
      </div>
    </div>
  );
}
