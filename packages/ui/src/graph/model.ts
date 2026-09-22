import {
  assignLanes,
  type Box,
  CONNECTOR,
  CONNECTOR_CLEARANCE,
  routeConnector,
  type Side,
} from './geometry';

export interface GraphNode {
  id: string;
  label: string;
  role?: string;
  color?: string;
  badge?: string;
  badgeColor?: string;
  description?: string;
  annotation?: string;
  detail?: string;
  reference?: string;
  selected?: boolean;
  dimmed?: boolean;
  /** No invented content: a node can expose only the detail supplied by its host. */
  direction?: 'ltr' | 'rtl' | 'auto';
}
export interface GraphGroup extends GraphNode {
  children?: GraphNode[];
  expanded?: boolean;
  actions?: GraphNode[];
  actionsExpanded?: boolean;
  actionsLabel?: string;
}
export interface GraphConnection {
  id: string;
  kindLabel?: string;
  from: string;
  to: string;
  label: string;
  color: string;
  dash?: string;
  provenance?: string;
  arrow?: boolean;
}
export interface PositionedNode extends Box {
  node: GraphNode;
  group: string;
  header: boolean;
  action: boolean;
}
export interface PositionedGroup extends Box {
  group: GraphGroup;
}
export interface RoutedConnection {
  edge: GraphConnection;
  path: string;
}
export interface GraphLayout {
  nodes: PositionedNode[];
  groups: PositionedGroup[];
  edges: RoutedConnection[];
  width: number;
  height: number;
}
export const GRAPH_DENSITY = { row: 30, header: 40, gap: 4, groupGap: 8, pad: 8 } as const;

