import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  type JSX,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import { GraphConnectionDetails } from './GraphConnectionDetails';
import { GraphEdge } from './GraphEdge';
import { type GraphConnection, type GraphGroup, type GraphNode, layoutGraph } from './graph/model';
import { createHoverIntent } from './hoverIntent';
import './graph.css';

export type { GraphConnection, GraphGroup, GraphNode } from './graph/model';
export interface GraphLabels {
  title: string;
  expand: string;
  close: string;
  clearConnection: string;
  vertical: string;
  horizontal: string;
  zoomIn: string;
  zoomOut: string;
  fit: string;
  readingOrder?: string;
  sections?: string;
  statements?: string;
  inspect?: string;
}
export interface GraphViewProps {
  groups: GraphGroup[];
  edges: GraphConnection[];
  labels: GraphLabels;
  onSelect?: (node: GraphNode) => void;
  /** The node under the pointer or keyboard focus, or null when it leaves.
   *  Touch never hovers: a tap selects instead. Leaving waits a moment so
   *  moving between neighbouring nodes does not flicker through null. */
  onHover?: (node: GraphNode | null) => void;
  /** Inspect a supplied connection without navigating or toggling its endpoints. */
  onSelectConnection?: (edge: GraphConnection | null) => void;
  onToggleActions?: (group: GraphGroup) => void;
  /** A host can keep selection in the text while exposing its real source here. */
  renderDetail?: (node: GraphNode) => JSX.Element;
  direction?: 'ltr' | 'rtl';
  maxHeight?: string;
  controlsOnly?: boolean;
  initialFullscreen?: boolean;
  hideLegend?: boolean;
  /** Hosts can load a larger passage only when the reader opens it. */
  renderFullscreen?: (onClose: () => void) => JSX.Element;
}

