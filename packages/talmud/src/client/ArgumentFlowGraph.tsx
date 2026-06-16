/**
 * Whole-daf argument FLOW graph. Each argument section is a node (in daf
 * order, top to bottom); the daf-level `argument-overview.flow` enrichment
 * supplies the connections between them (continues / resolves / depends-on /
 * parallels / contrasts / generalizes / cites). Connectors route through a
 * right-side lane so they never cross node boxes, and only ever run
 * horizontally or vertically (orthogonal — no diagonals).
 *
 * Clicking a node calls `onSelect(index)` so the parent can expand that
 * section's voice map (the drill-in).
 */
import { createMemo, createSignal, For, type JSX, Show } from 'solid-js';
import { linkTarget } from '../lib/context/linkTarget';
import type { SectionExit } from '../lib/context/sectionExits';
import type { StatementLink, StatementNode } from '../lib/typing/statementSpine';
import { lang, t } from './i18n';

export interface FlowConnection {
  from: number;
  to: number;
  kind:
    | 'continues'
    | 'resolves'
    | 'depends-on'
    | 'parallels'
    | 'contrasts'
    | 'generalizes'
    | 'cites';
  note?: string;
}

export interface FlowNode {
  /** 0-based section index (matches connection from/to). */
  index: number;
  title: string;
  /** Off-node connections anchored to this section (cross-daf parallels, cites,
   *  pesukim, halacha) — rendered as a click-to-expand exit-marker band. The
   *  spine's links projected onto the section that owns them. */
  exits?: SectionExit[];
  /** This section's statement spine (voices/moves). Rendered as nested sub-nodes
   *  in an indented band below the node when it's the focused (active) section —
   *  the in-map drill-in. */
  statements?: StatementNode[];
  /** The statement spine's edges (role-derived + voices-mapped). Drawn between
   *  the nested sub-nodes: response/resolution threads on the left rail, an
   *  opposition bracket on the right — only on the focused section. */
  statementLinks?: StatementLink[];
}

interface Props {
  nodes: FlowNode[];
  connections: FlowConnection[];
  activeIndex: number | null;
  onSelect: (index: number) => void;
  /** Suppress this graph's own legend (when a shared legend is rendered once
   *  for several stacked graphs, e.g. one per sugya in the overview). */
  hideLegend?: boolean;
  /** Click handler for an exit-marker chip. Defaults to navigating the target
   *  (our reader for a daf, the Tanach app for a pasuk); an inert target
   *  (halacha) does nothing without a handler. */
  onPickExit?: (ex: SectionExit) => void;
  /** The selected statement (move) id in the focused section; clicking a nested
   *  statement node selects it (its detail renders below the map). */
  selectedStatementId?: string | null;
  onSelectStatement?: (id: string) => void;
}

const NODE_W = 310;
const NODE_H = 44;
const ROW_GAP = 10;
const LANE_BASE = 12; // first lane's distance out from the card's right edge
const LANE_STEP = 11; // extra offset per concurrent connector lane
const TOP_PAD = 10;
const LEFT_PAD = 10;
const CORNER_R = 18; // rounded-corner radius on the connector's two turns

export const KIND_COLOR: Record<FlowConnection['kind'], string> = {
  continues: '#666',
  resolves: '#15803d',
  'depends-on': '#1d4ed8',
  parallels: '#7c3aed',
  contrasts: '#b91c1c',
  generalizes: '#92400e',
  cites: '#475569',
};
export const KIND_DASH: Partial<Record<FlowConnection['kind'], string>> = {
  contrasts: '5 3',
  parallels: '2 3',
};

