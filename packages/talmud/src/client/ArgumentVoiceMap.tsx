/**
 * Voice map for an argument section. Shows who's arguing with whom, who
 * supports whom — patterned on RabbiLineageTree but with "sides" of the
 * dispute as the Y axis instead of generations.
 *
 * Inputs come from the `argument.voices` enrichment (resolved via
 * synthesis.deps_resolved):
 *   {
 *     voices: [{ name, nameHe, role, side, stance, opinionStart }],
 *     edges:  [{ from, to, kind: opposes | supports | responds-to | cites | resolves, note }]
 *   }
 *
 * Visual:
 *   - Each side becomes one row (Position A, Stam, Position B, etc).
 *   - Voices are laid out left-to-right within their row.
 *   - Solid edges for supports / responds-to / cites / resolves.
 *   - Dashed edges for opposes.
 *   - Cross-row edges draw with an L-shape; same-row edges draw a
 *     horizontal arc.
 *   - The leftmost axis column carries the side label.
 */

import { For, type JSX, Show } from 'solid-js';
import { orthogonalEdgePath } from './flow/orthogonalEdge';
import { lang, t } from './i18n';

/** Translate an argument-taxonomy role to the active language, falling back to
 *  the raw role string when the catalog has no entry for it. */
function roleLabel(role: string): string {
  const key = `voice.role.${role}`;
  const v = t(key);
  return v === key ? role : v;
}

export interface ArgumentVoice {
  name: string;
  nameHe?: string;
  role: string;
  side: string;
  stance: string;
  opinionStart?: string;
}

export interface ArgumentEdge {
  from: string;
  to: string;
  kind: 'opposes' | 'supports' | 'responds-to' | 'cites' | 'resolves';
  note?: string;
}

export interface ArgumentVoicesData {
  voices: ArgumentVoice[];
  edges: ArgumentEdge[];
}

interface Props {
  data: ArgumentVoicesData;
  /** Optional click handler — when provided, named (non-Stam, non-anonymous)
   *  voice nodes become buttons that open the rabbi's sidebar entry. */
  onClickVoice?: (name: string) => void;
}

/** Heuristic: a voice that names an actual rabbi we can route to vs an
 *  anonymous/structural label like "Stam", "Gemara's question", etc. */
function isClickableVoiceName(name: string): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  if (n === 'stam' || n === 'gemara' || n === "gemara's question") return false;
  if (n.startsWith('gemara')) return false;
  if (n.startsWith('supporting baraita') || n === 'baraita') return false;
  if (n === 'sages' || n === 'tanna kamma' || n === 'rabbanan') return false;
  return true;
}

const AXIS_WIDTH = 110;
const NODE_W = 178;
const NODE_H = 52;
const ROW_H = 96;
const COL_GAP = 22;
const NODE_GAP = 16;
const TOP_PADDING = 22;
const BOTTOM_PADDING = 24;
const NAME_MAX_CHARS = 22;
const VERT_LANE_STEP = 8; // x offset between parallel vertical connectors

const COLOR_A = '#1d4ed8'; // Position A — primary blue
const COLOR_B = '#b91c1c'; // Position B — primary red
const COLOR_C = '#7c3aed'; // Position C — purple
const COLOR_STAM = '#475569'; // Stam — slate
const COLOR_SUPPORT = '#15803d'; // Support voices — green
const COLOR_UNALIGNED = '#92400e'; // Unaligned (questioners, transmitters) — amber
const EDGE_SUPPORT = '#15803d';
const EDGE_OPPOSE = '#b91c1c';
const EDGE_NEUTRAL = '#666';

/** Map a side label from the LLM to a stable row index + display attributes.
 *  The LLM emits 'A', 'B', 'C', 'stam', 'support-A', 'support-B', 'unaligned'.
 *  Row ordering top→bottom: A, support-A, stam, support-B, B, C, unaligned. */
