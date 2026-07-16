/**
 * The sage-page network section — trunked generational arc diagram + partner
 * rows. Data: GET /api/rabbi-network/:slug (the learned Shas-wide voice graph).
 *
 * Levels of abstraction (see sageArcLayout.ts):
 *   L1  one era-colored trunk per generation per direction (out above the
 *       axis, in below); a cluster pill per generation sized by partner count;
 *       a stacked relation-kind bar under each generation.
 *   L2  click a generation (pill or label) to fan it open into named partner
 *       dots; the partner rows below filter to it. Small networks auto-expand.
 *   L3  a partner's rows expand into daf receipts; dots and names link to the
 *       partner's sage page.
 *
 * Relation kinds are encoded in the stacked bars + row chips (with a legend);
 * arcs carry era + direction + volume only — that separation is what keeps a
 * 60-partner sage readable.
 */
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  type JSX,
  Show,
} from 'solid-js';
import { KIND_COLOR, stmtRelKind } from './ArgumentFlowGraph';
import { type EgoRow, type EgoWire, groupEgoEdges, splitDafLabel } from './egoNetwork';
import {
  colorForGeneration,
  GENERATION_BY_ID,
  type GenerationInfo,
  generationLabelHe,
  legibleTextColor,
} from './generations';
import { lang, t } from './i18n';
import { ARC_BAND, arcPath, barSegments, layoutSageArcs, shortGenLabel } from './sageArcLayout';

const SUPPORTS_COLOR = '#0891b2';
const AXIS_INK = '#c9c2b2';
const REL_KINDS = ['opposes', 'responds-to', 'resolves', 'cites', 'supports'] as const;

function relColor(kind: string): string {
  return kind === 'supports' ? SUPPORTS_COLOR : KIND_COLOR[stmtRelKind(kind)];
}

function genLabel(generation: string | null): string {
  if (!generation) return '?';
  const info = (GENERATION_BY_ID as Record<string, GenerationInfo | undefined>)[generation];
  if (!info) return generation;
  return lang() === 'he' ? generationLabelHe(info) : info.label;
}

/** Truncate at a word boundary so labels never end mid-word. */
function truncateName(name: string, max = 24): string {
  if (name.length <= max) return name;
  const cut = name.lastIndexOf(' ', max - 1);
  return `${name.slice(0, cut > 8 ? cut : max - 1)}…`;
}

function dafHref(label: string): string | null {
  const d = splitDafLabel(label);
  if (!d) return null;
  return `?tractate=${encodeURIComponent(d.tractate)}&page=${encodeURIComponent(d.page)}#daf`;
}

