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

import { For, Show, type JSX } from 'solid-js';
import { t, lang } from './i18n';

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
const NODE_W = 152;
const NODE_H = 40;
const ROW_H = 84;
const COL_GAP = 22;
const NODE_GAP = 14;
const TOP_PADDING = 22;
const BOTTOM_PADDING = 24;
const NAME_MAX_CHARS = 22;

const COLOR_A = '#1d4ed8';        // Position A — primary blue
const COLOR_B = '#b91c1c';        // Position B — primary red
const COLOR_C = '#7c3aed';        // Position C — purple
const COLOR_STAM = '#475569';     // Stam — slate
const COLOR_SUPPORT = '#15803d';  // Support voices — green
const COLOR_UNALIGNED = '#92400e';// Unaligned (questioners, transmitters) — amber
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
  if (s === 'unaligned') return { rowOrder: 6, label: t('voices.unaligned'), color: COLOR_UNALIGNED };
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
  return compact.slice(0, NAME_MAX_CHARS - 1) + '…';
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
}

function buildLayout(data: ArgumentVoicesData): { nodes: LaidNode[]; edges: LaidEdge[]; rows: { y: number; label: string; color: string }[]; width: number; height: number } {
  const byRow = new Map<number, ArgumentVoice[]>();
  const rowAttrs = new Map<number, { label: string; color: string }>();

  for (const v of data.voices) {
    const meta = sideMeta(v.side);
    const list = byRow.get(meta.rowOrder) ?? [];
    list.push(v);
    byRow.set(meta.rowOrder, list);
    if (!rowAttrs.has(meta.rowOrder)) rowAttrs.set(meta.rowOrder, { label: meta.label, color: meta.color });
  }

  // Sort each row: originator → respondent → objector → others.
  const rolePriority: Record<string, number> = {
    originator: 0, questioner: 1, respondent: 2, objector: 3,
    supporter: 4, 'cited-authority': 5, transmitter: 6,
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
  rowOrders.forEach((idx, i) => rowToY.set(idx, TOP_PADDING + i * ROW_H));
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
    edges.push({ from, to, kind: e.kind, note: e.note });
  }

  // Rows array for axis labels.
  const rows = rowOrders.map((idx) => {
    const attrs = rowAttrs.get(idx)!;
    return { y: rowToY.get(idx)! + NODE_H / 2, label: attrs.label, color: attrs.color };
  });

  return { nodes, edges, rows, width, height };
}

/** Edge path. Same-row → short horizontal line between the near edges.
 *  Different rows → L-shape through a midline Y. */