function sideMeta(side: string): { rowOrder: number; label: string; color: string } {
  const s = (side ?? '').toLowerCase();
  if (s === 'a') return { rowOrder: 0, label: t('voices.position.a'), color: COLOR_A };
  if (s === 'support-a') return { rowOrder: 1, label: t('voices.supportsA'), color: COLOR_SUPPORT };
  if (s === 'stam') return { rowOrder: 2, label: t('voices.stam'), color: COLOR_STAM };
  if (s === 'support-b') return { rowOrder: 3, label: t('voices.supportsB'), color: COLOR_SUPPORT };
  if (s === 'b') return { rowOrder: 4, label: t('voices.position.b'), color: COLOR_B };
  if (s === 'c') return { rowOrder: 5, label: t('voices.position.c'), color: COLOR_C };
  if (s === 'unaligned')
    return { rowOrder: 6, label: t('voices.unaligned'), color: COLOR_UNALIGNED };
  // Unknown side: place at the bottom under its own label.
  return { rowOrder: 7, label: side || t('voices.other'), color: COLOR_UNALIGNED };
}

/** Reuse RabbiLineageTree's compaction rule. Subject-less view, so every
 *  node gets compacted. */
function compactName(name: string): string {
  const compact = name
    .replace(/^Rabbi\s+/, 'R. ')
    .replace(/^Rabban\s+/, 'Rb. ')
    .replace(/^Rav\s+/, 'R. ')
    .replace(/\s+bar\s+/g, ' b. ')
    .replace(/\s+ben\s+/g, ' b. ');
  if (compact.length <= NAME_MAX_CHARS) return compact;
  return `${compact.slice(0, NAME_MAX_CHARS - 1)}…`;
}

interface LaidNode {
  name: string;
  nameHe?: string;
  side: string;
  role: string;
  stance: string;
  color: string;
  x: number;
  y: number;
}

/** Display name for a voice node: the Hebrew form in Hebrew mode (when the
 *  enrichment supplied one), else the conventional English name. The English
 *  `name` stays the click/resolution identity — only the label flips. */
function voiceDisplayName(n: { name: string; nameHe?: string }): string {
  return lang() === 'he' && n.nameHe ? n.nameHe : n.name;
}

interface LaidEdge {
  from: LaidNode;
  to: LaidNode;
  kind: ArgumentEdge['kind'];
  note?: string;
  /** x-offset for the vertical run of a same-column connector, so parallel
   *  connectors sit side-by-side instead of overlapping (0 = centered). */
  offset: number;
}