// Exit markers: a per-node click-to-expand band of OFF-node connections (cross-
// daf parallels, cites, pesukim, halacha) — the spine's links projected onto the
// section that owns them. Mirrors the #spine view's exit markers.
const EXIT_H = 21;
const EXIT_TOP = 5;
const EXIT_INDENT = 26;
const BADGE_W = 30;
const BADGE_H = 15;
const MARKER_INK = '#9a7b4f';
// Nested statement nodes (the focused section's voices/moves): indented sub-nodes
// in a band below the section node, deterministic height like the exit band.
const STMT_TOP = 6;
const STMT_H = 33; // a little breathing room — let the statements read like a text, not a list
const STMT_INDENT = 24; // left gutter — response/resolution threads route here
const STMT_RGUT = 14; // right gutter — opposition brackets route here
const STMT_STRIPE = 3; // left accent-stripe width on a nested statement node
const STMT_RAIL_X = LEFT_PAD + 11; // x of the left thread rail (inside the indent)
// Statement labels + speakers use the SAME system-sans as the section nodes, so
// the nested sub-nodes read as part of the one map. Elegance comes from restraint
// (muted role caps, a quiet side letter, hairline rules), not a different face.
const STMT_FONT = 'system-ui, -apple-system, sans-serif';
// Statement relationships speak the SAME relation language as the section-flow
// links: each StatementRelation maps to its section LinkRelation kin, so statement
// edges reuse KIND_COLOR / KIND_DASH and the link.rel.* labels — one coherent
// vocabulary at both zooms (relations between statements follow the links sections
// have to each other). Opposition reads as the section's `contrasts`; a response
// continues the thread; a `supports` keeps its own evidential colour (the section
// vocabulary has no kin for it — see STMT_SUPPORTS_COLOR). (Bracket-vs-thread
// routing still keys on the precise statement relation; only colour/label follow.)
//
// DEFERRED (future cache-version bump): the canonical unified vocabulary (per a
// design panel) is — dialectic: continues / resolves / opposes / supports;
// reference: cites / parallels / depends-on / generalizes. Two display approxes
// here are lossy: `supports`->depends-on is DIRECTION-REVERSED (evidence-FOR vs
// prerequisite-OF — the bigger one; a FREE client fix is to give statement
// `supports` its own evidential colour+label instead of aliasing depends-on), and
// opposition is merely double-named (`contrasts` at section, `opposes` here).
// `responds-to`->continues is a DELIBERATE merge, not lossy. To derive natively
// (not remap), the producer work is benchmark-gated + cold-misses Shas: add a
// section-level `supports` kind and split the conflated `cites` in
// argument-overview.flow, then bump its recipe. Keep the display remap for now.
const STMT_REL_AS_LINK: Record<string, FlowConnection['kind']> = {
  opposes: 'contrasts',
  'responds-to': 'continues',
  resolves: 'resolves',
  cites: 'cites',
  continues: 'continues',
};
const stmtRelKind = (rel: string): FlowConnection['kind'] => STMT_REL_AS_LINK[rel] ?? 'continues';
// `supports` (raya / proof) has no section-flow kin — the section vocabulary lacks
// it (see the deferred note above). So it gets its OWN evidential colour + label
// rather than the old, direction-REVERSED alias to `depends-on` (evidence-FOR vs
// prerequisite-OF). Display-only; the native section-level `supports` is deferred.
const STMT_SUPPORTS_COLOR = '#0891b2';
const STMT_SIDE_COLOR: Record<string, string> = {
  A: '#1d4ed8',
  B: '#b91c1c',
  C: '#92400e',
  'support-A': '#1d4ed8',
  'support-B': '#b91c1c',
};
const STMT_ROLE_COLOR: Record<string, string> = {
  opening: '#475569',
  question: '#0369a1',
  answer: '#15803d',
  objection: '#b91c1c',
  rejection: '#9f1239',
  'supporting-evidence': '#0891b2',
  resolution: '#15803d',
  digression: '#a16207',
  shift: '#7c3aed',
  other: '#64748b',
};
const stmtRoleColor = (role: string): string => STMT_ROLE_COLOR[role] ?? STMT_ROLE_COLOR.other;
const EXIT_FAMILY_COLOR: Record<string, string> = {
  parallel: KIND_COLOR.parallels,
  citation: KIND_COLOR.cites,
  scripture: '#b45309',
  codification: '#7c2d12',
};
const EXIT_FAMILY_TAG: Record<string, string> = {
  parallel: 'parallel',
  citation: 'cites',
  scripture: 'pasuk',
  codification: 'halacha',
};

/** Distinct connection kinds present across a set of connections, in the
 *  canonical KIND_COLOR order — for building one shared <FlowLegend>. */
export function connectionKinds(connections: FlowConnection[]): FlowConnection['kind'][] {
  const seen = new Set<FlowConnection['kind']>();
  for (const c of connections) seen.add(c.kind);
  return (Object.keys(KIND_COLOR) as FlowConnection['kind'][]).filter((k) => seen.has(k));
}

/** Color + dash → kind legend. Exported so the overview can render ONE legend
 *  for several stacked graphs instead of repeating it under each. */
export function FlowLegend(props: { kinds: FlowConnection['kind'][] }): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        'flex-wrap': 'wrap',
        gap: '0.4rem 0.85rem',
        'margin-top': '0.5rem',
        'font-size': '0.64rem',
        color: '#888',
      }}
    >
      <For each={props.kinds}>
        {(kind) => (
          <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '0.3rem' }}>
            <span
              style={{
                display: 'inline-block',
                width: '16px',
                height: 0,
                'border-top': `1.5px ${KIND_DASH[kind] ? 'dashed' : 'solid'} ${KIND_COLOR[kind]}`,
              }}
            />
            {t(`link.rel.${kind}`)}
          </span>
        )}
      </For>
    </div>
  );
}

