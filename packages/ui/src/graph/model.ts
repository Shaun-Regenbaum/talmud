import {
  assignLanes,
  type Box,
  CONNECTOR,
  CONNECTOR_CLEARANCE,
  roundedPath,
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
  /** Long explanation on the passage board; compact rows keep only the label. */
  summary?: string;
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
  measure?: (text: string, bold: boolean) => number,
): GraphLayout {
  if (horizontal) return layoutBoard(groups, edges, measure);
  const nodes: PositionedNode[] = [],
    frames: PositionedGroup[] = [];
  const shown = new Set<string>();
  const localGroup = new Map<string, string>();
  for (const group of groups) {
    shown.add(group.id);
    for (const child of group.expanded ? (group.children ?? []) : []) {
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
  for (const group of groups) {
    const children = group.expanded ? (group.children ?? []) : [];
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
    const top = y;
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
    y += GRAPH_DENSITY.groupGap;
  }
  const byId = new Map(nodes.map((n) => [n.node.id, n]));
  const sideFor = (e: GraphConnection): Side => (local(e) ? 'left' : 'right');
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
    const outside = local(e) ? undefined : Math.max(...nodes.map((n) => n.x + n.width));
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

/** A passage reads across section columns, then down the statements in each one.
 * Source order determines placement. Only supplied relationships become arrows. */
function layoutBoard(
  groups: readonly GraphGroup[],
  edges: readonly GraphConnection[],
  measure?: (text: string, bold: boolean) => number,
): GraphLayout {
  const owner = new Map<string, string>();
  const order = new Map<string, number>();
  for (const [i, group] of groups.entries()) {
    for (const n of [
      group,
      ...(group.children ?? []),
      ...(group.actionsExpanded ? (group.actions ?? []) : []),
    ]) {
      owner.set(n.id, group.id);
      order.set(n.id, i);
    }
  }
  const valid = edges.filter((e) => e.from !== e.to && owner.has(e.from) && owner.has(e.to));
  const local = (e: GraphConnection) => owner.get(e.from) === owner.get(e.to);
  const outer = valid.filter((e) => !local(e));
  const lanes = assignLanes(outer.map((e) => ({ lo: order.get(e.from)!, hi: order.get(e.to)! })));
  const top = 42 + (lanes.length ? CONNECTOR_CLEARANCE + Math.max(...lanes) * CONNECTOR.lane : 0);
  const nodes: PositionedNode[] = [],
    frames: PositionedGroup[] = [];
  const localLanes = new Map<string, number>();
  const lineCount = (text: string, width: number, bold: boolean) => {
    let lines = 1,
      line = '';
    const size = (s: string) => measure?.(s, bold) ?? s.length * 7.2;
    for (const word of text.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && size(next) > width) {
        lines++;
        line = word;
      } else line = next;
      if (size(line) > width) {
        const chunks = Math.ceil(size(line) / width);
        lines += chunks - 1;
        line = '';
      }
    }
    return lines;
  };
  const height = (n: GraphNode, width: number, header = false) =>
    Math.max(
      header ? 68 : 62,
      18 +
        lineCount(
          n.label,
          width - (header ? ((n as GraphGroup).actions?.length ? 116 : 64) : 24),
          header || !!n.summary,
        ) *
          17 +
        (!header && (n.role || n.badge) ? 18 : 0) +
        (header && n.reference ? 18 : 0) +
        (header && n.role ? 18 : 0) +
        (n.summary ? 6 + lineCount(n.summary, width - 24, false) * 17 : 0) +
        (n.description ? 32 : 0) +
        (n.annotation ? 18 : 0),
    );
  const headerHeight = Math.max(68, ...groups.map((g) => height(g, 292, true)));
  let x = 16,
    bottom = top + headerHeight;
  for (const group of groups) {
    const children = group.children ?? [];
    const members = [...children, ...(group.actionsExpanded ? (group.actions ?? []) : [])];
    const localEdges = valid.filter((e) => local(e) && owner.get(e.from) === group.id);
    const ranks = new Map([group, ...members].map((n, i) => [n.id, i]));
    const assigned = assignLanes(
      localEdges.map((e) => ({ lo: ranks.get(e.from)!, hi: ranks.get(e.to)! })),
    );
    localEdges.forEach((e, i) => {
      localLanes.set(e.id, assigned[i]);
    });
    const gutter =
      CONNECTOR_CLEARANCE + (assigned.length ? Math.max(...assigned) * CONNECTOR.lane : 0) + 8;
    const columnWidth = Math.max(292, 240 + gutter);
    if (localEdges.some((e) => e.from === group.id || e.to === group.id)) x += gutter;
    nodes.push({
      node: group,
      group: group.id,
      header: true,
      action: false,
      x,
      y: top,
      width: columnWidth,
      height: headerHeight,
    });
    let y = top + headerHeight + 14;
    members.forEach((node, i) => {
      const h = height(node, columnWidth - gutter);
      nodes.push({
        node,
        group: group.id,
        header: false,
        action: i >= children.length,
        x: x + gutter,
        y,
        width: columnWidth - gutter,
        height: h,
      });
      y += h + 10;
    });
    frames.push({ group, x: x - 7, y: top - 7, width: columnWidth + 14, height: y - top + 4 });
    bottom = Math.max(bottom, y + 8);
    x += columnWidth + 48;
  }
  const byId = new Map(nodes.map((n) => [n.node.id, n]));
  const portOffset = (id: string, edge: GraphConnection) => {
    const siblings = valid.filter(
      (e) => local(e) === local(edge) && (e.from === id || e.to === id),
    );
    const node = byId.get(id)!;
    const available =
      local(edge) || !node.header ? Math.min(16, node.height - 32) : node.width - 48;
    const step = Math.min(8, available / Math.max(1, siblings.length - 1));
    return (siblings.indexOf(edge) - (siblings.length - 1) / 2) * step;
  };
  const routed = valid.map((e) => {
    const a = byId.get(e.from)!,
      b = byId.get(e.to)!;
    if (local(e))
      return {
        edge: e,
        path: routeConnector(
          { x: a.x, y: a.y + a.height / 2 + portOffset(a.node.id, e) },
          { x: b.x, y: b.y + b.height / 2 + portOffset(b.node.id, e) },
          'left',
          localLanes.get(e.id)!,
          Math.min(a.x, b.x),
        ).path,
      };
    const rail = top - CONNECTOR_CLEARANCE - lanes[outer.indexOf(e)] * CONNECTOR.lane;
    const ax = a.header
      ? a.x + a.width / 2 + portOffset(a.node.id, e)
      : a.x + a.width + CONNECTOR_CLEARANCE;
    const bx = b.header
      ? b.x + b.width / 2 + portOffset(b.node.id, e)
      : b.x + b.width + CONNECTOR_CLEARANCE;
    const from = a.header
      ? { x: ax, y: a.y }
      : { x: a.x + a.width, y: a.y + a.height / 2 + portOffset(a.node.id, e) };
    const to = b.header
      ? { x: bx, y: b.y - CONNECTOR.gap }
      : { x: b.x + b.width + CONNECTOR.gap, y: b.y + b.height / 2 + portOffset(b.node.id, e) };
    const points = [
      from,
      ...(!a.header ? [{ x: ax, y: from.y }] : []),
      { x: ax, y: rail },
      { x: bx, y: rail },
      ...(!b.header ? [{ x: bx, y: to.y }] : []),
      to,
    ];
    return { edge: e, path: roundedPath(points) };
  });
  return {
    nodes,
    groups: frames,
    edges: routed,
    width: Math.max(320, x - 18),
    height: bottom + 16,
  };
}