function buildLayout(data: ArgumentVoicesData): {
  nodes: LaidNode[];
  edges: LaidEdge[];
  rows: { y: number; label: string; color: string }[];
  width: number;
  height: number;
} {
  const byRow = new Map<number, ArgumentVoice[]>();
  const rowAttrs = new Map<number, { label: string; color: string }>();

  for (const v of data.voices) {
    const meta = sideMeta(v.side);
    const list = byRow.get(meta.rowOrder) ?? [];
    list.push(v);
    byRow.set(meta.rowOrder, list);
    if (!rowAttrs.has(meta.rowOrder))
      rowAttrs.set(meta.rowOrder, { label: meta.label, color: meta.color });
  }

  // Sort each row: originator → respondent → objector → others.
  const rolePriority: Record<string, number> = {
    originator: 0,
    questioner: 1,
    respondent: 2,
    objector: 3,
    supporter: 4,
    'cited-authority': 5,
    transmitter: 6,
  };
  for (const list of byRow.values()) {
    list.sort((a, b) => {
      const ap = rolePriority[a.role] ?? 99;
      const bp = rolePriority[b.role] ?? 99;
      if (ap !== bp) return ap - bp;
      return a.name.localeCompare(b.name);
    });
  }

  const rowOrders = Array.from(byRow.keys()).sort((a, b) => a - b);

  // Y per row.
  const rowToY = new Map<number, number>();
  rowOrders.forEach((idx, i) => {
    rowToY.set(idx, TOP_PADDING + i * ROW_H);
  });
  const height = TOP_PADDING + rowOrders.length * ROW_H + BOTTOM_PADDING;

  // X layout: every row starts at SUBJECT_X (immediately right of axis).
  const SUBJECT_X = AXIS_WIDTH + COL_GAP;
  const COL_STEP = NODE_W + NODE_GAP;

  let widestRow = 1;
  const nodes: LaidNode[] = [];
  const nodeByName = new Map<string, LaidNode>();
  for (const idx of rowOrders) {
    const list = byRow.get(idx)!;
    widestRow = Math.max(widestRow, list.length);
    const y = rowToY.get(idx)!;
    list.forEach((v, j) => {
      const meta = sideMeta(v.side);
      const node: LaidNode = {
        name: v.name,
        nameHe: v.nameHe,
        side: v.side,
        role: v.role,
        stance: v.stance,
        color: meta.color,
        x: SUBJECT_X + j * COL_STEP,
        y,
      };
      nodes.push(node);
      nodeByName.set(v.name, node);
    });
  }
  const drawWidth = widestRow * NODE_W + (widestRow - 1) * NODE_GAP;
  const width = SUBJECT_X + drawWidth + 16;

  // Build laid edges. Drop edges whose endpoints can't be resolved.
  const edges: LaidEdge[] = [];
  for (const e of data.edges ?? []) {
    const from = nodeByName.get(e.from);
    const to = nodeByName.get(e.to);
    if (!from || !to) continue;
    edges.push({ from, to, kind: e.kind, note: e.note, offset: 0 });
  }

  // Separate parallel vertical connectors. Edges that run straight down a
  // single column (e.g. Position A → Stam → Position B, plus any spanning
  // A → B) otherwise draw on top of each other. Within each column, colour the
  // edges' y-intervals into lanes (touching segments share a lane) and spread
  // each lane's vertical run symmetrically around the column centre.
  const SAME_COL = (a: LaidNode, b: LaidNode) => Math.abs(a.x - b.x) < 1;
  const byCol = new Map<number, LaidEdge[]>();
  for (const e of edges) {
    if (!SAME_COL(e.from, e.to)) continue;
    const key = Math.round(e.from.x);
    (byCol.get(key) ?? byCol.set(key, []).get(key)!).push(e);
  }
  for (const list of byCol.values()) {
    const items = list
      .map((e) => ({ e, lo: Math.min(e.from.y, e.to.y), hi: Math.max(e.from.y, e.to.y) }))
      .sort((a, b) => a.lo - b.lo || a.hi - b.hi);
    const laneHi: number[] = [];
    const laneOf = new Map<LaidEdge, number>();
    for (const it of items) {
      let lane = laneHi.findIndex((h) => h <= it.lo); // touching segments share
      if (lane === -1) {
        lane = laneHi.length;
        laneHi.push(it.hi);
      } else laneHi[lane] = it.hi;
      laneOf.set(it.e, lane);
    }
    const laneCount = laneHi.length;
    for (const it of items) {
      it.e.offset = (laneOf.get(it.e)! - (laneCount - 1) / 2) * VERT_LANE_STEP;
    }
  }

  // Rows array for axis labels.
  const rows = rowOrders.map((idx) => {
    const attrs = rowAttrs.get(idx)!;
    return { y: rowToY.get(idx)! + NODE_H / 2, label: attrs.label, color: attrs.color };
  });

  return { nodes, edges, rows, width, height };
}

/** Edge path. A same-column connector draws as a straight vertical at the
 *  column centre plus its lane offset (so parallel runs sit side-by-side);
 *  everything else delegates to the shared orthogonal router so connectors are
 *  always horizontal/vertical/L-shaped, never diagonal. */
function edgePath(e: LaidEdge): string {
  const { from, to } = e;
  if (Math.abs(from.x - to.x) < 1) {
    const x = from.x + NODE_W / 2 + e.offset;
    const upper = from.y <= to.y ? from : to;
    const lower = from.y <= to.y ? to : from;
    return `M ${x} ${upper.y + NODE_H} L ${x} ${lower.y}`;
  }
  return orthogonalEdgePath(
    { x: from.x, y: from.y, w: NODE_W, h: NODE_H },
    { x: to.x, y: to.y, w: NODE_W, h: NODE_H },
  );
}

function edgeColor(kind: ArgumentEdge['kind']): string {
  if (kind === 'opposes') return EDGE_OPPOSE;
  if (kind === 'supports' || kind === 'resolves') return EDGE_SUPPORT;
  return EDGE_NEUTRAL;
}

function edgeDash(kind: ArgumentEdge['kind']): string | undefined {
  if (kind === 'opposes') return '5 3';
  return undefined;
}