/** Assign each connection a routing lane (0-based) so connectors that share
 *  vertical extent never sit in the same lane — interval-graph coloring, which
 *  keeps parallel runs from drawing on top of each other (the old `i % 4`
 *  cycling collided whenever >4 edges, or fewer edges overlapped in range).
 *  Returns a lane per connection in input order. Pure + exported for tests. */
export function assignLanes(connections: FlowConnection[]): number[] {
  const order = connections
    .map((c, i) => ({ i, lo: Math.min(c.from, c.to), hi: Math.max(c.from, c.to) }))
    .sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  const laneHi: number[] = []; // highest row index currently occupying each lane
  const lanes = new Array<number>(connections.length).fill(0);
  for (const { i, lo, hi } of order) {
    let lane = laneHi.findIndex((h) => h < lo); // a lane whose last run ended above us
    if (lane === -1) {
      lane = laneHi.length;
      laneHi.push(hi);
    } else laneHi[lane] = hi;
    lanes[i] = lane;
  }
  return lanes;
}

const LINE_H = 15; // px between wrapped title lines
const TITLE_CHARS = 40; // approx chars per line at NODE_W / 12px system font
const TITLE_LINES = 2; // wrap to at most this many lines, then ellipsize

/** Greedy word-wrap to at most `maxLines` lines of ~`maxChars` each, ellipsizing
 *  any overflow on the final line. SVG can't measure text without the DOM, so we
 *  budget by character count — good enough for section titles, and keeps the
 *  whole node in (Solid-safe) SVG rather than foreignObject. */
export function wrapTitle(s: string, maxChars: number, maxLines: number): string[] {
  const words = s.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  let i = 0;
  for (; i < words.length; i++) {
    const cand = cur ? `${cur} ${words[i]}` : words[i];
    if (cand.length <= maxChars || !cur) {
      cur = cand;
    } else {
      lines.push(cur);
      cur = words[i];
      if (lines.length === maxLines - 1) {
        i++;
        break;
      }
    }
  }
  let rest = cur;
  for (; i < words.length; i++) rest += ` ${words[i]}`;
  if (rest.length <= maxChars) {
    if (rest) lines.push(rest);
  } else {
    lines.push(`${rest.slice(0, maxChars - 1).trimEnd()}…`);
  }
  return lines.length ? lines : [''];
}

