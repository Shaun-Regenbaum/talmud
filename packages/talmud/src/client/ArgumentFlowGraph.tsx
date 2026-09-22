/** Compact argument maps. Geometry and both viewing modes live in @corpus/ui. */
import { GraphEdge } from '@corpus/ui/GraphEdge';
import {
  type GraphConnection,
  type GraphGroup,
  GraphLegend,
  type GraphNode,
  GraphView,
} from '@corpus/ui/GraphView';
import {
  CONNECTOR,
  CONNECTOR_CLEARANCE,
  routeConnector,
  assignLanes as sharedLanes,
} from '@corpus/ui/graph/geometry';
import { createMemo, createSignal, For, type JSX } from 'solid-js';
import { linkTarget } from '../lib/context/linkTarget';
import type { SectionExit } from '../lib/context/sectionExits';
import type { StatementLink, StatementNode } from '../lib/typing/statementSpine';
import { graphLabels } from './graphLabels';
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
  derived?: boolean;
}

export interface FlowNode {
  /** 0-based section index (matches connection from/to). */
  index: number;
  title: string;
  dimmed?: boolean;
  /** Off-node connections anchored to this section (cross-daf parallels, cites,
   *  pesukim, halacha) — rendered as a click-to-expand exit-marker band. The
   *  spine's links projected onto the section that owns them. */
  exits?: SectionExit[];
  /** This section's statement spine (voices/moves). Rendered as nested sub-nodes
   *  in an indented band below the node when it's the focused (active) section —
   *  the in-map drill-in. */
  statements?: StatementNode[];
  /** Local statement connections, drawn inside the expanded section. */
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
  isStatementDimmed?: (statement: StatementNode) => boolean;
}

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

const STMT_REL_AS_LINK: Record<string, FlowConnection['kind']> = {
  opposes: 'contrasts',
  'responds-to': 'continues',
  resolves: 'resolves',
  cites: 'cites',
  continues: 'continues',
};
export const stmtRelKind = (rel: string): FlowConnection['kind'] =>
  STMT_REL_AS_LINK[rel] ?? 'continues';
// Evidence points toward the claim it supports; it is not a dependency edge.
const STMT_SUPPORTS_COLOR = '#0891b2';
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
export const statementRole = (role: string): string =>
  t(`move.kind.${role in STMT_ROLE_COLOR ? role : 'other'}`);
export const statementRoleColor = (role: string): string =>
  STMT_ROLE_COLOR[role] ?? STMT_ROLE_COLOR.other;

const SIDE_COLOR: Record<string, string> = {
  A: '#1d4ed8',
  B: '#b91c1c',
  C: '#a16207',
  'support-A': '#1d4ed8',
  'support-B': '#b91c1c',
};
export const statementSideColor = (side?: string): string | undefined =>
  side ? SIDE_COLOR[side] : undefined;
const sideBadge = (side?: string): string | undefined => {
  if (!side || !statementSideColor(side)) return undefined;
  return side.startsWith('support-') ? t('graph.supportsSide', { side: side.slice(8) }) : side;
};

export function connectionKinds(connections: FlowConnection[]): FlowConnection['kind'][] {
  const seen = new Set<FlowConnection['kind']>();
  for (const c of connections) seen.add(c.kind);
  return (Object.keys(KIND_COLOR) as FlowConnection['kind'][]).filter((k) => seen.has(k));
}

/** Color + dash → kind legend. Exported so the overview can render ONE legend
 *  for several stacked graphs instead of repeating it under each. */
export function FlowLegend(props: { kinds: FlowConnection['kind'][] }): JSX.Element {
  return (
    <GraphLegend
      items={props.kinds.map((kind) => ({
        label: t(`link.rel.${kind}`),
        color: KIND_COLOR[kind],
        dash: KIND_DASH[kind],
      }))}
    />
  );
}

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

export const assignLanes = (
  connections: readonly Pick<FlowConnection, 'from' | 'to'>[],
): number[] => sharedLanes(connections.map((c) => ({ lo: c.from, hi: c.to })));
export const statementBandHeight = (count: number): number => (count ? 4 + count * 34 : 0);
export const statementColor = (relation: string): string =>
  relation === 'supports'
    ? STMT_SUPPORTS_COLOR
    : relation === 'responds-to'
      ? KIND_COLOR.resolves
      : KIND_COLOR[stmtRelKind(relation)];