export default function ArgumentVoiceMap(props: Props): JSX.Element {
  const layout = () => buildLayout(props.data);
  const hasContent = () => props.data.voices.length > 0;

  return (
    <Show when={hasContent()}>
      <div
        style={{
          border: '1px solid #eae8e0',
          'border-radius': '6px',
          background: '#fafaf7',
          padding: '0.7rem 0.85rem',
          'margin-top': '0.9rem',
        }}
      >
        <div
          style={{
            'font-size': '0.7rem',
            'text-transform': 'uppercase',
            'letter-spacing': '0.08em',
            color: '#888',
            'margin-bottom': '0.5rem',
          }}
        >
          {t('voices.title')}
        </div>

        {/* Pannable canvas: when the SVG is wider/taller than the sidebar
            slot, the wrapper scrolls in both axes. SVG renders at its
            natural width — no max-width:100% (which would scale-fit and
            crush the layout). The wrapper has min-width:0 so it shrinks
            inside flex parents instead of stretching them. */}
        <div
          style={{
            width: '100%',
            'min-width': 0,
            'max-height': '480px',
            'overflow-x': 'auto',
            'overflow-y': 'auto',
            // The diagram is an inherently left-to-right tree (axis on the left,
            // rows flowing right). Pin the scroll container to LTR so that under
            // a page-level dir=rtl (Hebrew) the scroll origin stays on the left
            // and the right-hand columns aren't hidden off-screen.
            direction: 'ltr',
            border: '1px solid #ece9df',
            'border-radius': '8px',
            background: '#fdfcf9',
            padding: '0.35rem 0.2rem',
          }}
        >
          <svg
            role="img"
            aria-label="Map of the voices in this argument"
            width={layout().width}
            height={layout().height}
            viewBox={`0 0 ${layout().width} ${layout().height}`}
            style={{ display: 'block' }}
          >
            <defs>
              <filter id="voice-card-shadow" x="-10%" y="-20%" width="120%" height="150%">
                <feDropShadow
                  dx="0"
                  dy="1"
                  stdDeviation="1.4"
                  flood-color="#3a3320"
                  flood-opacity="0.12"
                />
              </filter>
            </defs>

            {/* Warm spine, trimmed to span only the actual rows (no empty
                tail above the first / below the last marker). */}
            <line
              x1={AXIS_WIDTH}
              y1={layout().rows[0]?.y ?? TOP_PADDING}
              x2={AXIS_WIDTH}
              y2={layout().rows[layout().rows.length - 1]?.y ?? TOP_PADDING}
              stroke="#e4e0d4"
              stroke-width={1.5}
              stroke-linecap="round"
            />

            {/* Side axis: label · node-dot on the spine · connector to the card. */}
            <For each={layout().rows}>
              {(row) => (
                <>
                  <line
                    x1={AXIS_WIDTH}
                    y1={row.y}
                    x2={AXIS_WIDTH + COL_GAP}
                    y2={row.y}
                    stroke="#e4e0d4"
                    stroke-width={1.5}
                    stroke-linecap="round"
                  />
                  {/* White halo (canvas colour) lets the dot punch cleanly
                    through the spine + connector. */}
                  <circle
                    cx={AXIS_WIDTH}
                    cy={row.y}
                    r={5}
                    fill={row.color}
                    stroke="#fdfcf9"
                    stroke-width={2}
                  />
                  <text
                    x={AXIS_WIDTH - 16}
                    y={row.y}
                    text-anchor="end"
                    dominant-baseline="central"
                    font-size="10"
                    font-weight="500"
                    font-family="system-ui, -apple-system, sans-serif"
                    fill="#6b6661"
                  >
                    {row.label}
                  </text>
                </>
              )}
            </For>

            {/* Edges, behind nodes. Note text lives in a <title> hover
                tooltip rather than inline — when many edges share the same
                pair of rows, inline pill labels stacked on top of each
                other and read as visual noise. Color + dash already convey
                the edge kind; hovering reveals the per-edge note. */}
            <For each={layout().edges}>
              {(e) => {
                const stroke = edgeColor(e.kind);
                const dash = edgeDash(e.kind);
                const titleText =
                  e.note && e.note.trim().length > 0
                    ? `${e.from.name} ${e.kind} ${e.to.name} — ${e.note}`
                    : `${e.from.name} ${e.kind} ${e.to.name}`;
                return (
                  <path
                    d={edgePath(e)}
                    fill="none"
                    stroke={stroke}
                    stroke-width={1.5}
                    stroke-linecap="round"
                    stroke-opacity={0.8}
                    stroke-dasharray={dash}
                  >
                    <title>{titleText}</title>
                  </path>
                );
              }}
            </For>

            {/* Nodes */}
            <For each={layout().nodes}>
              {(n) => {
                const clickable = props.onClickVoice && isClickableVoiceName(n.name);
                const openVoice = clickable ? () => props.onClickVoice!(n.name) : undefined;
                const titleText = n.stance
                  ? `${n.name} (${n.role})\n${n.stance}`
                  : `${n.name} (${n.role})`;
                return (
                  // biome-ignore lint/a11y/noStaticElementInteractions: role="button"/tabindex ARE set when this voice is clickable; Biome cannot resolve the conditional role expression
                  <g
                    role={clickable ? 'button' : undefined}
                    tabindex={clickable ? 0 : undefined}
                    onClick={openVoice}
                    onKeyDown={
                      openVoice
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openVoice();
                            }
                          }
                        : undefined
                    }
                    style={clickable ? { cursor: 'pointer' } : undefined}
                  >
                    <title>{clickable ? `${titleText}\n— click to open` : titleText}</title>
                    <rect
                      x={n.x}
                      y={n.y}
                      width={NODE_W}
                      height={NODE_H}
                      rx={10}
                      ry={10}
                      fill="#ffffff"
                      stroke="#e4e0d4"
                      stroke-width={1}
                      filter="url(#voice-card-shadow)"
                    />
                    {/* Side-colour badge (replaces the old left accent bar, which
                      overlapped the rounded border and read as a blob). */}
                    <circle cx={n.x + 19} cy={n.y + NODE_H / 2} r={9} fill={n.color} />
                    {/* Left-align both lines at n.x+36 (right of the badge) in BOTH
                      languages. text-anchor is direction-relative: with
                      direction=rtl, anchor="start" pins the text's RIGHT edge to
                      n.x+36 so the Hebrew name flows left over the colour badge.
                      anchor="end" pins the LEFT edge there instead. */}
                    <text
                      x={n.x + 36}
                      y={n.y + NODE_H / 2 - 6}
                      text-anchor={lang() === 'he' ? 'end' : 'start'}
                      dominant-baseline="central"
                      font-size="11.5"
                      font-weight="600"
                      font-family="system-ui, -apple-system, sans-serif"
                      fill="#2a2723"
                      direction={lang() === 'he' ? 'rtl' : 'ltr'}
                      style={
                        clickable
                          ? {
                              'text-decoration': 'underline',
                              'text-decoration-style': 'dotted',
                              'text-underline-offset': '2px',
                            }
                          : undefined
                      }
                    >
                      {compactName(voiceDisplayName(n))}
                    </text>
                    <text
                      x={n.x + 36}
                      y={n.y + NODE_H / 2 + 10}
                      text-anchor={lang() === 'he' ? 'end' : 'start'}
                      dominant-baseline="central"
                      font-size="9.5"
                      font-family="system-ui, -apple-system, sans-serif"
                      fill="#8a857c"
                      direction={lang() === 'he' ? 'rtl' : 'ltr'}
                    >
                      {roleLabel(n.role)}
                    </text>
                  </g>
                );
              }}
            </For>
          </svg>
        </div>

        {/* Legend */}
        <div
          style={{
            display: 'flex',
            'align-items': 'center',
            gap: '0.85rem',
            'margin-top': '0.6rem',
            'font-size': '0.65rem',
            color: '#888',
            'flex-wrap': 'wrap',
          }}
        >
          <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '0.3rem' }}>
            <span
              style={{
                display: 'inline-block',
                width: '14px',
                height: '0',
                'border-top': `1.5px solid ${EDGE_SUPPORT}`,
              }}
            />
            {t('voices.legend.supports')}
          </span>
          <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '0.3rem' }}>
            <span
              style={{
                display: 'inline-block',
                width: '14px',
                height: '0',
                'border-top': `1.5px dashed ${EDGE_OPPOSE}`,
              }}
            />
            {t('voices.legend.opposes')}
          </span>
          <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '0.3rem' }}>
            <span
              style={{
                display: 'inline-block',
                width: '14px',
                height: '0',
                'border-top': `1.5px solid ${EDGE_NEUTRAL}`,
              }}
            />
            {t('voices.legend.cites')}
          </span>
        </div>
      </div>
    </Show>
  );
}