export default function ArgumentFlowGraph(props: Props): JSX.Element {
  // Which section nodes have their exit-marker band expanded (collapsed default).
  const [openExits, setOpenExits] = createSignal(new Set<number>());
  const toggleExits = (idx: number) =>
    setOpenExits((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  const pickExit = (ex: SectionExit) => {
    if (props.onPickExit) {
      props.onPickExit(ex);
      return;
    }
    const t = linkTarget(ex.target);
    if (!t.href) return;
    if (t.external) window.open(t.href, '_blank', 'noopener');
    else window.location.href = t.href;
  };

  // Reserved bands below a node: its expanded exit markers, and — for the focused
  // section — its nested statement nodes. Both deterministic heights, so the
  // accumulated layout below just sums them and the rest of the map reflows.
  const exitsBandOf = (n: FlowNode): number => {
    const ex = n.exits ?? [];
    return ex.length && openExits().has(n.index) ? EXIT_TOP + ex.length * EXIT_H : 0;
  };
  const stmtsOf = (n: FlowNode): StatementNode[] =>
    n.index === props.activeIndex && n.statements ? n.statements : [];
  const stmtLinksOf = (n: FlowNode): StatementLink[] =>
    n.index === props.activeIndex && n.statementLinks ? n.statementLinks : [];
  const stmtsBandOf = (n: FlowNode): number => {
    const s = stmtsOf(n);
    return s.length ? STMT_TOP + s.length * STMT_H : 0;
  };

  // Accumulated vertical layout: every node is NODE_H tall, plus its reserved
  // bands (exits, then the focused section's statements). Reading openExits() /
  // activeIndex makes the whole layout reflow reactively.
  const layout = createMemo(() => {
    const ys: number[] = [];
    let y = TOP_PAD;
    props.nodes.forEach((n, i) => {
      ys[i] = y;
      y += NODE_H + exitsBandOf(n) + stmtsBandOf(n) + ROW_GAP;
    });
    return { ys, total: props.nodes.length ? y - ROW_GAP + TOP_PAD : 0 };
  });
  const nodeY = (i: number) => layout().ys[i] ?? TOP_PAD;
  const rowMidY = (i: number) => nodeY(i) + NODE_H / 2;
  const height = () => layout().total;

  // The array position of the focused (expanded) section in THIS group, or -1.
  const expandedPos = (): number => props.nodes.findIndex((n) => n.index === props.activeIndex);
  const nodeBandBottom = (i: number): number => {
    const n = props.nodes[i];
    return nodeY(i) + NODE_H + exitsBandOf(n) + stmtsBandOf(n);
  };
  // Where a section-flow edge anchors on a node. An edge LEAVING the expanded
  // section exits from just below its statement band — so the flow appears to
  // thread OUT of the statements into the next section, not skip across them.
  const edgeAnchorY = (i: number, isSource: boolean): number =>
    isSource && i === expandedPos() && stmtsBandOf(props.nodes[i]) > 0
      ? nodeBandBottom(i) - 4
      : rowMidY(i);

  // Map section index -> array position, so a SUBSET of the daf's sections (one
  // sugya group) lays out compactly in rows 0..k while connections still arrive
  // keyed by absolute section index. Edges with an endpoint outside this group
  // are dropped — they belong to another map. The same membership test also
  // guards against the LLM emitting a self-loop or an out-of-range / non-integer
  // index: a self-loop fails `from !== to`, and a bad index isn't a real section
  // so `pm.has` rejects it (the map is keyed by integer section indices).
  const posOf = () => new Map(props.nodes.map((n, i) => [n.index, i]));
  const edges = () => {
    const pm = posOf();
    return props.connections
      .filter((c) => c.from !== c.to && pm.has(c.from) && pm.has(c.to))
      .map((c) => ({
        from: pm.get(c.from)!,
        to: pm.get(c.to)!,
        kind: c.kind,
        note: c.note,
        srcSec: c.from,
        dstSec: c.to,
      }));
  };
  const lanes = () => assignLanes(edges());
  const laneCount = () => {
    const ls = lanes();
    return ls.length ? Math.max(...ls) + 1 : 0;
  };
  // Gutter wide enough for the deepest lane's bow plus the arrowhead. The cubic
  // only bulges to ~3/4 of the control offset, so this leaves a little air.
  const gutter = () => LANE_BASE + Math.max(1, laneCount()) * LANE_STEP + 8;
  const width = () => LEFT_PAD + NODE_W + gutter();

  // How far this lane's curve bows out past the card's right edge.
  const laneX = (lane: number) => LEFT_PAD + NODE_W + LANE_BASE + lane * LANE_STEP;

  // Distinct kinds present, for the legend (color/dash carry the meaning now —
  // inline labels piled up and were unreadable, mirroring ArgumentVoiceMap).
  const kindsPresent = (): FlowConnection['kind'][] => {
    const seen = new Set<FlowConnection['kind']>();
    for (const e of edges()) seen.add(e.kind);
    // Statement edges speak the same relation language — fold their (mapped) kinds
    // into the one legend so section↔section and statement↔statement read alike.
    // `supports` is the exception (no section kin); it gets its own legend entry.
    for (const n of props.nodes)
      for (const l of stmtLinksOf(n))
        if (l.relation !== 'supports') seen.add(stmtRelKind(l.relation));
    return (Object.keys(KIND_COLOR) as FlowConnection['kind'][]).filter((k) => seen.has(k));
  };
  // `supports` rides its own evidential colour, so it needs its own legend entry.
  const hasSupports = (): boolean =>
    props.nodes.some((n) => stmtLinksOf(n).some((l) => l.relation === 'supports'));

  // Squared connector through the right gutter: out of the source's right edge,
  // a gently rounded corner into a long straight vertical run at the lane's x,
  // then a rounded corner back into the target's right edge (arrowhead points
  // cleanly left into the card). The radius is clamped so it never overshoots a
  // short horizontal or vertical leg.
  const edgePath = (c: FlowConnection, lane: number): string => {
    const x = laneX(lane);
    const y1 = edgeAnchorY(c.from, true);
    const y2 = edgeAnchorY(c.to, false);
    const rightX = LEFT_PAD + NODE_W;
    const dir = y2 >= y1 ? 1 : -1;
    const r = Math.min(CORNER_R, x - rightX, Math.abs(y2 - y1) / 2);
    return [
      `M ${rightX} ${y1}`,
      `L ${x - r} ${y1}`,
      `Q ${x} ${y1} ${x} ${y1 + dir * r}`,
      `L ${x} ${y2 - dir * r}`,
      `Q ${x} ${y2} ${x - r} ${y2}`,
      `L ${rightX} ${y2}`,
    ].join(' ');
  };

  const badgeCX = LEFT_PAD + 18;
  const titleX = LEFT_PAD + 38;

  return (
    <Show when={props.nodes.length > 0}>
      <div
        style={{
          width: '100%',
          'min-width': 0,
          'max-height': '520px',
          'overflow-x': 'auto',
          'overflow-y': 'auto',
          direction: 'ltr',
          border: '1px solid #ece9df',
          'border-radius': '8px',
          background: '#fdfcf9',
          'margin-top': '0.6rem',
          padding: '0.35rem 0.2rem',
        }}
      >
        <svg
          role="img"
          aria-label="Argument flow graph"
          width={width()}
          height={height()}
          viewBox={`0 0 ${width()} ${height()}`}
          style={{ display: 'block' }}
        >
          <defs>
            <For each={Object.entries(KIND_COLOR)}>
              {([kind, color]) => (
                <marker
                  id={`flow-arrow-${kind}`}
                  markerWidth="8"
                  markerHeight="8"
                  refX="6"
                  refY="3"
                  orient="auto"
                >
                  <path d="M 0 0 L 6 3 L 0 6 z" fill={color} />
                </marker>
              )}
            </For>
            <filter id="flow-card-shadow" x="-10%" y="-20%" width="120%" height="150%">
              <feDropShadow
                dx="0"
                dy="1"
                stdDeviation="1.4"
                flood-color="#3a3320"
                flood-opacity="0.12"
              />
            </filter>
          </defs>

          {/* Connectors (behind nodes). Hover the path for the kind + note. */}
          <For each={edges()}>
            {(c, i) => {
              const color = KIND_COLOR[c.kind];
              return (
                <path
                  d={edgePath(c, lanes()[i()])}
                  fill="none"
                  stroke={color}
                  stroke-width={1.5}
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-opacity={0.8}
                  stroke-dasharray={KIND_DASH[c.kind]}
                  marker-end={`url(#flow-arrow-${c.kind})`}
                >
                  <title>{`§${c.srcSec + 1} ${c.kind} §${c.dstSec + 1}${c.note ? ` — ${c.note}` : ''}`}</title>
                </path>
              );
            }}
          </For>

          {/* Nodes: rounded card + number badge + word-wrapped title. Laid out
              by ARRAY position (i) so a sugya-group subset is compact; the badge
              still shows the section's absolute daf number (n.index + 1). */}
          <For each={props.nodes}>
            {(n, i) => {
              const active = () => props.activeIndex === n.index;
              const cy = () => nodeY(i()) + NODE_H / 2;
              const lines = () => wrapTitle(n.title, TITLE_CHARS, TITLE_LINES);
              const select = () => props.onSelect(n.index);
              const exits = () => n.exits ?? [];
              const isOpen = () => openExits().has(n.index);
              return (
                <>
                  {/* biome-ignore lint/a11y/useSemanticElements: native <button> cannot be used inside an SVG diagram */}
                  <g
                    role="button"
                    tabindex={0}
                    style={{ cursor: 'pointer' }}
                    onClick={select}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        select();
                      }
                    }}
                  >
                    <title>{`${n.index + 1}. ${n.title} — click for voices`}</title>
                    <rect
                      x={LEFT_PAD}
                      y={nodeY(i())}
                      width={NODE_W}
                      height={NODE_H}
                      rx={10}
                      ry={10}
                      fill={active() ? '#fdf2f2' : '#ffffff'}
                      stroke={active() ? '#8a2a2b' : '#e4e0d4'}
                      stroke-width={active() ? 1.75 : 1}
                      filter="url(#flow-card-shadow)"
                    />
                    <circle
                      cx={badgeCX}
                      cy={cy()}
                      r={11}
                      fill={active() ? '#8a2a2b' : '#f2eee4'}
                      stroke={active() ? '#8a2a2b' : '#e4e0d4'}
                      stroke-width={1}
                    />
                    <text
                      x={badgeCX}
                      y={cy()}
                      text-anchor="middle"
                      dominant-baseline="central"
                      font-size="11"
                      font-weight="700"
                      font-family="system-ui, -apple-system, sans-serif"
                      fill={active() ? '#ffffff' : '#8a2a2b'}
                    >
                      {n.index + 1}
                    </text>
                    <For each={lines()}>
                      {(line, li) => (
                        <text
                          x={titleX}
                          y={cy() + (li() - (lines().length - 1) / 2) * LINE_H}
                          // Left-align the title block at titleX in BOTH languages. SVG
                          // text-anchor is direction-relative: with direction=rtl,
                          // anchor="start" pins the text's RIGHT edge to titleX so the
                          // title flows left over the number badge and clips at the card
                          // edge. anchor="end" pins the LEFT edge to titleX instead, so
                          // Hebrew sits to the right of the badge like the English does.
                          text-anchor={lang() === 'he' ? 'end' : 'start'}
                          dominant-baseline="central"
                          font-size="12"
                          font-weight="600"
                          font-family="system-ui, -apple-system, sans-serif"
                          fill="#2a2723"
                          direction={lang() === 'he' ? 'rtl' : 'ltr'}
                        >
                          {line}
                        </text>
                      )}
                    </For>
                  </g>
                  {/* Exit markers: collapsed ⤳N badge at the node's top-right →
                    click to expand a chip per off-node connection, in a band
                    reserved below the node (the layout reflows). */}
                  <Show when={exits().length}>
                    {/* biome-ignore lint/a11y/useSemanticElements: native <button> cannot be used inside an SVG diagram */}
                    <g
                      role="button"
                      tabindex={0}
                      style={{ cursor: 'pointer' }}
                      onClick={() => toggleExits(n.index)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleExits(n.index);
                        }
                      }}
                    >
                      <title>{`${exits().length} connection${exits().length > 1 ? 's' : ''} elsewhere — click to ${isOpen() ? 'hide' : 'show'}`}</title>
                      <rect
                        x={LEFT_PAD + NODE_W - BADGE_W - 7}
                        y={nodeY(i()) + 6}
                        width={BADGE_W}
                        height={BADGE_H}
                        rx={7}
                        ry={7}
                        fill={isOpen() ? MARKER_INK : '#ffffff'}
                        stroke={MARKER_INK}
                        stroke-width={1.25}
                      />
                      <text
                        x={LEFT_PAD + NODE_W - BADGE_W / 2 - 7}
                        y={nodeY(i()) + 6 + BADGE_H / 2 + 0.5}
                        text-anchor="middle"
                        dominant-baseline="central"
                        font-size="10"
                        font-weight="700"
                        font-family="system-ui, sans-serif"
                        fill={isOpen() ? '#ffffff' : MARKER_INK}
                      >
                        {`⤳ ${exits().length}`}
                      </text>
                    </g>
                    <Show when={isOpen()}>
                      <For each={exits()}>
                        {(ex, j) => {
                          const top = () => nodeY(i()) + NODE_H + EXIT_TOP + j() * EXIT_H;
                          const ch = EXIT_H - 3;
                          const midY = () => top() + ch / 2;
                          const chipX = LEFT_PAD + EXIT_INDENT;
                          const chipW = NODE_W - EXIT_INDENT - 6;
                          const accent = EXIT_FAMILY_COLOR[ex.family] ?? MARKER_INK;
                          const tag = EXIT_FAMILY_TAG[ex.family] ?? ex.family;
                          const tagW = tag.length * 5.4 + 12;
                          const tgt = linkTarget(ex.target);
                          const refMax = Math.max(8, Math.floor((chipW - tagW - 32) / 5.4));
                          const refText =
                            tgt.label.length > refMax
                              ? `${tgt.label.slice(0, refMax - 1)}…`
                              : tgt.label;
                          const clickable = !!props.onPickExit || tgt.navigable;
                          const inner = (
                            <>
                              <title>{`${ex.relation} — ${tgt.label}${tgt.navigable ? ' (open)' : ''}`}</title>
                              <rect
                                x={chipX}
                                y={top()}
                                width={chipW}
                                height={ch}
                                rx={6}
                                ry={6}
                                fill="#ffffff"
                                stroke="#e4e0d4"
                                stroke-width={1}
                              />
                              <rect x={chipX} y={top()} width={3} height={ch} fill={accent} />
                              <text
                                x={chipX + 11}
                                y={midY()}
                                dominant-baseline="central"
                                font-size="10"
                                fill="#9a948a"
                              >
                                ↗
                              </text>
                              <text
                                x={chipX + 22}
                                y={midY()}
                                dominant-baseline="central"
                                font-size="10.5"
                                font-weight="500"
                                font-family="system-ui, sans-serif"
                                fill="#2a2723"
                              >
                                {refText}
                              </text>
                              <rect
                                x={chipX + chipW - tagW - 5}
                                y={top() + 2.5}
                                width={tagW}
                                height={ch - 5}
                                rx={5}
                                ry={5}
                                fill={accent}
                                fill-opacity={0.14}
                              />
                              <text
                                x={chipX + chipW - tagW / 2 - 5}
                                y={midY()}
                                text-anchor="middle"
                                dominant-baseline="central"
                                font-size="8.5"
                                font-weight="650"
                                font-family="system-ui, sans-serif"
                                fill={accent}
                              >
                                {tag}
                              </text>
                            </>
                          );
                          if (!clickable) return <g>{inner}</g>;
                          return (
                            // biome-ignore lint/a11y/useSemanticElements: native <button> cannot be used inside an SVG diagram
                            <g
                              role="button"
                              tabindex={0}
                              style={{ cursor: 'pointer' }}
                              onClick={() => pickExit(ex)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  pickExit(ex);
                                }
                              }}
                            >
                              {inner}
                            </g>
                          );
                        }}
                      </For>
                    </Show>
                  </Show>
                  {/* Statement edges (under the nodes): response/resolution threads
                      on the LEFT rail, opposition brackets on the RIGHT gutter —
                      the spine.links drawn, folding dialectic (threads) + dispute
                      (bracket) into the one map. */}
                  <Show when={stmtLinksOf(n).length}>
                    <For each={stmtLinksOf(n)}>
                      {(lnk) => {
                        const stmts = stmtsOf(n);
                        const kf = stmts.findIndex((s) => s.id === lnk.from);
                        const kt = stmts.findIndex((s) => s.id === lnk.to);
                        if (kf < 0 || kt < 0 || kf === kt) return null;
                        const baseY = nodeY(i()) + NODE_H + exitsBandOf(n) + STMT_TOP;
                        const sh = STMT_H - 5;
                        const yC = (k: number) => baseY + k * STMT_H + sh / 2;
                        const sx = LEFT_PAD + STMT_INDENT;
                        const swNode = NODE_W - STMT_INDENT - STMT_RGUT;
                        const isSupport = lnk.relation === 'supports';
                        const relKind = stmtRelKind(lnk.relation);
                        const color = isSupport ? STMT_SUPPORTS_COLOR : KIND_COLOR[relKind];
                        const dash = isSupport ? undefined : KIND_DASH[relKind];
                        // Stagger concurrent edges of the same family so they don't
                        // overlap on one line: opposition brackets fan out into the
                        // right gutter, response threads into the left rail.
                        const isOpp = lnk.relation === 'opposes';
                        const ord = stmtLinksOf(n)
                          .filter((l) => (l.relation === 'opposes') === isOpp)
                          .indexOf(lnk);
                        if (isOpp) {
                          // Bracket on the right gutter joining the two disputed sides.
                          const bx = Math.min(
                            sx + swNode + STMT_RGUT - 2,
                            sx + swNode + 5 + ord * 3,
                          );
                          return (
                            <path
                              d={`M ${sx + swNode} ${yC(kf)} L ${bx} ${yC(kf)} L ${bx} ${yC(kt)} L ${sx + swNode} ${yC(kt)}`}
                              fill="none"
                              stroke={color}
                              stroke-width={1.5}
                              stroke-dasharray={dash}
                              stroke-linejoin="round"
                            />
                          );
                        }
                        // Thread on the left rail: the actor's statement back to the
                        // one it responds to / resolves / supports / cites.
                        const railX = Math.max(LEFT_PAD + 3, STMT_RAIL_X - (ord % 4) * 3);
                        return (
                          <path
                            d={`M ${sx} ${yC(kf)} L ${railX} ${yC(kf)} L ${railX} ${yC(kt)} L ${sx} ${yC(kt)}`}
                            fill="none"
                            stroke={color}
                            stroke-width={1.5}
                            stroke-linejoin="round"
                          />
                        );
                      }}
                    </For>
                  </Show>
                  {/* Nested statement nodes: the focused section's voices/moves,
                      indented under the node — the in-map drill-in. Click one to
                      select it (its detail renders below the map). */}
                  <Show when={stmtsOf(n).length}>
                    <For each={stmtsOf(n)}>
                      {(s, k) => {
                        const sTop = () =>
                          nodeY(i()) + NODE_H + exitsBandOf(n) + STMT_TOP + k() * STMT_H;
                        const sh = STMT_H - 5;
                        const sx = LEFT_PAD + STMT_INDENT;
                        const sw = NODE_W - STMT_INDENT - STMT_RGUT;
                        const accent = STMT_SIDE_COLOR[s.side ?? ''] ?? stmtRoleColor(s.role);
                        const sel = () => props.selectedStatementId === s.id;
                        const pickStmt = () => props.onSelectStatement?.(s.id);
                        const roleLabel = s.role.toUpperCase();
                        // Letterspaced sans caps for the role; budget the speaker
                        // around it + the side mark so a long name can't overflow.
                        const roleW = roleLabel.length * 6 + 13;
                        const speakerBudget = Math.max(
                          3,
                          Math.floor((sw - 14 - roleW - (s.side ? 14 : 8) - 6) / 6),
                        );
                        const speakerText =
                          (s.speaker || '').length > speakerBudget
                            ? `${(s.speaker || '').slice(0, speakerBudget - 1)}…`
                            : s.speaker || '';
                        return (
                          // biome-ignore lint/a11y/useSemanticElements: native <button> cannot be used inside an SVG diagram
                          <g
                            role="button"
                            tabindex={0}
                            style={{ cursor: 'pointer' }}
                            onClick={pickStmt}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                pickStmt();
                              }
                            }}
                          >
                            <title>{`${s.role}${s.speaker ? ` — ${s.speaker}` : ''}`}</title>
                            {/* Rounded card with a left accent stripe — the SVG analog
                                of CSS border-left: an accent-filled rounded rect under
                                a left-inset body rect of the SAME radius, so the stripe
                                wraps the rounded corners cleanly (no pinched tips), then
                                a hairline border outline on top. */}
                            <rect
                              x={sx}
                              y={sTop()}
                              width={sw}
                              height={sh}
                              rx={6}
                              ry={6}
                              fill={accent}
                            />
                            <rect
                              x={sx + STMT_STRIPE}
                              y={sTop()}
                              width={sw - STMT_STRIPE}
                              height={sh}
                              rx={6}
                              ry={6}
                              fill={sel() ? '#fdf2f2' : '#ffffff'}
                            />
                            <rect
                              x={sx}
                              y={sTop()}
                              width={sw}
                              height={sh}
                              rx={6}
                              ry={6}
                              fill="none"
                              stroke={sel() ? '#8a2a2b' : '#e7e2d6'}
                              stroke-width={sel() ? 1.5 : 1}
                            />
                            {/* Role — letterspaced sans caps, muted; the accent
                                stripe carries the colour, so the label stays quiet. */}
                            <text
                              x={sx + 13}
                              y={sTop() + sh / 2}
                              dominant-baseline="central"
                              font-size="8"
                              font-weight="600"
                              letter-spacing="0.07em"
                              font-family={STMT_FONT}
                              fill={stmtRoleColor(s.role)}
                              fill-opacity={0.78}
                            >
                              {roleLabel}
                            </text>
                            {/* Speaker — same sans as the section titles, in ink. */}
                            <text
                              x={sx + 13 + roleW}
                              y={sTop() + sh / 2}
                              dominant-baseline="central"
                              font-size="12"
                              font-family={STMT_FONT}
                              fill="#2a2520"
                            >
                              <title>{s.speaker || ''}</title>
                              {speakerText}
                            </text>
                            {/* Side — a quiet colored letter, not a filled badge. */}
                            <Show when={s.side}>
                              <text
                                x={sx + sw - 9}
                                y={sTop() + sh / 2}
                                text-anchor="middle"
                                dominant-baseline="central"
                                font-size="9.5"
                                font-weight="700"
                                font-family={STMT_FONT}
                                fill={STMT_SIDE_COLOR[s.side ?? ''] ?? '#888'}
                              >
                                {s.side}
                              </text>
                            </Show>
                          </g>
                        );
                      }}
                    </For>
                  </Show>
                </>
              );
            }}
          </For>
        </svg>
      </div>

      {/* Legend: color + dash → connection kind (only the kinds in use).
          Suppressed when the parent renders one shared legend for several
          stacked graphs (hideLegend). */}
      <Show when={!props.hideLegend && (kindsPresent().length > 0 || hasSupports())}>
        <div
          style={{
            display: 'flex',
            'flex-wrap': 'wrap',
            gap: '0.35rem 0.45rem',
            'margin-top': '0.55rem',
          }}
        >
          <For each={kindsPresent()}>
            {(kind) => (
              <span
                style={{
                  display: 'inline-flex',
                  'align-items': 'center',
                  gap: '0.35rem',
                  padding: '0.12rem 0.5rem',
                  background: '#faf8f3',
                  border: '1px solid #ece7db',
                  'border-radius': '999px',
                  'font-size': '0.66rem',
                  color: '#6b6661',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: '16px',
                    height: 0,
                    'border-top': `2px ${KIND_DASH[kind] ? 'dashed' : 'solid'} ${KIND_COLOR[kind]}`,
                  }}
                />
                {t(`link.rel.${kind}`)}
              </span>
            )}
          </For>
          {/* `supports` has no section kin — its own evidential legend entry. */}
          <Show when={hasSupports()}>
            <span
              style={{
                display: 'inline-flex',
                'align-items': 'center',
                gap: '0.35rem',
                padding: '0.12rem 0.5rem',
                background: '#faf8f3',
                border: '1px solid #ece7db',
                'border-radius': '999px',
                'font-size': '0.66rem',
                color: '#6b6661',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: '16px',
                  height: 0,
                  'border-top': `2px solid ${STMT_SUPPORTS_COLOR}`,
                }}
              />
              {t('stmt.rel.supports')}
            </span>
          </Show>
        </div>
      </Show>
    </Show>
  );
}