export const statementLabel = (s: StatementNode): string =>
  s.summary || s.speaker || s.excerpt || statementRole(s.role);
export const statementGraphNode = (s: StatementNode, id = s.id): GraphNode => ({
  id,
  label: statementLabel(s),
  role: statementRole(s.role),
  color: statementRoleColor(s.role),
  badge: sideBadge(s.side),
  badgeColor: statementSideColor(s.side),
  detail: [s.speaker, s.summary, s.excerpt].filter(Boolean).join('\n'),
  direction: 'auto',
});
export const statementGraphEdges = (links: StatementLink[], prefix = ''): GraphConnection[] =>
  links.map((l, i) => ({
    id: `${prefix}edge:${i}`,
    kindLabel: t(l.relation === 'continues' ? 'link.rel.continues' : `dafvoices.rel.${l.relation}`),
    from: `${prefix}${l.from}`,
    to: `${prefix}${l.to}`,
    label: `${t(l.relation === 'continues' ? 'link.rel.continues' : `dafvoices.rel.${l.relation}`)}${l.note ? ` · ${l.note}` : ''}`,
    color: statementColor(l.relation),
    provenance: t(l.source === 'voices' ? 'graph.source.voices' : 'graph.source.roles'),
    dash: l.relation === 'opposes' ? KIND_DASH.contrasts : undefined,
  }));

/** SVG adapter for the tractate map's existing page and rabbi annotations. */
export function StatementBand(props: {
  statements: StatementNode[];
  links: StatementLink[];
  nodeX: number;
  nodeW: number;
  topY: number;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}): JSX.Element {
  const edges = createMemo(() =>
    props.links
      .map((l) => ({
        l,
        from: props.statements.findIndex((s) => s.id === l.from),
        to: props.statements.findIndex((s) => s.id === l.to),
      }))
      .filter((e) => e.from >= 0 && e.to >= 0 && e.from !== e.to),
  );
  const lanes = createMemo(() => assignLanes(edges()));
  const gutter = () => CONNECTOR_CLEARANCE + Math.max(0, ...lanes()) * CONNECTOR.lane + 6;
  const x = () => props.nodeX + gutter();
  const w = () => Math.max(150, props.nodeW - gutter() - 4);
  const y = (i: number) => props.topY + 4 + i * 34;
  return (
    <>
      <For each={edges()}>
        {(e, i) => (
          <GraphEdge
            path={
              routeConnector(
                { x: x(), y: y(e.from) + 15 },
                { x: x(), y: y(e.to) + 15 },
                'left',
                lanes()[i()],
              ).path
            }
            color={statementColor(e.l.relation)}
            label={t(
              e.l.relation === 'continues' ? 'link.rel.continues' : `dafvoices.rel.${e.l.relation}`,
            )}
            dash={e.l.relation === 'opposes' ? KIND_DASH.contrasts : undefined}
          />
        )}
      </For>
      <For each={props.statements}>
        {(s, i) => {
          const role = () => statementRole(s.role),
            roleW = () => Math.min(90, role().length * 5.4 + 8);
          return (
            <g>
              <rect
                x={x()}
                y={y(i())}
                width={w()}
                height={30}
                rx={6}
                fill={props.selectedId === s.id ? '#fdf2f2' : '#fff'}
                stroke={props.selectedId === s.id ? '#8a2a2b' : '#e4e0d4'}
              />
              <path
                d={`M ${x() + 2} ${y(i()) + 6} V ${y(i()) + 24}`}
                stroke={statementRoleColor(s.role)}
                stroke-width={3}
                stroke-linecap="round"
              />
              {/* biome-ignore lint/a11y/useSemanticElements: SVG labels need an SVG hit target */}
              <g
                role="button"
                tabindex={0}
                aria-label={statementLabel(s)}
                style={{ cursor: 'pointer' }}
                onClick={() => props.onSelect?.(s.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    props.onSelect?.(s.id);
                  }
                }}
              >
                <title>{`${role()} · ${statementLabel(s)}`}</title>
                <rect x={x()} y={y(i())} width={w()} height={30} fill="transparent" />
                <text x={x() + 9} y={y(i()) + 19} font-size="10" fill={statementRoleColor(s.role)}>
                  {wrapTitle(role(), 15, 1)[0]}
                </text>
                <text
                  x={x() + 9 + roleW()}
                  y={y(i()) + 19}
                  font-size="12"
                  fill="#2a2723"
                  direction={lang() === 'he' ? 'rtl' : 'ltr'}
                  text-anchor={lang() === 'he' ? 'end' : 'start'}
                >
                  {
                    wrapTitle(
                      statementLabel(s),
                      Math.max(8, Math.floor((w() - roleW() - 22) / 6.5)),
                      1,
                    )[0]
                  }
                </text>
              </g>
            </g>
          );
        }}
      </For>
    </>
  );
}

