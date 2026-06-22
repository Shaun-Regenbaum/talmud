/**
 * The #howitworks centerpiece: the live registry DAG as an interactive SVG.
 * Columns are dependency depth (sources -> marks -> enrichments -> synthesis);
 * connectors are declared `dependencies`, routed orthogonally (never diagonal)
 * with the shared edge router. Hovering or selecting a node lights its whole
 * dependency chain and dims the rest; clicking opens its deep-dive in the
 * parent. A focus-by-family chip row narrows the ~60-node "everything" view to
 * one mark family at a time.
 *
 * This renders DEFINITIONS (what connects to what), not cached instances — it
 * never calls /api/run.
 */
import { createMemo, createSignal, For, type JSX, Show } from 'solid-js';
import { orthogonalEdgePath } from './flow/orthogonalEdge';
import { ancestorsOf, connectedClosure, type Graph, type GraphNode } from './howItWorks/graphModel';
import { ACCENTS } from './sidebar/primitives';

const NODE_W = 184;
const NODE_H = 30;
const ROW_GAP = 9;
const COL_GAP = 118;
const PAD = 16;

// Mark ids whose accent lives under a slightly different key in ACCENTS.
const FAMILY_ALIAS: Record<string, string> = { pesukim: 'pesuk', places: 'place' };

export function familyColor(family: string): string {
  if (family === 'source') return '#6b7280';
  const key = FAMILY_ALIAS[family] ?? family;
  return (ACCENTS as Record<string, string>)[key] ?? '#64748b';
}

const arrowId = (color: string): string => `hiw-arrow-${color.replace('#', '')}`;
const truncate = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

interface Props {
  graph: Graph;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Mark family to focus, or null for the whole graph. */
  focusFamily: string | null;
}

interface Placed {
  node: GraphNode;
  x: number;
  y: number;
}