/** C layout: statements stay in source order; local edges are inside the section. */
export function layoutGraph(
  groups: readonly GraphGroup[],
  edges: readonly GraphConnection[],
  width: number,
  horizontal = false,
): GraphLayout {
  const nodes: PositionedNode[] = [],
    frames: PositionedGroup[] = [];
  const flatHorizontal =
    horizontal && groups.every((g) => !g.children?.length && !g.actionsExpanded);
  const shown = new Set<string>();
  const localGroup = new Map<string, string>();
  for (const group of groups) {
    shown.add(group.id);
    for (const child of horizontal || group.expanded ? (group.children ?? []) : []) {
      shown.add(child.id);
      localGroup.set(child.id, group.id);
    }
    if (group.actionsExpanded)
      for (const action of group.actions ?? []) {
        shown.add(action.id);
        localGroup.set(action.id, group.id);
      }
  }
  const valid = edges.filter((e) => e.from !== e.to && shown.has(e.from) && shown.has(e.to));
  const local = (e: GraphConnection) =>
    localGroup.has(e.from) && localGroup.get(e.from) === localGroup.get(e.to);
  const outer = valid.filter((e) => !local(e));
  const nodeOrder = new Map([...shown].map((id, i) => [id, i]));
  const laneOf = (es: GraphConnection[]) =>
    assignLanes(es.map((e) => ({ lo: nodeOrder.get(e.from)!, hi: nodeOrder.get(e.to)! })));
  const outerLanes = laneOf(outer),
    laneCount = outerLanes.length ? Math.max(...outerLanes) + 1 : 0;
  const outerGutter = laneCount ? CONNECTOR_CLEARANCE + laneCount * CONNECTOR.lane + 8 : 8;
  let y: number = GRAPH_DENSITY.pad;
  const canvasWidth = Math.max(300, width);
  const localLanes = new Map<string, number>();
  for (const [groupIndex, group] of groups.entries()) {
    const children = horizontal || group.expanded ? (group.children ?? []) : [];
    const actions = group.actionsExpanded ? (group.actions ?? []) : [];
    const members = [...children, ...actions];
    const es = valid.filter((e) => local(e) && localGroup.get(e.from) === group.id);
    const lanes = laneOf(es);
    es.forEach((e, i) => {
      localLanes.set(e.id, lanes[i]);
    });
    const count = lanes.length ? Math.max(...lanes) + 1 : 0;
    const gutter = CONNECTOR_CLEARANCE + Math.max(0, count - 1) * CONNECTOR.lane + 8;
    const extraHeight = (node: GraphNode) =>
      (node.description ? 32 : 0) + (node.annotation ? 18 : 0);
    const headerHeight = GRAPH_DENSITY.header + extraHeight(group);
    const horizontalHeight = 64 + Math.max(extraHeight(group), ...members.map(extraHeight));
    const top = y;
    if (flatHorizontal) {
      nodes.push({
        node: group,
        group: group.id,
        header: true,
        action: false,
        x: 8 + groupIndex * 254,
        y: 8,
        width: 230,
        height: horizontalHeight,
      });
      y = Math.max(y, 8 + horizontalHeight + outerGutter);
    } else if (horizontal) {
      const gx = outerGutter + 8;
      nodes.push({
        node: group,
        group: group.id,
        header: true,
        action: false,
        x: gx,
        y,
        width: 210,
        height: horizontalHeight,
      });
      members.forEach((node, i) => {
        nodes.push({
          node,
          group: group.id,
          header: false,
          action: i >= children.length,
          x: gx + 232 + i * 264,
          y,
          width: 240,
          height: horizontalHeight,
        });
      });
      y += horizontalHeight + (count ? gutter : 8);
      frames.push({
        group,
        x: gx - 4,
        y: top - 4,
        width: members.length ? 232 + members.length * 264 - 20 + 8 : 218,
        height: y - top + 8,
      });
    } else {
      const groupWidth = Math.max(240, canvasWidth - outerGutter - 16);
      nodes.push({
        node: group,
        group: group.id,
        header: true,
        action: false,
        x: 8,
        y,
        width: groupWidth,
        height: headerHeight,
      });
      y += headerHeight;
      if (members.length) y += GRAPH_DENSITY.gap;
      members.forEach((node, i) => {
        nodes.push({
          node,
          group: group.id,
          header: false,
          action: i >= children.length,
          x: 8 + gutter,
          y,
          width: Math.max(160, groupWidth - gutter - 4),
          height: GRAPH_DENSITY.row + extraHeight(node),
        });
        y += GRAPH_DENSITY.row + extraHeight(node) + GRAPH_DENSITY.gap;
      });
      frames.push({ group, x: 4, y: top - 4, width: groupWidth + 8, height: y - top + 4 });
    }
    y += GRAPH_DENSITY.groupGap;
  }
  const byId = new Map(nodes.map((n) => [n.node.id, n]));
  const sideFor = (e: GraphConnection): Side =>
    flatHorizontal
      ? 'bottom'
      : horizontal
        ? local(e)
          ? 'bottom'
          : 'left'
        : local(e)
          ? 'left'
          : 'right';
  const ports = new Map<string, string[]>();
  for (const e of valid)
    for (const id of [e.from, e.to]) {
      const key = `${id}:${sideFor(e)}`;
      const list = ports.get(key) ?? [];
      list.push(e.id);
      ports.set(key, list);
    }
  const port = (id: string, e: GraphConnection) => {
    const n = byId.get(id)!,
      side = sideFor(e),
      list = ports.get(`${id}:${side}`)!;
    const available =
      side === 'left' || side === 'right' ? Math.min(8, n.height - 16) : n.width - 16;
    const step = Math.min(5, available / Math.max(1, list.length - 1));
    const offset = (list.indexOf(e.id) - (list.length - 1) / 2) * step;
    return side === 'left' || side === 'right'
      ? { x: side === 'left' ? n.x : n.x + n.width, y: n.y + n.height / 2 + offset }
      : { x: n.x + n.width / 2 + offset, y: side === 'top' ? n.y : n.y + n.height };
  };
  let right = Math.max(canvasWidth, ...nodes.map((n) => n.x + n.width + 8));
  const routed = valid.map((e) => {
    const from = port(e.from, e),
      to = port(e.to, e),
      side = sideFor(e);
    const outside = local(e)
      ? undefined
      : flatHorizontal
        ? Math.max(...nodes.map((n) => n.y + n.height))
        : horizontal
          ? Math.min(...nodes.map((n) => n.x))
          : Math.max(...nodes.map((n) => n.x + n.width));
    const route = routeConnector(
      from,
      to,
      side,
      local(e) ? localLanes.get(e.id)! : outerLanes[outer.indexOf(e)],
      outside,
    );
    right = Math.max(right, route.bounds.x + route.bounds.width + 8);
    y = Math.max(y, route.bounds.y + route.bounds.height + 8);
    return { edge: e, path: route.path };
  });
  return { nodes, groups: frames, edges: routed, width: right, height: y + GRAPH_DENSITY.pad };
}