function Canvas(
  props: GraphViewProps & {
    horizontal?: boolean;
    zoom?: number;
    inspected?: GraphNode | GraphConnection | null;
    onInspect: (node: GraphNode | GraphConnection | null) => void;
  },
): JSX.Element {
  let host!: HTMLDivElement;
  const [width, setWidth] = createSignal(360);
  let measure: ((text: string, bold: boolean) => number) | undefined;
  const [focus, setFocus] = createSignal<string | null>(null);
  onMount(() => {
    if (typeof CanvasRenderingContext2D !== 'undefined') {
      const context = document.createElement('canvas').getContext('2d');
      if (context)
        measure = (text, bold) => {
          context.font = `${bold ? 600 : 400} 13px system-ui`;
          return context.measureText(text).width;
        };
    }
    setWidth(host.clientWidth || 360);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setWidth(host.clientWidth || 360));
    observer.observe(host);
    onCleanup(() => observer.disconnect());
  });
  const layout = createMemo(() =>
    layoutGraph(props.groups, props.edges, width(), props.horizontal, measure),
  );
  const nodesById = createMemo(() => new Map(layout().nodes.map((node) => [node.node.id, node])));
  const edgesById = createMemo(() => new Map(layout().edges.map((edge) => [edge.edge.id, edge])));
  createEffect(() => {
    const id = focus();
    if (id && !nodesById().has(id) && !edgesById().has(id)) setFocus(null);
  });
  const selectedEdge = createMemo(() => {
    const item = props.inspected;
    if (!item || !('from' in item)) return undefined;
    const edge = edgesById().get(item.id)?.edge;
    return edge?.from === item.from && edge?.to === item.to ? edge : undefined;
  });
  createEffect(() => {
    if (props.inspected && 'from' in props.inspected && !selectedEdge()) props.onInspect(null);
  });
  const edgeLabel = (edge: GraphConnection) =>
    [
      nodesById().get(edge.from)?.node.label,
      edge.kindLabel || edge.label,
      nodesById().get(edge.to)?.node.label,
      edge.kindLabel && edge.label !== edge.kindLabel ? edge.label : undefined,
      edge.provenance,
    ]
      .filter(Boolean)
      .join(' · ');
  const zoom = () => props.zoom ?? 1;
  const connected = createMemo(() => {
    const f = selectedEdge()?.id ?? focus();
    if (!f) return null;
    const set = new Set([f]);
    const group = props.groups.find((g) => g.id === f);
    const direct = new Set([f, ...(group?.children ?? []).map((n) => n.id)]);
    for (const id of direct) set.add(id);
    for (const { edge } of layout().edges)
      if (edge.id === f || direct.has(edge.from) || direct.has(edge.to)) {
        set.add(edge.from);
        set.add(edge.to);
        set.add(edge.id);
      }
    for (const id of [...set]) {
      const owner = nodesById().get(id)?.group;
      if (owner) set.add(owner);
    }
    return set;
  });
  const faded = (id: string) => connected() && !connected()!.has(id);
  const hover = createHoverIntent<GraphNode>((node) => props.onHover?.(node));
  onCleanup(() => hover.dispose());
  const select = (n: GraphNode) => {
    props.onSelect?.(n);
    props.onInspect(n);
  };
  return (
    <div ref={host} class="ui-graph-viewport" style={{ 'max-height': props.maxHeight }}>
      <div
        style={{
          width: `${layout().width * zoom()}px`,
          height: `${layout().height * zoom()}px`,
          position: 'relative',
        }}
      >
        <div
          class="ui-graph-canvas"
          classList={{ horizontal: props.horizontal }}
          style={{
            width: `${layout().width}px`,
            height: `${layout().height}px`,
            transform: `scale(${zoom()})`,
          }}
        >
          <For each={layout().groups}>
            {(frame) => (
              <Show when={props.horizontal || frame.group.expanded}>
                <div
                  class="ui-graph-group"
                  style={{
                    left: `${frame.x}px`,
                    top: `${frame.y}px`,
                    width: `${frame.width}px`,
                    height: `${frame.height}px`,
                  }}
                />
              </Show>
            )}
          </For>
          <svg
            class="ui-graph-connections"
            width={layout().width}
            height={layout().height}
            aria-label={props.labels.title}
          >
            <For each={layout().edges.map(({ edge }) => edge.id)}>
              {(id) => {
                const edge = () => edgesById().get(id)!.edge;
                return (
                  <GraphEdge
                    edgeId={id}
                    path={edgesById().get(id)!.path}
                    color={edge().color}
                    dash={edge().dash}
                    label={edgeLabel(edge())}
                    arrow={edge().arrow}
                    opacity={faded(id) ? (selectedEdge() ? 0.45 : 0.18) : 0.9}
                    selected={selectedEdge()?.id === id}
                    highlighted={focus() === id}
                    onFocus={(yes) =>
                      setFocus((current) => (yes ? id : current === id ? null : current))
                    }
                    onSelect={() => props.onInspect(edge())}
                  />
                );
              }}
            </For>
          </svg>
          <For each={layout().nodes.map((p) => p.node.id)}>
            {(id) => {
              const p = () => nodesById().get(id)!;
              const group = () => props.groups.find((g) => g.id === p().group);
              return (
                <div
                  class="ui-graph-node-wrap"
                  dir={p().node.direction ?? 'auto'}
                  style={{
                    left: `${p().x}px`,
                    top: `${p().y}px`,
                    width: `${p().width}px`,
                    height: `${p().height}px`,
                    opacity: selectedEdge()
                      ? faded(p().node.id)
                        ? 0.65
                        : 1
                      : p().node.dimmed || faded(p().node.id)
                        ? 0.4
                        : 1,
                  }}
                >
                  <button
                    type="button"
                    class="ui-graph-node"
                    data-graph-node={p().node.id}
                    classList={{
                      header: p().header,
                      selected: p().node.selected,
                      action: p().action,
                      'has-summary': !!p().node.summary,
                      'connection-endpoint':
                        selectedEdge()?.from === id || selectedEdge()?.to === id,
                    }}
                    style={{
                      '--node-color': p().node.color ?? 'var(--graph-muted)',
                      '--badge-color': p().node.badgeColor ?? 'var(--graph-accent)',
                      '--connection-color': selectedEdge()?.color,
                    }}
                    dir={p().node.direction ?? 'auto'}
                    title={[p().node.role, p().node.label, p().node.detail || p().node.summary]
                      .filter(Boolean)
                      .join(' · ')}
                    aria-expanded={
                      p().header && group()?.children?.length && !props.horizontal
                        ? !!group()?.expanded
                        : undefined
                    }
                    onClick={() => select(p().node)}
                    onPointerEnter={(e) => {
                      setFocus(p().node.id);
                      if (e.pointerType !== 'touch') hover.enter(p().node, p().node.id);
                    }}
                    onPointerLeave={(e) => {
                      setFocus(null);
                      if (e.pointerType !== 'touch') hover.leave();
                    }}
                    onFocus={() => {
                      setFocus(p().node.id);
                      hover.enter(p().node, p().node.id);
                    }}
                    onBlur={() => {
                      setFocus(null);
                      hover.leave();
                    }}
                  >
                    <Show when={props.horizontal && p().header && p().node.reference}>
                      <span class="ui-graph-reference">{p().node.reference}</span>
                    </Show>
                    <Show when={props.horizontal && p().header && p().node.role}>
                      <span class="ui-graph-role">{p().node.role}</span>
                    </Show>
                    <span class="ui-graph-heading">
                      <Show when={p().node.badge}>
                        <span class="ui-graph-badge">{p().node.badge}</span>
                      </Show>
                      <Show when={p().node.role && (!props.horizontal || !p().header)}>
                        <span class="ui-graph-role">{p().node.role}</span>
                      </Show>
                      <span class="ui-graph-label" dir="auto">
                        {p().node.label}
                      </span>
                      <Show when={!props.horizontal && p().header && group()?.children?.length}>
                        <span class="ui-graph-disclose" aria-hidden="true">
                          {props.horizontal || group()?.expanded ? '−' : '+'}
                        </span>
                      </Show>
                    </span>
                    <Show when={props.horizontal && p().node.summary}>
                      <span class="ui-graph-summary" dir="auto">
                        {p().node.summary}
                      </span>
                    </Show>
                    <Show when={p().node.description}>
                      <span class="ui-graph-description" dir="auto">
                        {p().node.description}
                      </span>
                    </Show>
                    <Show when={p().node.annotation}>
                      <span class="ui-graph-annotation" dir="auto">
                        {p().node.annotation}
                      </span>
                    </Show>
                  </button>
                  <Show when={p().header && group()?.actions?.length}>
                    <button
                      type="button"
                      class="ui-graph-exits"
                      title={group()?.actionsLabel}
                      aria-label={group()?.actionsLabel}
                      aria-expanded={group()?.actionsExpanded}
                      onClick={() => props.onToggleActions?.(group()!)}
                    >
                      ↗ {group()?.actions?.length}
                    </button>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </div>
    </div>
  );
}

function createInspection(props: GraphViewProps) {
  const [selected, setSelected] = createSignal<GraphNode | GraphConnection | null>(null);
  const connection = createMemo(() => {
    const item = selected();
    if (!item || !('from' in item)) return undefined;
    const ids = new Set(
      props.groups.flatMap((g) =>
        [g, ...(g.children ?? []), ...(g.actions ?? [])].map((n) => n.id),
      ),
    );
    if (!ids.has(item.from) || !ids.has(item.to)) return undefined;
    return props.edges.find((e) => e.id === item.id && e.from === item.from && e.to === item.to);
  });
  const inspect = (item: GraphNode | GraphConnection | null) => {
    const previous = selected();
    setSelected(item);
    if (item && 'from' in item) props.onSelectConnection?.(item);
    else if (previous && 'from' in previous) props.onSelectConnection?.(null);
  };
  createEffect(() => {
    const item = selected();
    if (item && 'from' in item && !connection()) inspect(null);
  });
  onCleanup(() => {
    const item = selected();
    if (item && 'from' in item) props.onSelectConnection?.(null);
  });
  return { selected, connection, inspect };
}

function locateGraphItem(root: HTMLElement, kind: 'node' | 'edge', id: string) {
  const item = Array.from(root.querySelectorAll<HTMLElement>(`[data-graph-${kind}]`)).find(
    (node) => node.getAttribute(`data-graph-${kind}`) === id,
  );
  item?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' });
  item?.focus({ preventScroll: true });
}

function ConnectionDetails(props: {
  edge: GraphConnection;
  groups: GraphGroup[];
  labels: GraphLabels;
  direction?: 'ltr' | 'rtl';
  root: HTMLElement;
  onClear: () => void;
}): JSX.Element {
  const find = (id: string) => {
    for (const group of props.groups) {
      const node = [group, ...(group.children ?? []), ...(group.actions ?? [])].find(
        (node) => node.id === id,
      );
      if (node) return { ...node, reference: node.reference || group.reference };
    }
  };
  const ends = createMemo(() => {
    const from = find(props.edge.from),
      to = find(props.edge.to);
    return from && to ? { from, to } : undefined;
  });
  return (
    <Show when={ends()}>
      {(nodes) => (
        <GraphConnectionDetails
          edge={props.edge}
          from={nodes().from}
          to={nodes().to}
          clearLabel={props.labels.clearConnection}
          direction={props.direction}
          onLocate={(node) => locateGraphItem(props.root, 'node', node.id)}
          onClear={() => {
            const id = props.edge.id;
            props.onClear();
            locateGraphItem(props.root, 'edge', id);
          }}
        />
      )}
    </Show>
  );
}

export function GraphDialog(
  props: GraphViewProps & {
    onClose: () => void;
    toolbar?: JSX.Element;
    status?: JSX.Element;
    revealId?: string;
  },
): JSX.Element {
  let dialog!: HTMLDialogElement;
  const titleId = createUniqueId();
  const [horizontal, setHorizontal] = createSignal(true),
    [zoom, setZoom] = createSignal(1);
  const { selected, connection, inspect } = createInspection(props);
  const [sectionsOnly, setSectionsOnly] = createSignal(false);
  const shownGroups = () =>
    sectionsOnly() ? props.groups.map((g) => ({ ...g, children: [] })) : props.groups;
  const jumpTo = (id: string) => {
    const node = Array.from(dialog.querySelectorAll<HTMLElement>('[data-graph-node]')).find(
      (n) => n.dataset.graphNode === id,
    );
    node?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' });
    node?.focus({ preventScroll: true });
  };
  createEffect(() => {
    const id = props.revealId;
    if (id)
      queueMicrotask(() => {
        if (dialog?.open) jumpTo(id);
      });
  });
  const legend = () => [
    ...new Map(
      props.edges
        .filter((e) => e.kindLabel)
        .map((e) => [e.kindLabel, { label: e.kindLabel!, color: e.color, dash: e.dash }]),
    ).values(),
  ];
  const clamp = (n: number) => Math.max(0.25, Math.min(2, n));
  onMount(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    dialog.querySelector<HTMLButtonElement>('.ui-graph-close')?.focus();
    onCleanup(() => {
      dialog.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    });
  });
  const fit = () => {
    const viewport = dialog.querySelector('.ui-graph-viewport') as HTMLElement | null;
    const canvas = dialog.querySelector('.ui-graph-canvas') as HTMLElement | null;
    if (viewport && canvas)
      setZoom(
        clamp(
          Math.min(
            (viewport.clientWidth - 24) / canvas.offsetWidth,
            (viewport.clientHeight - 24) / canvas.offsetHeight,
          ),
        ),
      );
  };
  return (
    <Portal>
      <dialog
        ref={dialog}
        class="ui-graph-dialog"
        aria-labelledby={titleId}
        onKeyDown={(e) => e.stopPropagation()}
        onCancel={(e) => {
          e.preventDefault();
          props.onClose();
        }}
      >
        <header class="ui-graph-toolbar" dir={props.direction}>
          <strong id={titleId}>{props.labels.title}</strong>
          {props.toolbar}
          <div class="ui-graph-toggle">
            <button
              type="button"
              aria-pressed={!horizontal()}
              onClick={() => {
                setHorizontal(false);
                setZoom(1);
              }}
            >
              {props.labels.vertical}
            </button>
            <button
              type="button"
              aria-pressed={horizontal()}
              onClick={() => {
                setHorizontal(true);
                setZoom(1);
              }}
            >
              {props.labels.horizontal}
            </button>
          </div>
          <button
            type="button"
            aria-label={props.labels.zoomOut}
            onClick={() => setZoom((z) => clamp(z / 1.2))}
          >
            −
          </button>
          <button type="button" class="ui-graph-scale" onClick={() => setZoom(1)}>
            {Math.round(zoom() * 100)}%
          </button>
          <button
            type="button"
            aria-label={props.labels.zoomIn}
            onClick={() => setZoom((z) => clamp(z * 1.2))}
          >
            +
          </button>
          <button type="button" onClick={fit}>
            {props.labels.fit}
          </button>
          <button
            type="button"
            class="ui-graph-close"
            aria-label={props.labels.close}
            onClick={props.onClose}
          >
            ×
          </button>
        </header>
        <nav
          class="ui-graph-passage-nav"
          aria-label={props.labels.readingOrder}
          dir={props.direction}
        >
          <span>{props.labels.readingOrder}</span>
          <div class="ui-graph-chapters">
            <For each={props.groups}>
              {(g, i) => (
                <>
                  <Show
                    when={
                      g.reference && (i() === 0 || props.groups[i() - 1].reference !== g.reference)
                    }
                  >
                    <span class="ui-graph-page-label">{g.reference}</span>
                  </Show>
                  <button
                    type="button"
                    aria-label={[g.reference, g.badge, g.label].filter(Boolean).join(' · ')}
                    title={g.label}
                    onClick={() => jumpTo(g.id)}
                  >
                    {g.badge || g.label}
                  </button>
                </>
              )}
            </For>
          </div>
          <Show when={props.groups.some((g) => g.children?.length)}>
            <button
              type="button"
              aria-pressed={sectionsOnly()}
              onClick={() => setSectionsOnly((s) => !s)}
            >
              {sectionsOnly() ? props.labels.statements : props.labels.sections}
            </button>
          </Show>
        </nav>
        {props.status}
        <Canvas
          {...props}
          groups={shownGroups()}
          horizontal={horizontal()}
          zoom={zoom()}
          maxHeight="none"
          inspected={selected()}
          onInspect={inspect}
        />
        <Show
          when={connection()}
          fallback={
            <footer class="ui-graph-map-key" dir={props.direction}>
              <GraphLegend items={legend()} />
              <span>{props.labels.inspect}</span>
            </footer>
          }
        >
          {(edge) => (
            <ConnectionDetails
              {...props}
              edge={edge()}
              root={dialog}
              onClear={() => inspect(null)}
            />
          )}
        </Show>
        <Show when={selected() && !('from' in selected()!) ? (selected() as GraphNode) : undefined}>
          {(item) => (
            <aside class="ui-graph-detail" dir={props.direction}>
              <strong>{item().label}</strong>
              <Show when={'reference' in item()}>
                <p>{(item() as GraphNode).reference}</p>
              </Show>
              <Show when={(item() as GraphNode).detail || (item() as GraphNode).summary}>
                <p dir="auto">{(item() as GraphNode).detail || (item() as GraphNode).summary}</p>
              </Show>
              <Show when={props.renderDetail && !('from' in item())}>
                {props.renderDetail?.(item() as GraphNode)}
              </Show>
            </aside>
          )}
        </Show>
      </dialog>
    </Portal>
  );
}

export function GraphLegend(props: {
  items: Array<Pick<GraphConnection, 'label' | 'color' | 'dash'>>;
}): JSX.Element {
  return (
    <Show when={props.items.length}>
      <div class="ui-graph-legend">
        <For each={props.items}>
          {(item) => (
            <span>
              <i
                aria-hidden="true"
                style={{ 'border-top': `1.5px ${item.dash ? 'dashed' : 'solid'} ${item.color}` }}
              />
              {item.label}
            </span>
          )}
        </For>
      </div>
    </Show>
  );
}

/** Same graph and callbacks in both views. The modal always starts horizontal. */
export function GraphView(props: GraphViewProps): JSX.Element {
  let root!: HTMLElement;
  const [fullscreen, setFullscreen] = createSignal(!!props.initialFullscreen);
  const legend = createMemo(() => [
    ...new Map(
      props.edges
        .filter((e) => e.kindLabel)
        .map((e) => [
          `${e.kindLabel}:${e.color}:${e.dash}`,
          { label: e.kindLabel!, color: e.color, dash: e.dash },
        ]),
    ).values(),
  ]);
  const { selected, connection, inspect } = createInspection(props);
  return (
    <Show when={props.groups.length}>
      <section ref={root} class="ui-graph-view">
        <div class="ui-graph-inline-toolbar" dir={props.direction}>
          <button
            type="button"
            aria-label={props.labels.expand}
            onClick={() => {
              inspect(null);
              setFullscreen(true);
            }}
          >
            {props.labels.expand} ↗
          </button>
        </div>
        <Show when={!props.controlsOnly}>
          <Canvas
            {...props}
            inspected={selected()}
            onInspect={inspect}
            maxHeight={props.maxHeight ?? '520px'}
          />
        </Show>
        <Show
          when={connection()}
          fallback={
            <Show when={!props.hideLegend && !props.controlsOnly}>
              <GraphLegend items={legend()} />
            </Show>
          }
        >
          {(edge) => (
            <ConnectionDetails {...props} edge={edge()} root={root} onClear={() => inspect(null)} />
          )}
        </Show>
        <Show when={fullscreen()}>
          <Show
            when={props.renderFullscreen}
            fallback={<GraphDialog {...props} onClose={() => setFullscreen(false)} />}
          >
            {props.renderFullscreen?.(() => setFullscreen(false))}
          </Show>
        </Show>
      </section>
    </Show>
  );
}