export function HowItWorksGraph(props: Props): JSX.Element {
  const [hovered, setHovered] = createSignal<string | null>(null);

  // Nodes to show: everything, or one family plus the inputs it's built from.
  const shownNodes = createMemo<GraphNode[]>(() => {
    const f = props.focusFamily;
    if (!f) return props.graph.nodes;
    const keep = new Set<string>();
    for (const n of props.graph.nodes) {
      if (n.family !== f) continue;
      keep.add(n.id);
      for (const a of ancestorsOf(props.graph, n.id)) keep.add(a);
    }
    return props.graph.nodes.filter((n) => keep.has(n.id));
  });

  // Column layout by dependency depth; compact x so empty layers leave no gap.
  const layout = createMemo(() => {
    const nodes = shownNodes();
    const shownSet = new Set(nodes.map((n) => n.id));
    const byLayer = new Map<number, GraphNode[]>();
    for (const n of nodes) {
      const arr = byLayer.get(n.layer);
      if (arr) arr.push(n);
      else byLayer.set(n.layer, [n]);
    }
    const layers = [...byLayer.keys()].sort((a, b) => a - b);
    const placed = new Map<string, Placed>();
    let maxRows = 0;
    layers.forEach((L, col) => {
      const arr = (byLayer.get(L) as GraphNode[]).slice().sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'source' ? -1 : 1;
        if (a.family !== b.family) return a.family < b.family ? -1 : 1;
        return a.id < b.id ? -1 : 1;
      });
      maxRows = Math.max(maxRows, arr.length);
      arr.forEach((node, row) => {
        placed.set(node.id, {
          node,
          x: PAD + col * (NODE_W + COL_GAP),
          y: PAD + row * (NODE_H + ROW_GAP),
        });
      });
    });
    const edges = props.graph.edges.filter((e) => shownSet.has(e.from) && shownSet.has(e.to));
    const width = PAD * 2 + layers.length * NODE_W + Math.max(0, layers.length - 1) * COL_GAP;
    const height = PAD * 2 + maxRows * (NODE_H + ROW_GAP);
    const colors = new Set<string>();
    for (const e of edges) colors.add(familyColor((placed.get(e.to) as Placed).node.family));
    return { placed, edges, width, height: Math.max(height, 120), colors: [...colors] };
  });

  // What stays lit: the connected chain through the active (hovered|selected)
  // node. Null = nothing active, everything full-strength.
  const litSet = createMemo<Set<string> | null>(() => {
    const active = hovered() ?? props.selectedId;
    return active ? connectedClosure(props.graph, active) : null;
  });
  const nodeLit = (id: string): boolean => {
    const lit = litSet();
    return !lit || lit.has(id);
  };
  const edgeLit = (from: string, to: string): boolean => {
    const lit = litSet();
    return !lit || (lit.has(from) && lit.has(to));
  };

  return (
    <div
      style={{
        border: '1px solid var(--line)',
        'border-radius': '10px',
        background: '#fcfbf8',
        overflow: 'auto',
        'max-height': '74vh',
      }}
    >
      <svg
        width={layout().width}
        height={layout().height}
        viewBox={`0 0 ${layout().width} ${layout().height}`}
        role="img"
        aria-label="Producer dependency graph"
        style={{ display: 'block', 'min-width': '100%' }}
      >
        <defs>
          <For each={layout().colors}>
            {(color) => (
              <marker
                id={arrowId(color)}
                viewBox="0 0 6 6"
                refX="5"
                refY="3"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 6 3 L 0 6 z" fill={color} />
              </marker>
            )}
          </For>
        </defs>

        {/* Connectors behind the nodes. */}
        <For each={layout().edges}>
          {(e) => {
            const a = (): Placed => layout().placed.get(e.from) as Placed;
            const b = (): Placed => layout().placed.get(e.to) as Placed;
            const color = (): string => familyColor(b().node.family);
            const lit = (): boolean => edgeLit(e.from, e.to);
            return (
              <Show when={a() && b()}>
                <path
                  d={orthogonalEdgePath(
                    { x: a().x, y: a().y, w: NODE_W, h: NODE_H },
                    { x: b().x, y: b().y, w: NODE_W, h: NODE_H },
                  )}
                  fill="none"
                  stroke={color()}
                  stroke-width={lit() ? 1.8 : 1.1}
                  stroke-dasharray={e.target ? '3 3' : undefined}
                  marker-end={`url(#${arrowId(color())})`}
                  opacity={lit() ? (litSet() ? 0.95 : 0.5) : 0.08}
                />
              </Show>
            );
          }}
        </For>

        {/* Nodes. */}
        <For each={[...layout().placed.values()]}>
          {(p) => {
            const n = p.node;
            const color = familyColor(n.family);
            const isSel = (): boolean => props.selectedId === n.id;
            const lit = (): boolean => nodeLit(n.id);
            const fill = (): string =>
              n.kind === 'source' ? '#eef1ee' : isSel() ? color : '#ffffff';
            const textColor = (): string =>
              n.kind === 'source' ? '#475569' : isSel() ? '#fff' : '#1f2937';
            return (
              // biome-ignore lint/a11y/useSemanticElements: native <button> cannot be used inside an SVG diagram
              <g
                role="button"
                tabindex={0}
                aria-pressed={isSel()}
                aria-label={`${n.kind} ${n.id}`}
                style={{ cursor: 'pointer', opacity: lit() ? 1 : 0.22 }}
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(n.id)}
                onBlur={() => setHovered(null)}
                onClick={() => props.onSelect(isSel() ? null : n.id)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    props.onSelect(isSel() ? null : n.id);
                  }
                }}
              >
                <title>{n.id}</title>
                <rect
                  x={p.x}
                  y={p.y}
                  width={NODE_W}
                  height={NODE_H}
                  rx={n.kind === 'source' ? 14 : 6}
                  fill={fill()}
                  stroke={color}
                  stroke-width={isSel() ? 2 : n.kind === 'enrichment' ? 1 : 1.4}
                  stroke-dasharray={n.kind === 'enrichment' && !isSel() ? '4 2' : undefined}
                />
                <text
                  x={p.x + NODE_W / 2}
                  y={p.y + NODE_H / 2}
                  text-anchor="middle"
                  dominant-baseline="central"
                  font-size="11.5"
                  font-family="ui-monospace, SFMono-Regular, Menlo, monospace"
                  fill={textColor()}
                >
                  {truncate(n.id, 24)}
                </text>
              </g>
            );
          }}
        </For>
      </svg>
    </div>
  );
}

/** Legend: what the node shapes/colors mean. Rendered once beside the graph. */
export function GraphLegend(): JSX.Element {
  const item = (swatch: JSX.Element, label: string): JSX.Element => (
    <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '0.35rem' }}>
      {swatch}
      {label}
    </span>
  );
  const box = (style: JSX.CSSProperties): JSX.Element => (
    <span
      style={{
        width: '16px',
        height: '11px',
        'border-radius': '3px',
        display: 'inline-block',
        ...style,
      }}
    />
  );
  return (
    <div
      style={{
        display: 'flex',
        'flex-wrap': 'wrap',
        gap: '0.45rem 1rem',
        'font-size': '0.7rem',
        color: 'var(--muted)',
        'margin-top': '0.5rem',
      }}
    >
      {item(box({ background: '#eef1ee', border: '1px solid #6b7280' }), 'source input')}
      {item(box({ background: '#fff', border: '1.4px solid #8a2a2b' }), 'mark (discovers anchors)')}
      {item(
        box({ background: '#fff', border: '1px dashed #8a2a2b' }),
        'enrichment (inherits / aggregates)',
      )}
      {item(<span style={{ color: 'var(--muted)' }}>– – –</span>, 'edge to its target mark')}
      <span>hover a node to trace its dependency chain · click for the deep-dive</span>
    </div>
  );
}
