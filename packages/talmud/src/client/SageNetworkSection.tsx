/**
 * The sage-page network section: an ego-centric ARC DIAGRAM on a
 * generation-ordered (chronological) axis, plus the partner rows with daf
 * receipts. Data: GET /api/rabbi-network/:slug (the learned Shas-wide voice
 * graph).
 *
 * Reading the diagram: the sage sits on the axis in their own generation;
 * every partner is a dot in ITS generation (era colors — the app's rabbi
 * spectrum). Arcs ABOVE the axis are what this sage does to others
 * (opposes / cites / …); arcs BELOW are what others do to them — direction
 * needs no arrowheads. Thickness = distinct section sightings. Relation kinds
 * wear the app-wide flow palette; because two of those tokens are close grays,
 * identity is never color-alone here: legend, native tooltips, and the text
 * chips in the rows below all restate the kind.
 */
import { createMemo, createResource, createSignal, For, type JSX, Show } from 'solid-js';
import { KIND_COLOR, KIND_DASH, stmtRelKind } from './ArgumentFlowGraph';
import { type EgoRow, type EgoWire, groupEgoEdges, splitDafLabel } from './egoNetwork';
import {
  colorForGeneration,
  GENERATION_BY_ID,
  type GenerationInfo,
  generationLabelHe,
} from './generations';
import { lang, t } from './i18n';
import { arcPath, barSegments, layoutArcs } from './sageArcLayout';

const SUPPORTS_COLOR = '#0891b2';
const AXIS_INK = '#c9c2b2';
const REL_KINDS = ['opposes', 'responds-to', 'resolves', 'cites', 'supports'] as const;

function relColor(kind: string): string {
  return kind === 'supports' ? SUPPORTS_COLOR : KIND_COLOR[stmtRelKind(kind)];
}
function relDash(kind: string): string | undefined {
  return kind === 'supports' ? undefined : KIND_DASH[stmtRelKind(kind)];
}

function genLabel(generation: string | null): string {
  if (!generation) return '?';
  const info = (GENERATION_BY_ID as Record<string, GenerationInfo | undefined>)[generation];
  if (!info) return generation;
  return lang() === 'he' ? generationLabelHe(info) : info.label;
}

function dafHref(label: string): string | null {
  const d = splitDafLabel(label);
  if (!d) return null;
  return `?tractate=${encodeURIComponent(d.tractate)}&page=${encodeURIComponent(d.page)}#daf`;
}

const GENERATION_BAR_INSET = 10;
const TOP_PAD = 10;
const LABEL_H = 15;
const BAR_H = 22;
const BAR_GAP = 2; // surface gap between stacked segments
const BOTTOM_PAD = 8;