function edgePath(from: LaidNode, to: LaidNode): string {
  const fromMidX = from.x + NODE_W / 2;
  const toMidX = to.x + NODE_W / 2;
  if (from.y === to.y) {
    const startX = from.x + (toMidX > fromMidX ? NODE_W : 0);
    const endX = to.x + (toMidX > fromMidX ? 0 : NODE_W);
    return `M ${startX} ${from.y + NODE_H / 2} L ${endX} ${to.y + NODE_H / 2}`;
  }
  if (Math.abs(fromMidX - toMidX) < 1) {
    // Same column, different row — straight vertical.
    if (to.y > from.y) return `M ${fromMidX} ${from.y + NODE_H} L ${toMidX} ${to.y}`;
    return `M ${fromMidX} ${from.y} L ${toMidX} ${to.y + NODE_H}`;
  }
  // L-shape: down/up from `from`, across, then up/down into `to`.
  if (to.y > from.y) {
    const midY = (from.y + NODE_H + to.y) / 2;
    return `M ${fromMidX} ${from.y + NODE_H} L ${fromMidX} ${midY} L ${toMidX} ${midY} L ${toMidX} ${to.y}`;
  }
  const midY = (to.y + NODE_H + from.y) / 2;
  return `M ${fromMidX} ${from.y} L ${fromMidX} ${midY} L ${toMidX} ${midY} L ${toMidX} ${to.y + NODE_H}`;
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
      <div style={{
        border: '1px solid #eae8e0',
        'border-radius': '6px',
        background: '#fafaf7',
        padding: '0.7rem 0.85rem',
        'margin-top': '0.9rem',
      }}>
        <div style={{
          'font-size': '0.7rem',
          'text-transform': 'uppercase',
          'letter-spacing': '0.08em',
          color: '#888',
          'margin-bottom': '0.5rem',
        }}>{t('voices.title')}</div>

        {/* Pannable canvas: when the SVG is wider/taller than the sidebar
            slot, the wrapper scrolls in both axes. SVG renders at its
            natural width — no max-width:100% (which would scale-fit and
            crush the layout). The wrapper has min-width:0 so it shrinks
            inside flex parents instead of stretching them. */}
        <div style={{
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
          border: '1px solid #f0eee6',
          'border-radius': '4px',
          background: '#fff',
        }}>
          <svg
            width={layout().width}
            height={layout().height}
            viewBox={`0 0 ${layout().width} ${layout().height}`}
            style={{ display: 'block' }}
          >
            {/* Vertical spine */}
            <line
              x1={AXIS_WIDTH - 2}
              y1={TOP_PADDING - 4}
              x2={AXIS_WIDTH - 2}
              y2={layout().height - BOTTOM_PADDING + 4}
              stroke="#d4d4d4"
              stroke-width={1}
            />

            {/* Side axis labels */}
            <For each={layout().rows}>{(row) => (
              <>
                <line
                  x1={AXIS_WIDTH - 2}
                  y1={row.y}
                  x2={AXIS_WIDTH + 6}
                  y2={row.y}
                  stroke="#999"
                  stroke-width={1.5}
                />
                <circle cx={AXIS_WIDTH - 10} cy={row.y} r={4} fill={row.color} stroke="#fff" stroke-width={1} />
                <text x={AXIS_WIDTH - 18} y={row.y + 4} text-anchor="end" font-size="10" font-family="system-ui, -apple-system, sans-serif" fill="#555">
                  {row.label}
                </text>
              </>
            )}</For>

            {/* Edges, behind nodes. Note text lives in a <title> hover
                tooltip rather than inline — when many edges share the same
                pair of rows, inline pill labels stacked on top of each
                other and read as visual noise. Color + dash already convey
                the edge kind; hovering reveals the per-edge note. */}
            <For each={layout().edges}>{(e) => {
              const stroke = edgeColor(e.kind);
              const dash = edgeDash(e.kind);
              const titleText = e.note && e.note.trim().length > 0
                ? `${e.from.name} ${e.kind} ${e.to.name} — ${e.note}`
                : `${e.from.name} ${e.kind} ${e.to.name}`;
              return (
                <path
                  d={edgePath(e.from, e.to)}
                  fill="none"
                  stroke={stroke}
                  stroke-width={1.5}
                  stroke-dasharray={dash}
                >
                  <title>{titleText}</title>
                </path>
              );
            }}</For>

            {/* Nodes */}
            <For each={layout().nodes}>{(n) => {
              const clickable = props.onClickVoice && isClickableVoiceName(n.name);
              const titleText = n.stance ? `${n.name} (${n.role})\n${n.stance}` : `${n.name} (${n.role})`;
              return (
                <g
                  onClick={clickable ? () => props.onClickVoice!(n.name) : undefined}
                  style={clickable ? { cursor: 'pointer' } : undefined}
                >
                  <title>{clickable ? `${titleText}\n— click to open` : titleText}</title>
                  <rect
                    x={n.x}
                    y={n.y}
                    width={NODE_W}
                    height={NODE_H}
                    rx={6}
                    ry={6}
                    fill="#fff"
                    stroke={n.color}
                    stroke-width={1.5}
                  />
                  <rect
                    x={n.x}
                    y={n.y}
                    width={4}
                    height={NODE_H}
                    rx={2}
                    ry={2}
                    fill={n.color}
                  />
                  <text
                    x={n.x + NODE_W / 2}
                    y={n.y + 16}
                    text-anchor="middle"
                    font-size="11"
                    font-weight="600"
                    font-family="system-ui, -apple-system, sans-serif"
                    fill="#222"
                    style={clickable ? { 'text-decoration': 'underline', 'text-decoration-style': 'dotted', 'text-underline-offset': '2px' } : undefined}
                  >{compactName(voiceDisplayName(n))}</text>
                  <text
                    x={n.x + NODE_W / 2}
                    y={n.y + 30}
                    text-anchor="middle"
                    font-size="9"
                    font-family="system-ui, -apple-system, sans-serif"
                    fill="#888"
                  >{roleLabel(n.role)}</text>
                </g>
              );
            }}</For>
          </svg>
        </div>

        {/* Legend */}
        <div style={{
          display: 'flex', 'align-items': 'center', gap: '0.85rem',
          'margin-top': '0.6rem',
          'font-size': '0.65rem', color: '#888',
          'flex-wrap': 'wrap',
        }}>
          <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '0.3rem' }}>
            <span style={{ display: 'inline-block', width: '14px', height: '0', 'border-top': `1.5px solid ${EDGE_SUPPORT}` }} />
            {t('voices.legend.supports')}
          </span>
          <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '0.3rem' }}>
            <span style={{ display: 'inline-block', width: '14px', height: '0', 'border-top': `1.5px dashed ${EDGE_OPPOSE}` }} />
            {t('voices.legend.opposes')}
          </span>
          <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '0.3rem' }}>
            <span style={{ display: 'inline-block', width: '14px', height: '0', 'border-top': `1.5px solid ${EDGE_NEUTRAL}` }} />
            {t('voices.legend.cites')}
          </span>
        </div>
      </div>
    </Show>
  );
}