const GENERATION_BAR_INSET = 8;
const TOP_PAD = 10;
const LABEL_H = 15;
const BAR_H = 22;
const BAR_GAP = 2;
const BOTTOM_PAD = 8;
const NAME_BAND = 86; // reserved for rotated partner-name labels when expanded

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

  const [hover, setHover] = createSignal<string | null>(null); // partner slug OR gen key `gen:<id>`
  const [openRow, setOpenRow] = createSignal<string | null>(null);
  const [expandedGen, setExpandedGen] = createSignal<string | null>(null);
  createEffect(() => {
    props.slug; // re-centering resets the drill-down + any open receipts
    setExpandedGen(null);
    setOpenRow(null);
  });
  const genKey = (gen: string | null) => `gen:${gen ?? '?'}`;
  const expandKey = (gen: string | null) => gen ?? '?';
  const dimGen = (gen: string | null) => hover() !== null && hover() !== genKey(gen);
  const dimSlug = (slug: string | null) => hover() !== null && hover() !== slug && !(slug === null);

  const toggleGen = (gen: string | null) =>
    setExpandedGen((g) => (g === expandKey(gen) ? null : expandKey(gen)));

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
              const layout = createMemo(() =>
                layoutSageArcs(wire.node.generation, rows(), expandedGen()),
              );
              const anyExpanded = () =>
                layout().groups.some((g) => g.expanded && g.dots.length > 0);
              // Constant vertical envelope (ARC_BAND) — a 3-partner sage's
              // diagram stands as tall as Rava's, so pages compare directly.
              const axisY = () => TOP_PAD + ARC_BAND + 12;
              const labelsY = () => axisY() + ARC_BAND + (anyExpanded() ? 22 + NAME_BAND : 28);
              const barsY = () => labelsY() + LABEL_H;
              const height = () => barsY() + BAR_H + BOTTOM_PAD;
              const maxGroupTotal = () => layout().groups.reduce((m, g) => Math.max(m, g.total), 1);
              const visibleRows = () => {
                const g = expandedGen();
                if (!g || layout().autoExpanded) return rows();
                return rows().filter((r) => (r.other.generation ?? '?') === g);
              };
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
                    <Show when={!layout().autoExpanded}>
                      <p style={{ margin: '0 0 0.3rem', color: '#a89e8a', 'font-size': '0.75rem' }}>
                        {t('network.arc.hint')}
                      </p>
                    </Show>
                    <div style={{ 'overflow-x': 'auto' }}>
                      <svg
                        viewBox={`0 0 ${layout().width} ${height()}`}
                        width={layout().width}
                        height={height()}
                        style={{ display: 'block', 'max-width': 'none' }}
                        role="img"
                        aria-label={t('network.arc.aria', { name: wire.node.name })}
                      >
                        {/* click-away resets the drill-down to the default view */}
                        <Show when={expandedGen() && !layout().autoExpanded}>
                          {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer-only click-away dismiss; keyboard users collapse via the generation label/pill toggles or the Show-all button */}
                          <rect
                            x={0}
                            y={0}
                            width={layout().width}
                            height={height()}
                            fill="transparent"
                            onClick={() => setExpandedGen(null)}
                          />
                        </Show>

                        {/* direction hints, centered on the diagram */}
                        <text
                          x={layout().width / 2}
                          y={TOP_PAD}
                          font-size="9"
                          fill="#a89e8a"
                          text-anchor="middle"
                        >
                          {t('network.arc.outgoing', { name: wire.node.name })}
                        </text>
                        <text
                          x={layout().width / 2}
                          y={axisY() + ARC_BAND + 11}
                          font-size="9"
                          fill="#a89e8a"
                          text-anchor="middle"
                        >
                          {t('network.arc.incoming', { name: wire.node.name })}
                        </text>

                        {/* expanded-group background band */}
                        <For each={layout().groups}>
                          {(g) => (
                            <Show when={g.expanded && !layout().autoExpanded && g.dots.length > 0}>
                              <rect
                                x={g.x}
                                y={TOP_PAD + 4}
                                width={g.width}
                                height={axisY() + ARC_BAND - TOP_PAD + 4}
                                rx={10}
                                fill="#8a6d3b"
                                opacity="0.06"
                              />
                            </Show>
                          )}
                        </For>

                        {/* arcs: era-colored trunks + fans; direction = side */}
                        <For each={layout().edges}>
                          {(a) => (
                            <path
                              d={arcPath(a, axisY())}
                              fill="none"
                              stroke={colorForGeneration(a.gen)}
                              stroke-width={a.stroke}
                              stroke-linecap="round"
                              opacity={
                                (a.slug ? dimSlug(a.slug) : dimGen(a.gen))
                                  ? 0.12
                                  : a.kind === 'trunk'
                                    ? 0.75
                                    : 0.55
                              }
                            >
                              <title>{`${genLabel(a.gen)} — ${a.above ? t('network.arc.outWord') : t('network.arc.inWord')} ×${a.weight}`}</title>
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

                        {/* groups: boundaries, labels (click to expand), pills, dots, bars */}
                        <For each={layout().groups}>
                          {(g) => {
                            const barW = () => Math.max(0, g.width - GENERATION_BAR_INSET * 2);
                            const scale = () => (g.total > 0 ? g.total / maxGroupTotal() : 0);
                            const clickable = () => !layout().autoExpanded && g.partnerCount > 0;
                            return (
                              <g>
                                <line
                                  x1={g.x}
                                  x2={g.x}
                                  y1={axisY() - 4}
                                  y2={axisY() + 4}
                                  stroke={AXIS_INK}
                                  stroke-width="1"
                                />
                                {/* biome-ignore lint/a11y/noStaticElementInteractions: SVG has no native button; role/tabindex/keydown are set whenever this label is clickable (clickable() gates all four together) */}
                                {/* biome-ignore lint/a11y/useSemanticElements: a native <button> cannot live inside <svg>; foreignObject would break the diagram's coordinate layout */}
                                <text
                                  x={g.x + g.width / 2}
                                  y={labelsY()}
                                  font-size="9.5"
                                  font-weight={g.expanded && !layout().autoExpanded ? 700 : 400}
                                  fill={clickable() ? '#8a6d3b' : '#8a8271'}
                                  text-anchor="middle"
                                  style={{ cursor: clickable() ? 'pointer' : 'default' }}
                                  role={clickable() ? 'button' : undefined}
                                  tabindex={clickable() ? 0 : undefined}
                                  aria-label={
                                    clickable()
                                      ? t(
                                          g.expanded
                                            ? 'network.arc.collapse'
                                            : 'network.arc.expand',
                                          {
                                            gen: genLabel(g.gen),
                                            n: g.partnerCount,
                                          },
                                        )
                                      : undefined
                                  }
                                  onClick={() => clickable() && toggleGen(g.gen)}
                                  onKeyDown={(ev) => {
                                    if (clickable() && (ev.key === 'Enter' || ev.key === ' ')) {
                                      ev.preventDefault();
                                      toggleGen(g.gen);
                                    }
                                  }}
                                >
                                  {shortGenLabel(g.gen, lang() === 'he')}
                                  {clickable() ? (g.expanded ? ' ×' : ` (${g.partnerCount})`) : ''}
                                </text>

                                {/* collapsed cluster pill (click to expand) */}
                                <Show when={g.pill} keyed>
                                  {(pill) => (
                                    // biome-ignore lint/a11y/useSemanticElements: a native <button> cannot live inside <svg>; the group carries role=button + tabindex + Enter/Space handling
                                    <g
                                      role="button"
                                      tabindex={0}
                                      aria-label={t('network.arc.expand', {
                                        gen: genLabel(g.gen),
                                        n: pill.partnerCount,
                                      })}
                                      style={{ cursor: 'pointer' }}
                                      opacity={dimGen(g.gen) ? 0.3 : 1}
                                      onClick={() => toggleGen(g.gen)}
                                      onKeyDown={(ev) => {
                                        if (ev.key === 'Enter' || ev.key === ' ') {
                                          ev.preventDefault();
                                          toggleGen(g.gen);
                                        }
                                      }}
                                      onMouseEnter={() => setHover(genKey(g.gen))}
                                      onMouseLeave={() => setHover(null)}
                                    >
                                      <circle
                                        cx={pill.x}
                                        cy={axisY()}
                                        r={pill.r}
                                        fill={colorForGeneration(g.gen)}
                                        stroke="#fff"
                                        stroke-width="2"
                                      />
                                      <text
                                        x={pill.x}
                                        y={axisY() + 3}
                                        font-size="8.5"
                                        font-weight="700"
                                        fill={legibleTextColor(colorForGeneration(g.gen))}
                                        text-anchor="middle"
                                      >
                                        {pill.partnerCount}
                                      </text>
                                      <title>{`${genLabel(g.gen)} — ${pill.partnerCount} · ×${g.total}`}</title>
                                    </g>
                                  )}
                                </Show>

                                {/* expanded partner dots + rotated name labels */}
                                <For each={g.dots}>
                                  {(d) => (
                                    <a
                                      href={`#sages/${d.row.other.slug}`}
                                      aria-label={d.row.other.name}
                                      onMouseEnter={() => setHover(d.row.other.slug)}
                                      onMouseLeave={() => setHover(null)}
                                      onFocus={() => setHover(d.row.other.slug)}
                                      onBlur={() => setHover(null)}
                                    >
                                      <circle
                                        cx={d.x}
                                        cy={axisY()}
                                        r={d.r}
                                        fill={colorForGeneration(d.row.other.generation)}
                                        stroke="#fff"
                                        stroke-width="2"
                                        opacity={dimSlug(d.row.other.slug) ? 0.25 : 1}
                                        style={{ cursor: 'pointer' }}
                                      />
                                      <text
                                        transform={`rotate(40 ${d.x} ${axisY() + ARC_BAND + 22})`}
                                        x={d.x}
                                        y={axisY() + ARC_BAND + 22}
                                        font-size="9"
                                        fill={dimSlug(d.row.other.slug) ? '#c8c2b4' : '#555'}
                                        text-anchor="start"
                                        style={{
                                          'paint-order': 'stroke',
                                          stroke: '#fff',
                                          'stroke-width': '3px',
                                        }}
                                      >
                                        {truncateName(d.row.other.name)}
                                      </text>
                                      <title>{`${d.row.other.name} — ${genLabel(d.row.other.generation)} — ×${d.row.totalWeight}`}</title>
                                    </a>
                                  )}
                                </For>

                                {/* stacked relation-kind bar */}
                                <Show when={g.total > 0}>
                                  {(() => {
                                    const totalW = barW() * scale();
                                    const segs = barSegments(g.byKind, g.total, totalW, BAR_GAP);
                                    const x0 = g.x + g.width / 2 - totalW / 2;
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
                                            <title>{`${genLabel(g.gen)} — ${t(`dafvoices.rel.${seg.kind}`)} ×${seg.weight}`}</title>
                                          </rect>
                                        )}
                                      </For>
                                    );
                                  })()}
                                  <text
                                    x={g.x + g.width / 2}
                                    y={barsY() + 17}
                                    font-size="8.5"
                                    fill="#a89e8a"
                                    text-anchor="middle"
                                  >
                                    ×{g.total}
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
                          y={axisY() - layout().center.r - 5}
                          font-size="10"
                          font-weight="700"
                          fill="#333"
                          text-anchor="middle"
                          style={{ 'paint-order': 'stroke', stroke: '#fff', 'stroke-width': '3px' }}
                        >
                          {wire.node.name}
                        </text>
                      </svg>
                    </div>
                    <Show when={layout().fanOverflow > 0}>
                      <p style={{ margin: '0.2rem 0 0', color: '#a89e8a', 'font-size': '0.75rem' }}>
                        {t('network.arc.fanOverflow', { n: layout().fanOverflow })}
                      </p>
                    </Show>

                    {/* legend for the relation-kind bars + row chips */}
                    <div
                      style={{
                        display: 'flex',
                        'flex-wrap': 'wrap',
                        gap: '0.8rem',
                        margin: '0.5rem 0 0.8rem',
                        'font-size': '0.75rem',
                        color: '#666',
                        'align-items': 'center',
                      }}
                    >
                      <span style={{ color: '#a89e8a' }}>{t('network.arc.kindLegend')}</span>
                      <For each={[...REL_KINDS]}>
                        {(k) => (
                          <span
                            style={{
                              display: 'inline-flex',
                              'align-items': 'center',
                              gap: '0.3rem',
                            }}
                          >
                            <svg width="14" height="8" aria-hidden="true">
                              <rect x="1" y="1" width="12" height="6" rx="2" fill={relColor(k)} />
                            </svg>
                            {t(`dafvoices.rel.${k}`)}
                          </span>
                        )}
                      </For>
                    </div>

                    {/* partner rows (filtered when a generation is expanded) */}
                    <Show when={expandedGen() && !layout().autoExpanded}>
                      <p style={{ margin: '0 0 0.4rem', 'font-size': '0.78rem', color: '#8a6d3b' }}>
                        {t('network.rows.filtered', {
                          gen: expandedGen() === '?' ? '?' : genLabel(expandedGen()),
                        })}{' '}
                        <button
                          type="button"
                          onClick={() => setExpandedGen(null)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#8a2a2b',
                            cursor: 'pointer',
                            'font-size': '0.78rem',
                            padding: 0,
                          }}
                        >
                          {t('network.rows.showAll')}
                        </button>
                      </p>
                    </Show>
                    <ol style={{ 'list-style': 'none', margin: 0, padding: 0 }}>
                      <For each={visibleRows()}>
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