export default function ArgumentFlowGraph(props: Props): JSX.Element {
  const [openExits, setOpenExits] = createSignal(new Set<number>());
  const [closed, setClosed] = createSignal<number | null>(null);
  const groups = createMemo<GraphGroup[]>(() =>
    props.nodes.map((n) => ({
      id: `section:${n.index}`,
      label: n.title,
      badge: String(n.index + 1),
      selected: n.index === props.activeIndex,
      dimmed: n.dimmed,
      expanded: n.index === props.activeIndex && closed() !== n.index,
      direction: 'auto',
      children: (n.statements ?? []).map((s) => ({
        ...statementGraphNode(s, `section:${n.index}:statement:${s.id}`),
        selected: s.id === props.selectedStatementId,
        dimmed: props.isStatementDimmed?.(s),
      })),
      actions: (n.exits ?? []).map((ex, i) => ({
        id: `section:${n.index}:exit:${i}`,
        label: linkTarget(ex.target).label,
        role: t(`link.rel.${ex.relation}`),
        color: KIND_COLOR[ex.relation as FlowConnection['kind']] ?? KIND_COLOR.cites,
        direction: 'auto',
      })),
      actionsExpanded: openExits().has(n.index),
      actionsLabel: t('graph.connections', { count: String(n.exits?.length ?? 0) }),
    })),
  );
  const edges = createMemo<GraphConnection[]>(() => [
    ...props.connections.map((c, i) => ({
      id: `section-edge:${i}`,
      kindLabel: t(`link.rel.${c.kind}`),
      from: `section:${c.from}`,
      to: `section:${c.to}`,
      label: `${t(`link.rel.${c.kind}`)}${c.note ? ` · ${c.note}` : ''}`,
      color: KIND_COLOR[c.kind],
      dash: KIND_DASH[c.kind] ?? (c.derived ? '2 3' : undefined),
      provenance: c.derived ? t('graph.source.roles') : undefined,
    })),
    ...props.nodes.flatMap((n) =>
      statementGraphEdges(n.statementLinks ?? [], `section:${n.index}:statement:`),
    ),
  ]);
  const select = (item: GraphNode) => {
    const match = item.id.match(/^section:(\d+)(?::(statement|exit):(.+))?$/);
    if (!match) return;
    const index = Number(match[1]);
    if (match[2] === 'statement') {
      if (index !== props.activeIndex) props.onSelect(index);
      props.onSelectStatement?.(match[3]);
      return;
    }
    if (match[2] === 'exit') {
      const ex = props.nodes.find((n) => n.index === index)?.exits?.[Number(match[3])];
      if (!ex) return;
      if (props.onPickExit) props.onPickExit(ex);
      else {
        const target = linkTarget(ex.target);
        if (target.href) {
          if (target.external) window.open(target.href, '_blank', 'noopener');
          else window.location.href = target.href;
        }
      }
      return;
    }
    setClosed(index === props.activeIndex && closed() !== index ? index : null);
    props.onSelect(index);
  };
  return (
    <GraphView
      groups={groups()}
      edges={edges()}
      labels={graphLabels()}
      hideLegend={props.hideLegend}
      direction={lang() === 'he' ? 'rtl' : 'ltr'}
      onSelect={select}
      onToggleActions={(g) => {
        const index = Number(g.id.split(':')[1]);
        setOpenExits((prev) => {
          const next = new Set(prev);
          if (next.has(index)) next.delete(index);
          else next.add(index);
          return next;
        });
      }}
    />
  );
}