export function SageNetworkSection(props: { slug: string }): JSX.Element {
  const [ego] = createResource(
    () => props.slug,
    async (s) => {
      const r = await fetch(`/api/rabbi-network/${encodeURIComponent(s)}`);
      if (r.status === 404) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        return { miss: body.error?.includes('not compiled') ? 'building' : 'absent' } as const;
      }
      if (!r.ok) return { miss: 'error' } as const;
      return { wire: (await r.json()) as EgoWire } as const;
    },
  );

  const rows = createMemo<EgoRow[]>(() => {
    const e = ego();
    return e && 'wire' in e && e.wire ? groupEgoEdges(e.wire.edges) : [];
  });

  const [hover, setHover] = createSignal<string | null>(null);
  const [openRow, setOpenRow] = createSignal<string | null>(null);
  const dim = (slug: string) => hover() !== null && hover() !== slug;

  return (
    <section class="sage-network" style={{ 'margin-top': '0.9rem' }}>
      <h3 style={{ margin: '0 0 0.2rem', 'font-size': '0.95rem' }}>{t('network.page.title')}</h3>
      <Show when={ego()} keyed>
        {(e) => (
          <Show
            when={'wire' in e ? e.wire : null}
            keyed
            fallback={
              <p style={{ color: '#8a6d3b', 'font-size': '0.85rem', margin: 0 }}>
                {'miss' in e && e.miss === 'building'
                  ? t('network.page.building')
                  : t('network.page.notInGraph')}
              </p>
            }
          >
            {(wire) => {
              const layout = createMemo(() => layoutArcs(wire.node.generation, rows()));
              const axisY = () => TOP_PAD + Math.max(layout().maxAbove, 26) + 12;
              const barsY = () => axisY() + layout().maxBelow + 14 + LABEL_H;
              const height = () => barsY() + BAR_H + BOTTOM_PAD;
              const maxTickTotal = () => layout().ticks.reduce((m, tk) => Math.max(m, tk.total), 1);
              return (
                <div>
                  <p style={{ margin: '0 0 0.5rem', color: '#777', 'font-size': '0.8rem' }}>
                    {t('network.page.meta', {
                      sections: wire.node.sections,
                      partners: rows().length,
                    })}
                    {' · '}
                    {t('network.page.coverageShort', { dapim: wire.dapim })}
                    <Show when={(wire.node.curatedEdges ?? 0) === 0 && rows().length > 0}>
                      {' · '}
                      <span style={{ color: '#0a7a4b', 'font-weight': 600 }}>
                        {t('network.page.newlyConnected')}
                      </span>
                    </Show>
                  </p>

                  <Show
                    when={rows().length > 0}
                    fallback={
                      <p style={{ color: '#666', 'font-size': '0.85rem' }}>
                        {t('network.page.noEdges')}
                      </p>
                    }
                  >
                    {/* the arc diagram */}
                    <div style={{ 'overflow-x': 'auto' }}>
                      <svg
                        viewBox={`0 0 ${layout().width} ${height()}`}
                        width={layout().width}
                        height={height()}
                        style={{ display: 'block', 'max-width': 'none' }}
                        role="img"
                        aria-label={t('network.arc.aria', { name: wire.node.name })}
                      >
                        {/* direction hints */}
                        <text x={layout().center.x} y={TOP_PAD} font-size="9" fill="#a89e8a">
                          {t('network.arc.outgoing', { name: wire.node.name })}
                        </text>
                        <text
                          x={layout().center.x}
                          y={axisY() + layout().maxBelow + 11}
                          font-size="9"
                          fill="#a89e8a"
                        >
                          {t('network.arc.incoming', { name: wire.node.name })}
                        </text>

                        {/* arcs */}
                        <For each={layout().arcs}>
                          {(a) => (
                            <path
                              d={arcPath(a, axisY())}
                              fill="none"
                              stroke={relColor(a.chip.kind)}
                              stroke-width={a.stroke}
                              stroke-dasharray={relDash(a.chip.kind)}
                              stroke-linecap="round"
                              opacity={dim(a.slug) ? 0.12 : 0.6}
                              onMouseEnter={() => setHover(a.slug)}
                              onMouseLeave={() => setHover(null)}
                            >
                              <title>{`${wire.node.name} ${a.chip.direction === 'out' ? '→' : '←'} ${t(`dafvoices.rel.${a.chip.kind}`)} ×${a.chip.weight}`}</title>
                            </path>
                          )}
                        </For>

                        {/* axis */}
                        <line
                          x1={0}
                          x2={layout().width}
                          y1={axisY()}
                          y2={axisY()}
                          stroke={AXIS_INK}
                          stroke-width="1"
                        />
                        {/* generation group boundaries + labels + stacked bars */}
                        <For each={layout().ticks}>
                          {(tk) => {
                            const barW = () => Math.max(0, tk.width - GENERATION_BAR_INSET * 2);
                            const scale = () => (tk.total > 0 ? tk.total / maxTickTotal() : 0);
                            return (
                              <g>
                                <line
                                  x1={tk.x}
                                  x2={tk.x}
                                  y1={axisY() - 4}
                                  y2={axisY() + 4}
                                  stroke={AXIS_INK}
                                  stroke-width="1"
                                />
                                <text
                                  x={tk.x + tk.width / 2}
                                  y={axisY() + layout().maxBelow + 14 + 10}
                                  font-size="9.5"
                                  fill="#8a8271"
                                  text-anchor="middle"
                                >
                                  {genLabel(tk.gen)}
                                </text>
                                {/* per-generation stacked breakdown (kind mix) */}
                                <Show when={tk.total > 0}>
                                  {(() => {
                                    const totalW = barW() * scale();
                                    const segs = barSegments(tk.byKind, tk.total, totalW, BAR_GAP);
                                    const x0 = tk.x + tk.width / 2 - totalW / 2;
                                    return (
                                      <For each={segs}>
                                        {(seg) => (
                                          <rect
                                            x={x0 + seg.x}
                                            y={barsY()}
                                            width={seg.w}
                                            height={7}
                                            rx={2}
                                            fill={relColor(seg.kind)}
                                          >
                                            <title>{`${genLabel(tk.gen)} — ${t(`dafvoices.rel.${seg.kind}`)} ×${seg.weight}`}</title>
                                          </rect>
                                        )}
                                      </For>
                                    );
                                  })()}
                                  <text
                                    x={tk.x + tk.width / 2}
                                    y={barsY() + 17}
                                    font-size="8.5"
                                    fill="#a89e8a"
                                    text-anchor="middle"
                                  >
                                    ×{tk.total}
                                  </text>
                                </Show>
                              </g>
                            );
                          }}
                        </For>

                        {/* center sage */}
                        <circle
                          cx={layout().center.x}
                          cy={axisY()}
                          r={layout().center.r}
                          fill={colorForGeneration(wire.node.generation)}
                          stroke="#fff"
                          stroke-width="2"
                        />
                        <text
                          x={layout().center.x}
                          y={axisY() - layout().center.r - 4}
                          font-size="10"
                          font-weight="700"
                          fill="#333"
                          text-anchor="middle"
                        >
                          {wire.node.name}
                        </text>

                        {/* partner dots (links to their sage page) */}
                        <For each={layout().dots}>
                          {(d) => (
                            <a href={`#sages/${d.row.other.slug}`} aria-label={d.row.other.name}>
                              <circle
                                cx={d.x}
                                cy={axisY()}
                                r={d.r}
                                fill={colorForGeneration(d.row.other.generation)}
                                stroke="#fff"
                                stroke-width="2"
                                opacity={dim(d.row.other.slug) ? 0.25 : 1}
                                style={{ cursor: 'pointer' }}
                                onMouseEnter={() => setHover(d.row.other.slug)}
                                onMouseLeave={() => setHover(null)}
                              >
                                <title>{`${d.row.other.name} — ${genLabel(d.row.other.generation)} — ×${d.row.totalWeight}`}</title>
                              </circle>
                            </a>
                          )}
                        </For>
                      </svg>
                    </div>
                    <Show when={layout().overflow > 0}>
                      <p style={{ margin: '0.2rem 0 0', color: '#a89e8a', 'font-size': '0.75rem' }}>
                        {t('network.arc.overflow', { n: layout().overflow })}
                      </p>
                    </Show>

                    {/* legend: kinds (color+dash swatches) — identity never color-alone */}
                    <div
                      style={{
                        display: 'flex',
                        'flex-wrap': 'wrap',
                        gap: '0.8rem',
                        margin: '0.5rem 0 0.8rem',
                        'font-size': '0.75rem',
                        color: '#666',
                      }}
                    >
                      <For each={[...REL_KINDS]}>
                        {(k) => (
                          <span
                            style={{
                              display: 'inline-flex',
                              'align-items': 'center',
                              gap: '0.3rem',
                            }}
                          >
                            <svg width="22" height="8" aria-hidden="true">
                              <line
                                x1="1"
                                y1="4"
                                x2="21"
                                y2="4"
                                stroke={relColor(k)}
                                stroke-width="2.5"
                                stroke-dasharray={relDash(k)}
                                stroke-linecap="round"
                              />
                            </svg>
                            {t(`dafvoices.rel.${k}`)}
                          </span>
                        )}
                      </For>
                    </div>

                    {/* partner rows: the textual ground truth with daf receipts */}
                    <ol style={{ 'list-style': 'none', margin: 0, padding: 0 }}>
                      <For each={rows()}>
                        {(row) => (
                          <li
                            onMouseEnter={() => setHover(row.other.slug)}
                            onMouseLeave={() => setHover(null)}
                            style={{
                              border: '1px solid #e4ded1',
                              'border-inline-start': `6px solid ${colorForGeneration(row.other.generation)}`,
                              'border-radius': '10px',
                              padding: '0.45rem 0.7rem',
                              'margin-bottom': '0.4rem',
                              background: hover() === row.other.slug ? '#fbf7ec' : '#fff',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                'flex-wrap': 'wrap',
                                gap: '0.4rem',
                                'align-items': 'center',
                              }}
                            >
                              <a
                                href={`#sages/${row.other.slug}`}
                                style={{
                                  'font-weight': 600,
                                  color: '#222',
                                  'text-decoration': 'none',
                                }}
                              >
                                {row.other.name}
                              </a>
                              <span style={{ color: '#999', 'font-size': '0.75rem' }}>
                                {genLabel(row.other.generation)}
                              </span>
                              <For each={row.chips}>
                                {(c) => (
                                  <span
                                    style={{
                                      border: `1px solid ${relColor(c.kind)}`,
                                      color: relColor(c.kind),
                                      'border-radius': '999px',
                                      padding: '0.02rem 0.45rem',
                                      'font-size': '0.72rem',
                                      'white-space': 'nowrap',
                                    }}
                                    title={t('network.page.chipTitle', {
                                      strict: c.strict,
                                      weight: c.weight,
                                    })}
                                  >
                                    {c.direction === 'out' ? '→ ' : '← '}
                                    {t(`dafvoices.rel.${c.kind}`)}
                                    {c.weight > 1 ? ` ×${c.weight}` : ''}
                                  </span>
                                )}
                              </For>
                              <button
                                type="button"
                                aria-expanded={openRow() === row.other.slug}
                                aria-controls={`sage-net-dafs-${row.other.slug}`}
                                onClick={() =>
                                  setOpenRow((o) => (o === row.other.slug ? null : row.other.slug))
                                }
                                style={{
                                  'margin-inline-start': 'auto',
                                  border: 'none',
                                  background: 'transparent',
                                  color: '#8a6d3b',
                                  cursor: 'pointer',
                                  'font-size': '0.75rem',
                                }}
                              >
                                {openRow() === row.other.slug
                                  ? t('network.page.hideDafs')
                                  : t('network.page.showDafs', { n: row.dafs.length })}
                              </button>
                            </div>
                            <Show when={openRow() === row.other.slug}>
                              <div
                                id={`sage-net-dafs-${row.other.slug}`}
                                style={{
                                  display: 'flex',
                                  'flex-wrap': 'wrap',
                                  gap: '0.3rem',
                                  'margin-top': '0.4rem',
                                }}
                              >
                                <For each={row.dafs}>
                                  {(d) => (
                                    <a
                                      href={dafHref(d) ?? '#'}
                                      style={{
                                        border: '1px solid #d8d2c4',
                                        'border-radius': '6px',
                                        padding: '0.02rem 0.4rem',
                                        'font-size': '0.72rem',
                                        color: '#555',
                                        'text-decoration': 'none',
                                        background: '#faf8f2',
                                      }}
                                    >
                                      {d}
                                    </a>
                                  )}
                                </For>
                              </div>
                            </Show>
                          </li>
                        )}
                      </For>
                    </ol>
                  </Show>
                </div>
              );
            }}
          </Show>
        )}
      </Show>
    </section>
  );
}
